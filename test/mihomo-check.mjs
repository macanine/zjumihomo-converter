#!/usr/bin/env node
/**
 * 用真实的 mihomo 内核校验产出的配置。
 *
 * 这是最权威的一道检查：语法检查器只能发现格式问题，而 mihomo 会真正
 * 检查规则类型是否受支持、策略组是否存在——之前「规则里策略组名放错位置」
 * 和「URL-REGEX 已不被支持」这两个问题，都只有内核能发现。
 *
 * 需要本机装有 mihomo（Clash Verge 自带）。找不到内核时跳过，不让 CI 失败。
 *
 * 用法：npm run test:mihomo（需要能访问 ACL4SSR，会真实拉取规则）
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WORKER = path.join(ROOT, 'dist/_worker.js');

// 常见的内核位置
const CANDIDATES = [
  process.env.MIHOMO,
  '/Applications/Clash Verge.app/Contents/MacOS/verge-mihomo',
  '/Applications/Clash Verge.app/Contents/MacOS/verge-mihomo-alpha',
  '/usr/local/bin/mihomo',
  '/opt/homebrew/bin/mihomo',
].filter(Boolean);
const MIHOMO = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

if (!MIHOMO) {
  console.log('未找到 mihomo 内核，跳过内核校验。');
  console.log('（设置 MIHOMO 环境变量指向内核可启用）');
  process.exit(0);
}

// 内核需要 geoip.dat / geosite.dat 所在目录
const DATA_DIRS = [
  process.env.MIHOMO_DATA,
  path.join(os.homedir(), 'Library/Application Support/io.github.clash-verge-rev.clash-verge-rev'),
  path.join(os.homedir(), '.config/mihomo'),
  '/etc/mihomo',
].filter(Boolean);
const DATA_DIR = DATA_DIRS.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || os.tmpdir();

if (!fs.existsSync(WORKER)) {
  console.error('找不到 dist/_worker.js，请先运行 npm run build');
  process.exit(1);
}

const worker = (await import('file://' + WORKER)).default;
const b64 = (s) => Buffer.from(s).toString('base64');
const NODES = [
  'ss://' + b64('aes-256-gcm:password') + '@1.2.3.4:8388#香港节点',
  'vmess://' + b64(JSON.stringify({ v: '2', ps: '日本节点', add: '2.2.2.2', port: '443', id: 'uuid-1', aid: '0', net: 'ws', path: '/p', host: 'h.com', tls: 'tls' })),
  'trojan://pw@3.3.3.3:443?sni=a.com#美国节点',
  'vless://uuid-v@4.4.4.4:443?security=reality&pbk=Y8wQvGZ0mJk2XrT7bN4pLd9cFhS6aVe1oUi3yWqZx5E&sid=a1b2&flow=xtls-rprx-vision&type=tcp&sni=www.apple.com#新加坡节点',
  'hysteria2://pass@6.6.6.6:443?sni=b.com#台湾节点',
].join('\n');

const quiet = () => {};
const realLog = console.log, realErr = console.error;

async function gen(extra) {
  console.log = quiet; console.error = quiet;
  try {
    const r = await worker.fetch(
      new Request('https://example.com/sub/sub?target=clash&' + extra + '&url=' + encodeURIComponent(NODES)),
      {}, {});
    return await r.text();
  } finally {
    console.log = realLog; console.error = realErr;
  }
}

/** 用内核校验一份配置；返回 null 表示通过，否则返回错误信息 */
function validate(yamlText) {
  const tmp = path.join(os.tmpdir(), 'zjumihomo-check-' + process.pid + '.yaml');
  fs.writeFileSync(tmp, yamlText);
  try {
    const out = execFileSync(MIHOMO, ['-t', '-f', tmp, '-d', DATA_DIR], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    });
    return /test is successful/.test(out) ? null : '内核未报告 successful';
  } catch (e) {
    const text = (e.stderr || '') + (e.stdout || '');
    const errs = text.split('\n').filter((l) => l.includes('level=error')).slice(0, 3);
    return errs.length ? errs.map((l) => l.replace(/^.*level=error msg=/, '').trim()).join('; ') : '内核校验失败';
  } finally {
    try { fs.unlinkSync(tmp); } catch { }
  }
}

const PRESETS = ['mini', 'mini_adblock', 'mini_multi', 'mini_multicountry',
  'full', 'full_adblock', 'full_netflix'];

console.log(`使用内核: ${MIHOMO}`);
console.log(`数据目录: ${DATA_DIR}`);
console.log('');

let pass = 0;
const failures = [];

// 1. 各预设
for (const p of PRESETS) {
  const err = validate(await gen('rules=' + p));
  if (err) failures.push(`rules=${p}: ${err}`);
  else pass++;
}

// 2. 参数组合
const combos = [
  ['udp/tfo', 'udp=1&tfo=1'],
  ['dns=2', 'dns=2'],
  ['dns=0', 'dns=0'],
  // 老的订阅链接里可能还留着端口/密钥参数，忽略掉之后配置仍须合法
  ['遗留端口参数', 'mp=1080&sp=1081&secret=abc123'],
  ['关闭覆写', 'ovr=0'],
];
for (const [label, q] of combos) {
  const err = validate(await gen(q));
  if (err) failures.push(`${label}: ${err}`);
  else pass++;
}

// 3. 远端不可达时的兜底规则（必须也是合法配置）
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  const err = validate(await gen('rules=mini'));
  globalThis.fetch = realFetch;
  if (err) failures.push(`兜底规则: ${err}`);
  else pass++;
}

const total = pass + failures.length;
if (failures.length) {
  console.error(`内核校验失败：${pass}/${total} 通过\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log(`内核校验通过：${pass}/${total} 份配置均被 mihomo 接受`);

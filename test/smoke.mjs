#!/usr/bin/env node
/**
 * 构建产物的冒烟测试。
 *
 * 不依赖 Cloudflare 运行时：直接 import dist/_worker.js，喂它构造好的 Request，
 * 检查路由、协议解码、配置生成和响应头。目的是让「产物还能用」这件事可重复验证，
 * 而不是每次改完代码手动 curl 一遍。
 *
 * 只留会挡住真 bug 的断言：格式约定（规则组名位置、Content-Disposition 编码）、
 * 顺序前提（覆写置顶、google 关键字不抢流媒体、兜底默认走代理）、以及会崩或
 * 静默失效的行为。页面结构、状态码之类的形状检查不在这里锁——改版就红，没有价值。
 *
 * 用法：npm test（会先自动构建）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WORKER = path.join(ROOT, 'dist/_worker.js');

if (!fs.existsSync(WORKER)) {
  console.error('找不到 dist/_worker.js，请先运行 npm run build');
  process.exit(1);
}

const worker = (await import('file://' + WORKER)).default;

const b64 = (s) => Buffer.from(s).toString('base64');
const KEY = 'sub';   // 默认密钥（可在 src/core/globals.js 改）

let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; return; }
  failures.push(name + (detail ? ' —— ' + detail : ''));
}

/**
 * 构造一次请求。
 *
 * 规则一律从远端拉取，所以默认就装一个规则桩，让测试离线且确定。
 * upstream 用于覆盖它（例如模拟订阅链接、或模拟拉取失败）。
 */
const RULES_INI = [
  '[custom]',
  'ruleset=🎯 全球直连,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list',
  'ruleset=🛑 全球拦截,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list',
  'ruleset=🎯 全球直连,[]GEOIP,CN',
  'ruleset=🐟 漏网之鱼,[]FINAL',
].join('\n');
const RULES_LISTS = {
  'UnBan.list': '# 注释\nDOMAIN-SUFFIX,lan\n\nDOMAIN-SUFFIX,local\n',
  'BanAD.list': 'DOMAIN-KEYWORD,admarvel\n# 注释行\nDOMAIN-KEYWORD,admaster\n',
};
// .ini 地址按用例区分，避免命中模块级缓存
const iniUrl = (n) => 'https://rules.example.com/case' + n + '.ini';
const rulesStub = async (req) => {
  const u = typeof req === 'string' ? req : req.url;
  if (u.endsWith('.ini')) return new Response(RULES_INI, { status: 200, headers: { 'content-type': 'text/plain' } });
  for (const [name, body] of Object.entries(RULES_LISTS)) {
    if (u.endsWith(name)) return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('not found', { status: 404 });
};

async function request(pathname, { ua, upstream, env } = {}) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = upstream || rulesStub;
  const realLog = console.log, realErr = console.error, realWarn = console.warn;
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try {
    const init = ua ? { headers: { 'User-Agent': ua } } : {};
    const res = await worker.fetch(new Request('https://example.com' + pathname, init), env || {}, {});
    return { status: res.status, headers: res.headers, body: await res.text() };
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog; console.error = realErr; console.warn = realWarn;
  }
}

const NODES = [
  'ss://' + b64('aes-256-gcm:password') + '@1.2.3.4:8388#ss节点',
  'ssr://' + Buffer.from('9.9.9.9:8388:auth_aes128_md5:aes-256-cfb:tls1.2_ticket_auth:cGFzcw/?remarks=bm9kZQ').toString('base64url'),
  'vmess://' + b64(JSON.stringify({ v: '2', ps: 'vmess节点', add: '2.2.2.2', port: '443', id: 'uuid-1', aid: '0', net: 'ws', path: '/p', host: 'h.com', tls: 'tls' })),
  'trojan://pw@3.3.3.3:443?sni=a.com&type=ws&path=%2Fws#trojan节点',
  'vless://uuid-v@4.4.4.4:443?security=reality&pbk=Y8wQvGZ0mJk2XrT7bN4pLd9cFhS6aVe1oUi3yWqZx5E&sid=a1b2&flow=xtls-rprx-vision&type=tcp&sni=www.apple.com#vless节点',
  'hysteria://5.5.5.5:443?peer=a.com&auth=xyz&insecure=1#hysteria节点',
  'hysteria2://pass@6.6.6.6:443?sni=b.com#hysteria2节点',
];
// caseNo 用于切换 .ini 地址，避免不同用例命中模块级规则缓存
const sub = (list, caseNo = 0) =>
  '/' + KEY + '/sub?target=clash&url=' + encodeURIComponent(list.join('\n')) +
  '&rules=' + encodeURIComponent(iniUrl(caseNo));

/* ── 路由 ── */
{
  const r = await request('/');
  check('根路径返回伪装页',
    r.status === 200 && r.body.includes('Welcome to nginx') && r.headers.get('server') === 'nginx/1.18.0 (Ubuntu)',
    'status=' + r.status + ' server=' + r.headers.get('server'));
}
{
  const r = await request('/' + KEY);
  check('表单页可访问', r.status === 200 && r.body.includes('订阅转换'), 'status=' + r.status);
}
{
  // 密钥是唯一的访问控制，加密钥后默认值必须立刻失效
  const r = await request('/' + KEY + '/sub?target=clash&url=' + encodeURIComponent(NODES[0]), { env: { key: 'mykey' } });
  check('密钥不对时 404', r.status === 404, 'status=' + r.status);
}

/* ── 转换接口 ── */
{
  const r = await request(sub(NODES));
  const missing = ['ss节点', 'vmess节点', 'trojan节点', 'vless节点', 'hysteria节点', 'hysteria2节点']
    .filter((n) => !r.body.includes(n));
  check('六种协议的节点都能转出来', r.status === 200 && missing.length === 0,
    'status=' + r.status + ' 缺少 ' + missing.join(', '));
  check('产出含策略组与终结规则',
    r.body.includes('🚀 节点选择') && /MATCH,🐟 漏网之鱼/.test(r.body), '缺少策略组或 MATCH');
}
{
  const r = await request('/' + KEY + '/sub?target=singbox&url=' + encodeURIComponent(NODES[0]));
  check('不支持的 target 返回 403', r.status === 403, 'status=' + r.status);
}
{
  const r = await request(sub(['not-a-valid-node']));
  check('无效节点返回 404', r.status === 404, 'status=' + r.status);
}
{
  // 缺少 url 参数时应在解析节点前就返回 404，而不是在 u.replaceAll 上崩掉
  const r = await request('/' + KEY + '/sub?target=clash');
  check('缺少 url 参数返回 404 而非崩溃', r.status === 404, 'status=' + r.status);
}
{
  // 流量信息透传，格式要原样交给客户端
  const r = await request(sub(['https://sub.example.com/x']), {
    upstream: async () => new Response(NODES[0], {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        'subscription-userinfo': 'upload=100; download=200; total=1000; expire=1800000000',
      },
    }),
  });
  const info = r.headers.get('subscription-userinfo');
  check('透传流量信息响应头', info === 'upload=100; download=200; total=1000; expire=1800000000', 'userinfo=' + info);
}
{
  // 订阅链接形式
  const r = await request(sub(['https://sub.example.com/x']), {
    upstream: async () => new Response(NODES.slice(0, 3).join('\n'), {
      status: 200, headers: { 'content-type': 'text/plain' },
    }),
  });
  check('订阅链接可拉取并转换', r.status === 200 && r.body.includes('ss节点'), 'status=' + r.status);
}
{
  // base64 订阅内容
  const r = await request(sub([b64(NODES.slice(0, 3).join('\n'))]));
  check('base64 订阅内容可解析', r.status === 200 && r.body.includes('ss节点'), 'status=' + r.status);
}
{
  // 列表模式
  const r = await request(sub(NODES.slice(0, 2)) + '&list=true');
  check('列表模式只输出 proxies', r.status === 200 && r.body.includes('proxies:') && !r.body.includes('proxy-groups:'), 'status=' + r.status);
}
{
  // 端口和 UI 密钥已不再开放：这些参数必须被忽略，否则等于给了半套配置入口
  const r = await request(sub(NODES) + '&udp=1&tfo=1&mp=1080&dns=0&secret=mysecret');
  check('dns=0 移除 dns 段', !/^dns:/m.test(r.body), '仍存在 dns 段');
  check('端口和密钥参数被忽略',
    r.body.includes('mixed-port: 7890') && !r.body.includes('mixed-port: 1080') && !r.body.includes('mysecret'),
    '端口或密钥参数仍然生效');
}
{
  // 去重
  const dup = [
    'ss://' + b64('aes-256-gcm:a') + '@1.1.1.1:1111#同名',
    'ss://' + b64('aes-256-gcm:b') + '@2.2.2.2:2222#同名',
    'ss://' + b64('aes-256-gcm:c') + '@1.1.1.1:1111#另一个',
  ];
  const r = await request(sub(dup));
  check('相同 server:port 被去重', r.status === 200 && !r.body.includes('另一个'), '去重未生效');
}
{
  const r = await request('/mykey/sub?target=clash&url=' + encodeURIComponent(NODES[0]), { env: { key: 'mykey' } });
  check('环境变量覆盖默认密钥', r.status === 200, 'status=' + r.status);
}

/* ── 订阅命名（Content-Disposition）──
 * 客户端（Clash Verge / Mihomo Party / ClashX）导入订阅时都用这个响应头给配置命名，
 * 没有它就只剩 URL 末段「sub」当名字。名字来源按可信度：上游文件名 → 订阅链接末段 → 主机名。
 * 这里的格式细节都是踩过的坑，改 sub-name.js 前先看这段。 */
{
  // 上游响应头里的文件名最可信（机场自己起的名）。
  // 中文名只能走 RFC 5987 的 filename*：filename= 里放不下非 ASCII 字符。
  const upstream = async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.includes('airport.example.com')) {
      return new Response(NODES[0], {
        status: 200,
        headers: {
          'content-type': 'text/plain',
          'content-disposition': "attachment; filename=\"x.yaml\"; filename*=UTF-8''%E6%9C%BA%E5%9C%BA%E7%94%B2",
        },
      });
    }
    return rulesStub(req);
  };
  const r = await request(sub(['https://airport.example.com/api/v1/client/subscribe?token=x']), { upstream });
  const cd = r.headers.get('content-disposition') || '';
  check('订阅名取自上游文件名', cd.includes("filename*=UTF-8''%E6%9C%BA%E5%9C%BA%E7%94%B2"), 'cd=' + cd);
  check('非 ASCII 名不写进 filename=', /filename="[0-9A-Za-z.-]+"/.test(cd), 'cd=' + cd);
}
{
  const upstream = async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.includes('airport.example.com')) {
      return new Response(NODES[0], { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return rulesStub(req);
  };
  const r = await request(sub(['https://airport.example.com/link/MyAirport2026?token=x']), { upstream });
  check('订阅名退到订阅链接末段',
    /filename\*=UTF-8''MyAirport2026/.test(r.headers.get('content-disposition') || ''),
    'cd=' + r.headers.get('content-disposition'));
  // 末段是 /api/v1/client/subscribe 这类通用端点名，没有信息量，改用主机名
  const r2 = await request(sub(['https://airport.example.com/api/v1/client/subscribe?token=x']), { upstream });
  check('末段无信息量时用主机名',
    /filename\*=UTF-8''airport\.example\.com/.test(r2.headers.get('content-disposition') || ''),
    'cd=' + r2.headers.get('content-disposition'));
}
{
  // 名字会变成客户端里的文件名，路径分隔符和单引号必须处理干净：
  // 前者能写到配置目录之外，后者会被客户端按 charset'' 切分时切坏
  const upstream = async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.includes('airport.example.com')) {
      return new Response(NODES[0], {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="../../Bob\'s/airport"' },
      });
    }
    return rulesStub(req);
  };
  const r = await request(sub(['https://airport.example.com/link/x']), { upstream });
  const cd = r.headers.get('content-disposition') || '';
  check('名字里的路径分隔符和单引号被处理干净',
    cd.length > 0 && !cd.includes('..') && !cd.includes('/') && !/filename\*=UTF-8''[^;]*'/.test(cd),
    'cd=' + cd);
}
{
  // 直接粘节点/内容时没有来源名字，就不编一个，交给客户端自己的兜底规则
  const r = await request(sub(NODES.slice(0, 2)));
  check('无来源名字时不发 Content-Disposition', r.headers.get('content-disposition') === null,
    'cd=' + r.headers.get('content-disposition'));
}

/* ── 分流规则：ACL4SSR 运行时拉取 ──
 * 这里用桩 fetch 模拟 ACL4SSR 的分发结构（.ini 引用 .list），
 * 让测试离线可跑，同时验证解析、组名过滤和失败回退。
 * 注意：拉取结果按选择器缓存，所以每个用例用不同的 .ini 地址当选择器，
 * 避免互相命中缓存。 */
{
  const stubFor = (ini, lists) => async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.endsWith('.ini')) return new Response(ini, { status: 200, headers: { 'content-type': 'text/plain' } });
    for (const [name, body] of Object.entries(lists)) {
      if (u.endsWith(name)) return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  };

  // 正常拉取：两条 ruleset 引用文件 + 两条内联规则
  const ini1 = [
    '[custom]',
    'ruleset=🎯 全球直连,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list',
    'ruleset=🛑 全球拦截,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list',
    'ruleset=🎯 全球直连,[]GEOIP,CN',
    'ruleset=🐟 漏网之鱼,[]FINAL',
  ].join('\n');
  const stub1 = stubFor(ini1, {
    'UnBan.list': '# 注释\nDOMAIN-SUFFIX,lan\n\nDOMAIN-SUFFIX,local\n',
    'BanAD.list': 'DOMAIN-KEYWORD,admarvel\n# 注释行\nDOMAIN-KEYWORD,admaster\n',
  });
  const r = await request(sub(NODES.slice(0, 2), 1), { upstream: stub1 });
  // Clash 规则格式是 类型,参数,策略组 —— 组名在参数之后，不能在行首
  check('注入 .list 规则且组名在参数之后',
    r.status === 200 &&
    /DOMAIN-SUFFIX,lan,🎯 全球直连/.test(r.body) &&
    /DOMAIN-KEYWORD,admarvel,🛑 全球拦截/.test(r.body),
    'UnBan 或 BanAD 的规则格式不对');
  check('内联 GEOIP,CN 格式正确', /GEOIP,CN,🎯 全球直连/.test(r.body), 'GEOIP 规则格式不对');
  check('内联 FINAL 转为 MATCH', /MATCH,🐟 漏网之鱼/.test(r.body), 'FINAL 未正确转成 MATCH');
  check('注释行被过滤', !r.body.includes('注释行'), '注释未被过滤');

  // 引用了不存在的策略组 → 必须丢掉，否则 mihomo 拒绝加载整份配置
  const ini2 = '[custom]\nruleset=不存在的组,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list\nruleset=🎯 全球直连,[]GEOIP,CN\n';
  const r2 = await request(sub(NODES.slice(0, 2), 2), {
    upstream: stubFor(ini2, { 'UnBan.list': 'DOMAIN-SUFFIX,lan\n' }),
  });
  check('未知策略组的规则被过滤，有效规则保留',
    r2.body.includes('GEOIP,CN') && !r2.body.includes('不存在的组'), '未知组未被过滤或有效规则被误删');

  // 拉取失败 → 用最小兜底规则，而不是整个转换失败
  const r3 = await request(sub(NODES.slice(0, 2), 3), {
    upstream: async () => new Response('boom', { status: 500 }),
  });
  check('拉取失败时回退最小兜底规则',
    r3.status === 200 && /MATCH,🐟 漏网之鱼/.test(r3.body) && /GEOIP,CN,🎯 全球直连/.test(r3.body),
    'status=' + r3.status);

  // list 模式不拉规则（只输出节点）
  const r4 = await request(sub(NODES.slice(0, 2)) + '&list=true', {
    upstream: async () => new Response('boom', { status: 500 }),
  });
  check('list 模式不拉取规则', r4.status === 200 && !r4.body.includes('rules:'), 'list 模式不应含 rules');
}

/* ── 内置分流规则（rules=builtin）──
 * 内置表在源码里（src/rules/builtin.js），不需要网络。这里用一个「调用就记一笔」
 * 的 fetch 证明它确实没发请求，并锁住这张表的设计前提：只列「目标与兜底不同」的
 * 规则，其余交给兜底；所以兜底组必须默认走代理，否则那些没列出来的站点会被漏成直连。 */
{
  let calls = 0;
  const spy = async () => { calls++; return new Response('boom', { status: 500 }); };
  const r = await request(
    '/' + KEY + '/sub?target=clash&rules=builtin&url=' + encodeURIComponent(NODES.slice(0, 2).join('\n')),
    { upstream: spy });
  check('内置规则离线可用且不发网络请求', r.status === 200 && calls === 0, 'status=' + r.status + ' 发了 ' + calls + ' 次请求');

  const yaml = await import('js-yaml').then(m => m.default.load(r.body));
  const groups = new Map(yaml['proxy-groups'].map(g => [g.name, g]));

  // googlevideo.com 串里也含 "google"，而 AI 段末尾正是 DOMAIN-KEYWORD,google。
  // 两段顺序颠倒的话 YouTube 会被 AI 组抢走，所以这条要盯住。
  check('内置规则：google 关键字不抢流媒体',
    yaml.rules.indexOf('DOMAIN-SUFFIX,googlevideo.com,🌍 国外媒体') <
    yaml.rules.indexOf('DOMAIN-KEYWORD,google,🤖 AI 研究'),
    'googlevideo 排在 google 关键字之后，会被 AI 组抢走');

  // 「其余交给兜底」这件事得成立：代理类类别不再逐条列举
  const listed = ['github.com', 'apple.com', 'microsoft.com', 'steamcommunity.com', 'telegram.org']
    .filter(d => yaml.rules.some(x => x.startsWith('DOMAIN-SUFFIX,' + d + ',')));
  check('内置规则：不逐条列举代理类站点', listed.length === 0,
    listed.join(', ') + ' 仍在表里，这类应该交给兜底');

  check('内置规则：兜底组排在最后', yaml.rules[yaml.rules.length - 1] === 'MATCH,🐟 漏网之鱼',
    '末条为 ' + yaml.rules[yaml.rules.length - 1]);
  check('内置规则：兜底默认走代理',
    groups.get('🐟 漏网之鱼').proxies[0] === '🚀 节点选择',
    '兜底组默认是 ' + groups.get('🐟 漏网之鱼').proxies[0] + '，未匹配的流量会被漏成直连');

  // 规则的目标必须存在，否则 mihomo 拒绝加载整份配置。逐条解析后判断，
  // 而不是按文本匹配——文本匹配会把策略组名那一段漏掉。
  const names = new Set(groups.keys());
  const builtin = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL']);
  const OPTIONS = ['no-resolve', 'src', 'dns-failed', 'extended'];
  const dangling = yaml.rules.filter(x => {
    const p = x.split(',').map(s => s.trim());
    let i = p.length - 1;
    while (i >= 0 && OPTIONS.includes(p[i].toLowerCase())) i--;
    return !(names.has(p[i]) || builtin.has(p[i]));
  });
  check('内置规则的目标都存在', dangling.length === 0, '悬空规则 ' + dangling.slice(0, 3).join(' | '));
  // 上限是故意卡的：这张表只该有「直连 + 单独挑节点」两类，涨回上千条说明又跑偏了
  check('内置规则条数在 100~400 之间',
    yaml.rules.length > 100 && yaml.rules.length < 400, '实际 ' + yaml.rules.length + ' 条');
  // 覆写规则置顶后，校内域名必须比内置表里的 edu.cn 更早命中
  check('内置规则下校园网规则仍置顶',
    yaml.rules[0] === 'DOMAIN,vpn.zju.edu.cn,DIRECT' &&
    yaml.rules.indexOf('DOMAIN-SUFFIX,zju.edu.cn,🏫 校园网') < yaml.rules.indexOf('DOMAIN-SUFFIX,edu.cn,🎯 全球直连'),
    '校园网规则未排在 edu.cn 之前');
}
{
  // 不传 rules 时默认走内置表：同样不该有任何网络请求
  let calls = 0;
  const spy = async () => { calls++; return new Response('boom', { status: 500 }); };
  const r = await request(
    '/' + KEY + '/sub?target=clash&url=' + encodeURIComponent(NODES.slice(0, 2).join('\n')),
    { upstream: spy });
  check('不传 rules 时默认用内置规则且不联网',
    r.status === 200 && calls === 0 && r.body.includes('DOMAIN-SUFFIX,baidu.com,🎯 全球直连'),
    '未使用内置规则，或发了 ' + calls + ' 次请求');
}

/* ── 校园网覆写（zju-override.yaml）──
 * 覆写在模块加载时就内联成常量，所以这里用默认路径（caseNo 0）即可。 */
{
  const r = await request(sub(NODES.slice(0, 2)));
  check('覆写：注入指向本机 1090 的 ZJUconnect 节点',
    /name: ZJUconnect/.test(r.body) && /server: 127\.0\.0\.1/.test(r.body) && /port: 1090/.test(r.body),
    '未找到 ZJUconnect 或地址端口不对');
  // 置顶必须早于远端拉回来的第一条规则（桩里的 UnBan.list）
  check('覆写：规则置顶在远端规则之前',
    r.body.indexOf('DOMAIN,vpn.zju.edu.cn,DIRECT') < r.body.indexOf('DOMAIN-SUFFIX,lan,🎯 全球直连'),
    '校园网规则未排在远端规则之前');
  check('覆写：浙大与 cc98 域名走校园网',
    /DOMAIN-SUFFIX,zju\.edu\.cn,🏫 校园网/.test(r.body) && /DOMAIN-SUFFIX,cc98\.org,🏫 校园网/.test(r.body),
    'zju.edu.cn 或 cc98.org 规则缺失');

  // 校园网组只能含 ZJUconnect 和 DIRECT，不能被自动塞入订阅节点
  // 精确解析而非按字符切片：校园网组置顶后，后面的组本身就含节点名
  const yaml = await import('js-yaml').then(m => m.default.load(r.body));
  const zju = yaml['proxy-groups'].find(g => g.name === '🏫 校园网');
  check('覆写：校园网组置顶且只含 DIRECT 和 ZJUconnect',
    yaml['proxy-groups'][0].name === '🏫 校园网' &&
    JSON.stringify(zju.proxies) === JSON.stringify(['DIRECT', 'ZJUconnect']),
    '实际为 ' + JSON.stringify(zju.proxies));
}
{
  const r = await request(sub(NODES.slice(0, 2)) + '&ovr=0');
  check('ovr=0 关闭覆写', !r.body.includes('ZJUconnect') && !r.body.includes('校园网'), '覆写仍然生效');
}

/* ── api.v1.mk 中继 ──
 * relay=1 时把订阅链接交给 api.v1.mk 转，结果原样交给客户端；它那边出问题就落回
 * 本地转换。这里用桩 fetch 扮演 api.v1.mk，检查我们发过去的参数和透传的响应头。 */
{
  let seen = null;
  const upstream = async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.startsWith('https://api.v1.mk/sub')) {
      seen = u;
      return new Response('proxies:\n  - name: 中继节点\n    type: socks5\n', {
        status: 200,
        headers: {
          'content-type': 'text/yaml',
          'subscription-userinfo': 'upload=1; download=2; total=3; expire=4',
        },
      });
    }
    return rulesStub(req);
  };
  const r = await request(sub(['https://airport.example.com/link/x']) + '&relay=1', { upstream });
  const q = seen ? new URL(seen).searchParams : new URLSearchParams();
  check('中继：把订阅链接交给 api.v1.mk',
    r.status === 200 &&
    q.get('target') === 'clash' &&
    q.get('url') === 'https://airport.example.com/link/x' &&
    q.get('diyua').startsWith('clash-verge/v'),
    '实际请求 ' + seen);
  check('中继：原样返回 api.v1.mk 的配置和流量信息',
    r.body.includes('中继节点') && r.headers.get('subscription-userinfo') === 'upload=1; download=2; total=3; expire=4',
    'body=' + r.body.slice(0, 40) + ' userinfo=' + r.headers.get('subscription-userinfo'));
}
{
  // api.v1.mk 不通时不能把客户端晾着，本地转换兜住
  const upstream = async (req) => {
    const u = typeof req === 'string' ? req : req.url;
    if (u.startsWith('https://api.v1.mk/sub')) return new Response('boom', { status: 502 });
    return rulesStub(req);
  };
  const r = await request(sub(NODES.slice(0, 2)) + '&relay=1', { upstream });
  check('中继：api.v1.mk 失败时回退本地转换',
    r.status === 200 && r.body.includes('ss节点'), 'status=' + r.status);
}

/* ── 结果 ── */
const total = pass + failures.length;
if (failures.length) {
  console.error(`冒烟测试失败：${pass}/${total} 通过\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('');
  process.exit(1);
}
console.log(`冒烟测试通过：${pass}/${total}`);

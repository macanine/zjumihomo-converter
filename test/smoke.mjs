#!/usr/bin/env node
/**
 * 构建产物的冒烟测试。
 *
 * 不依赖 Cloudflare 运行时：直接 import dist/_worker.js，喂它构造好的 Request，
 * 检查路由、协议解码、配置生成和响应头。目的是让「产物还能用」这件事可重复验证，
 * 而不是每次改完代码手动 curl 一遍。
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
  const realLog = console.log, realErr = console.error;
  console.log = () => {}; console.error = () => {};
  try {
    const init = ua ? { headers: { 'User-Agent': ua } } : {};
    const res = await worker.fetch(new Request('https://example.com' + pathname, init), env || {}, {});
    return { status: res.status, headers: res.headers, body: await res.text() };
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog; console.error = realErr;
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
  check('根路径返回伪装页', r.status === 200 && r.body.includes('Welcome to nginx'), 'status=' + r.status);
  check('伪装页带 nginx 响应头', r.headers.get('server') === 'nginx/1.18.0 (Ubuntu)', 'server=' + r.headers.get('server'));
}
{
  const r = await request('/' + KEY);
  check('表单页可访问', r.status === 200 && r.body.includes('订阅转换'), 'status=' + r.status);
  check('表单页含转换接口地址', r.body.includes('/' + KEY + '/sub?'), '缺少 pre 片段');
}
{
  const r = await request('/' + KEY + '/');
  check('表单页带尾斜杠也可访问', r.status === 200 && r.body.includes('订阅转换'), 'status=' + r.status);
}
{
  // 表单页必须能拼出可用的订阅链接：缺少 target 参数会被服务端 403。
  // 这里检查页面确实带有产出 target 的控件与脚本，避免改版时漏掉。
  const r = await request('/' + KEY);
  check('表单页含客户端选择器', /id="client"/.test(r.body), '缺少 client 下拉');
  check('表单页会写入 target', /js\.target\s*=/.test(r.body), 'processText 未设置 target');
  check('表单页含规则选择器', /id="rules"/.test(r.body), '缺少 rules 下拉');
  check('表单页含覆写开关', /id="ovr"/.test(r.body), '缺少 ovr 开关');
  check('表单页引入 Bootstrap', /bootstrap@[\d.]+/.test(r.body), '未引入 Bootstrap');
  check('表单页含一键导入', /'clash:\/\/install-config\?url='/.test(r.body), '缺少 clash:// 导入');
  // 端口和 UI 密钥不再给用户配置，改由 src/config.js 的默认值决定
  check('表单页不再暴露端口/密钥', !/id="(mp|sp|hp|rp|tp|secret)"/.test(r.body), '仍在渲染端口输入框');
}
{
  const r = await request('/favicon.ico');
  check('favicon 可访问', r.status === 200 && r.headers.get('content-type') === 'image/x-icon', 'status=' + r.status);
}
{
  const r = await request('/wrongkey/sub');
  check('错误密钥返回 404', r.status === 404, 'status=' + r.status);
}
{
  const r = await request('/' + KEY + '/other');
  check('未知子路径返回 404', r.status === 404, 'status=' + r.status);
}

/* ── 转换接口 ── */
{
  const r = await request(sub(NODES));
  check('多协议转换返回 200', r.status === 200, 'status=' + r.status);
  const yaml = r.body;
  for (const n of ['ss节点', 'vmess节点', 'trojan节点', 'vless节点', 'hysteria节点', 'hysteria2节点']) {
    check('产出包含节点 ' + n, yaml.includes(n), '未找到 ' + n);
  }
  check('产出包含策略组', yaml.includes('🚀 节点选择'), '缺少策略组');
  check('产出包含分流规则', /(MATCH,|,FINAL)/.test(yaml), '缺少终结规则');
}
{
  const r = await request('/' + KEY + '/sub?target=singbox&url=' + encodeURIComponent(NODES[0]));
  check('不支持的 target 返回 403', r.status === 403, 'status=' + r.status);
}
{
  const r = await request('/' + KEY + '/sub?target=clash&url=');
  check('空订阅返回 404', r.status === 404, 'status=' + r.status);
}
{
  const r = await request(sub(['not-a-valid-node']));
  check('无效节点返回 404', r.status === 404, 'status=' + r.status);
}
{
  // 流量信息透传
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
  // 参数覆盖
  const r = await request(sub(NODES) + '&udp=1&tfo=1&mp=1080&dns=0&secret=mysecret');
  check('个性化参数被接受', r.status === 200, 'status=' + r.status);
  check('dns=0 移除 dns 段', !/^dns:/m.test(r.body), '仍存在 dns 段');
  // 端口和 UI 密钥已不再开放：这些参数必须被忽略，否则等于给了半套配置入口
  check('端口参数被忽略', r.body.includes('mixed-port: 7890') && !r.body.includes('mixed-port: 1080'), '端口参数仍然生效');
  check('secret 参数被忽略', !r.body.includes('mysecret'), 'secret 仍然生效');
}
{
  // 缺少 url 参数时应在解析节点前就返回 404，而不是在 u.replaceAll 上崩掉
  const r = await request('/' + KEY + '/sub?target=clash');
  check('缺少 url 参数返回 404 而非崩溃', r.status === 404, 'status=' + r.status);
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
  // 自定义密钥
  const r = await request('/mykey/sub?target=clash&url=' + encodeURIComponent(NODES[0]), { env: { key: 'mykey' } });
  check('环境变量覆盖默认密钥', r.status === 200, 'status=' + r.status);
  const r2 = await request('/' + KEY + '/sub?target=clash&url=' + encodeURIComponent(NODES[0]), { env: { key: 'mykey' } });
  check('覆盖后默认密钥失效', r2.status === 404, 'status=' + r2.status);
}

/* ── 订阅命名（Content-Disposition）──
 * 客户端（Clash Verge / Mihomo Party / ClashX）导入订阅时都用这个响应头给配置命名，
 * 没有它就只剩 URL 末段「sub」当名字。名字来源按可信度：上游文件名 → 订阅链接末段 → 主机名。 */
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
  check('名字里的路径分隔符被删掉', cd.length > 0 && !cd.includes('..') && !cd.includes('/'), 'cd=' + cd);
  check('名字里的单引号被转义', !/filename\*=UTF-8''[^;]*'/.test(cd), 'cd=' + cd);
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
  check('rules 拉取成功', r.status === 200, 'status=' + r.status);
  // Clash 规则格式是 类型,参数,策略组 —— 组名在参数之后，不能在行首
  check('注入 .list 规则(UnBan)', /DOMAIN-SUFFIX,lan,🎯 全球直连/.test(r.body), 'UnBan 规则格式或内容不对');
  check('注入 .list 规则(BanAD)', /DOMAIN-KEYWORD,admarvel,🛑 全球拦截/.test(r.body), 'BanAD 规则格式或内容不对');
  check('内联 GEOIP,CN 格式正确', /GEOIP,CN,🎯 全球直连/.test(r.body), 'GEOIP 规则格式不对');
  check('内联 FINAL 转为 MATCH', /MATCH,🐟 漏网之鱼/.test(r.body), 'FINAL 未正确转成 MATCH');
  check('注释行被过滤', !r.body.includes('注释行'), '注释未被过滤');
  check('规则来自远端(非本地内置)', !r.body.includes('wxsnsdy'), '出现了本地内置规则特征');

  // 引用了不存在的策略组 → 必须丢掉，否则 mihomo 拒绝加载整份配置
  const ini2 = '[custom]\nruleset=不存在的组,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/UnBan.list\nruleset=🎯 全球直连,[]GEOIP,CN\n';
  const r2 = await request(sub(NODES.slice(0, 2), 2), {
    upstream: stubFor(ini2, { 'UnBan.list': 'DOMAIN-SUFFIX,lan\n' }),
  });
  check('未知策略组的规则被过滤', r2.status === 200 && !r2.body.includes('不存在的组'), '未知组未被过滤');
  check('过滤后仍保留有效规则', r2.body.includes('GEOIP,CN'), '有效规则被误删');

  // 拉取失败 → 用最小兜底规则，而不是整个转换失败
  const r3 = await request(sub(NODES.slice(0, 2), 3), {
    upstream: async () => new Response('boom', { status: 500 }),
  });
  check('拉取失败仍返回 200', r3.status === 200, 'status=' + r3.status);
  check('拉取失败保留最小兜底规则', /MATCH,🐟 漏网之鱼/.test(r3.body), '缺少兜底 MATCH 规则');
  check('兜底规则含国内直连', /GEOIP,CN,🎯 全球直连/.test(r3.body), '缺少兜底 GEOIP 规则');

  // list 模式不拉规则（只输出节点）
  const r4 = await request(sub(NODES.slice(0, 2)) + '&list=true', {
    upstream: async () => new Response('boom', { status: 500 }),
  });
  check('list 模式不拉取规则', r4.status === 200 && !r4.body.includes('rules:'), 'list 模式不应含 rules');
  check('list 模式不因拉取失败而报错', r4.status === 200, 'status=' + r4.status);
}

/* ── 校园网覆写（zju-override.yaml）──
 * 覆写在模块加载时就内联成常量，所以这里用默认路径（caseNo 0）即可。 */
{
  const r = await request(sub(NODES.slice(0, 2)));
  check('覆写：注入 ZJUconnect 节点', /name: ZJUconnect/.test(r.body) && /type: socks5/.test(r.body), '未找到 ZJUconnect');
  check('覆写：socks5 指向本地 1090', /server: 127\.0\.0\.1/.test(r.body) && /port: 1090/.test(r.body), '地址或端口不对');
  check('覆写：创建校园网策略组', /name: 🏫 校园网/.test(r.body), '未找到校园网组');
  check('覆写：校园网组排在首位', r.body.indexOf('name: 🏫 校园网') < r.body.indexOf('name: 🚀 节点选择'), '校园网组未置顶');
  // 置顶必须早于远端拉回来的第一条规则（桩里的 UnBan.list）
  check('覆写：规则置顶',
    r.body.indexOf('DOMAIN,vpn.zju.edu.cn,DIRECT') < r.body.indexOf('DOMAIN-SUFFIX,lan,🎯 全球直连'),
    '校园网规则未排在远端规则之前');
  check('覆写：浙大域名走校园网', /DOMAIN-SUFFIX,zju\.edu\.cn,🏫 校园网/.test(r.body), 'zju.edu.cn 规则缺失');
  check('覆写：cc98 走校园网', /DOMAIN-SUFFIX,cc98\.org,🏫 校园网/.test(r.body), 'cc98.org 规则缺失');
  check('覆写：内网 IP 段走校园网', /IP-CIDR,10\.0\.0\.0\/8,🏫 校园网,no-resolve/.test(r.body), '10.0.0.0/8 规则缺失');
  check('覆写：登录门户走直连', /DOMAIN,vpn\.zju\.edu\.cn,DIRECT/.test(r.body), 'vpn 门户规则缺失');

  // 校园网组只能含 ZJUconnect 和 DIRECT，不能被自动塞入订阅节点
  // 精确解析而非按字符切片：校园网组置顶后，后面的组本身就含节点名
  const yaml = await import('js-yaml').then(m => m.default.load(r.body));
  const zju = yaml['proxy-groups'].find(g => g.name === '🏫 校园网');
  check('覆写：校园网组只含 DIRECT 和 ZJUconnect',
    JSON.stringify(zju.proxies) === JSON.stringify(['DIRECT', 'ZJUconnect']),
    '实际为 ' + JSON.stringify(zju.proxies));
  check('覆写：校园网默认走直连', zju.proxies[0] === 'DIRECT', '首项不是 DIRECT，默认不会走直连');
}

// 关闭覆写
{
  const r = await request(sub(NODES.slice(0, 2)) + '&ovr=0');
  check('ovr=0 关闭覆写', !r.body.includes('ZJUconnect') && !r.body.includes('校园网'), '覆写仍然生效');
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

/**
 * 内置分流规则表。
 *
 * **只列「目标与兜底不同」的规则**，这是这张表能这么短的原因。兜底是最后那条
 * `MATCH,🐟 漏网之鱼`，而该组默认选中 `🚀 节点选择`——没被任何规则命中的流量
 * 一律走代理。于是：
 *
 *   - 要走直连的（本机、局域网、国内域名）必须列出来，这类漏一条就出错；
 *   - 要单独挑节点的（流媒体、AI）列出来，是为了能在客户端里给它们选不同的节点；
 *   - 其余（开发、下载、游戏、社交、CDN……）都归兜底走代理，逐条列举只是换个
 *     组名走同一条代理，没有意义。
 *
 * 国内段刻意只留「日常必碰的大厂 + cn 后缀 + GEOIP」：其余国内站点解析出的
 * 都是 CN 地址，由 GEOIP,CN 接住（上游 114 对国内域名的答案是准的），逐条
 * 列举只是把同一件事写两遍。想要更细的覆盖面（微软、苹果、下载、游戏……），
 * 换 ACL4SSR 预设，或从那份配置里把对应段落抄回来，组名见 src/config.js。
 *
 * 表项是 [策略组, 条目…]，条目不含逗号按域后缀展开成 DOMAIN-SUFFIX，
 * 含逗号则是完整规则（GEOIP,CN / DOMAIN-KEYWORD,google）。同段内被
 * DOMAIN-KEYWORD 覆盖的 DOMAIN-SUFFIX 不重复列——同组内命中哪条结果一样。
 *
 * **顺序就是优先级**（Clash 先匹配先命中）：流媒体排在 AI 前面不是随意的——
 * AI 段里有 `DOMAIN-KEYWORD,google`，而 YouTube 的 `googlevideo.com` 也含
 * "google"，反过来就会被 AI 组抢走。
 *
 * 组名必须和 src/config.js 里的策略组对得上。引用不存在的组时规则会被
 * filter_rules 丢掉（mihomo 会拒绝加载引用未知组的配置），冒烟测试里有逐条核对的用例。
 */

const BUILTIN_TABLE = [
  // 本机、局域网、路由器管理页：这些地址走代理只会连不上。
  // 大多能被末尾的 GEOIP,PRIVATE 接住，但 my.router / tplogin.cn 这类公共 DNS
  // 查不到（由路由器自己应答）的名字必须显式列出，否则 GEOIP 解析失败掉进兜底。
  ['🎯 全球直连', [
    'localhost', 'local', 'localdomain', 'internal', 'intranet', 'corp', 'private',
    'router.asus.com', 'tplinkwifi.net', 'tplogin.cn', 'tendawifi.com', 'miwifi.com', 'router.ctc',
    'my.router', 'fritz.box', 'routerlogin.net', 'linksyssmartwifi.com',
    'test', 'example', 'invalid',
    'DOMAIN-KEYWORD,.local', 'DOMAIN-KEYWORD,localhost',
  ]],
  // 必应：国内直连可达，但必须显式钉在直连。不列的话流量全靠 GEOIP,CN 兜——
  // 解析一旦落到海外边沿（IPv6、或上游给出 13.107.x / 204.79.x 这类全球地址）
  // GEOIP 就接不住，流量掉进兜底组走代理，而必应中国对海外出口直接拒绝访问
  // （cn.bing.com 报「无法访问」）。直连组是选择器，想走代理可在客户端里切。
  ['🎯 全球直连', [
    'bing.com', 'bing.cn', 'bingapis.com',
  ]],
  // 流媒体：单独成组是为了能挑一个解锁流媒体的节点
  ['🌍 国外媒体', [
    'ytimg.com', 'googlevideo.com', 'youtu.be', 'yt.be',
    'DOMAIN-KEYWORD,youtube', 'netflix.com', 'nflximg.net', 'nflximg.com',
    'nflxvideo.net', 'nflxso.net', 'nflxext.com', 'DOMAIN-KEYWORD,netflix',
    'DOMAIN-KEYWORD,twitch', 'jtvnw.net',
    'spotify.com', 'spotifycdn.com', 'scdn.co', 'spoti.fi', 'spotify.link',
    'disneyplus.com', 'disney-plus.net', 'dssott.com', 'bamgrid.com', 'disney.com',
    'disneystreaming.com', 'disneyaccount.com', 'hulu.com', 'huluim.com', 'hulustream.com',
    'hbomax.com', 'max.com', 'hbo.com', 'h264.io',
  ]],
  // AI 与学术：同样是为了挑节点（很多 AI 服务挑 IP 地区）。
  // claude/gemini/cursor 家族只留 DOMAIN-KEYWORD，前缀域名交给关键字覆盖。
  ['🤖 AI 研究', [
    'chat.com', 'chatgpt.com', 'chatgpt.site', 'oaistatic.com', 'oaiusercontent.com', 'openai.com',
    'sora.com', 'bard.google.com', 'deepmind.com', 'deepmind.google',
    'aistudio.google.com', 'makersuite.google.com',
    'ai.google.dev', 'aiplatform.googleapis.com',
    'labs.google.com', 'notebooklm.google.com', 'perplexity.ai', 'mistral.ai',
    'cohere.com', 'groq.com', 'x.ai', 'grok.com', 'together.ai', 'stability.ai',
    'midjourney.com', 'poe.com', 'character.ai',
    'DOMAIN-KEYWORD,openai', 'DOMAIN-KEYWORD,claude', 'DOMAIN-KEYWORD,anthropic',
    'DOMAIN-KEYWORD,gemini.google', 'DOMAIN-KEYWORD,generativelanguage', 'DOMAIN-KEYWORD,cursor',
    'arxiv.org', 'springer.com', 'sciencedirect.com', 'nature.com', 'wiley.com', 'ieee.org',
    'acm.org', 'jstor.org', 'doi.org', 'ncbi.nlm.nih.gov', 'semanticscholar.org',
    'researchgate.net', 'zotero.org', 'overleaf.com', 'DOMAIN-KEYWORD,google',
  ]],
  // 国内域名：日常必碰的大厂 + cn 后缀 + GEOIP，其余国内站点由 GEOIP,CN 接住
  ['🎯 全球直连', [
    'qq.com', 'tencent.com', 'wechat.com', 'taobao.com', 'tmall.com', 'alipay.com',
    'aliyun.com', 'alicdn.com', 'baidu.com', 'bdstatic.com', 'bilibili.com',
    'bilivideo.com', 'hdslb.com', 'zhihu.com', 'weibo.com', 'jd.com', '163.com',
    'netease.com', 'douyin.com', 'bytedance.com', 'snssdk.com', 'ixigua.com',
    'xiaomi.com', 'mi.com', 'huawei.com', 'vmall.com', 'huaweicloud.com',
    'meituan.com', 'dianping.com', 'didiglobal.com', 'kuaishou.com', 'pinduoduo.com',
    'dingtalk.com', 'ele.me', 'amap.com', 'ctrip.com', 'sohu.com', 'sogou.com',
    '360.com', 'douban.com', 'youku.com', 'iqiyi.com', 'xunlei.com', 'unionpay.com',
    'cmbchina.com', 'csdn.net', 'gitee.com',
    'cn', 'edu.cn',
    'GEOIP,CN', 'GEOIP,PRIVATE',
  ]],
];

// 终结规则。兜底组的默认选中项决定「没匹配上的流量」去哪：
// 这里是 🚀 节点选择（走代理），因为校园网里需要代理的站点远多于不需要的。
// 想改成未匹配走直连，就把 src/config.js 里那个组的顺序调一下。
const BUILTIN_FINAL = 'MATCH,🐟 漏网之鱼';

/**
 * 展开成 Clash 规则数组。
 * 条目不含逗号时按域后缀处理，含逗号时视为完整规则。
 * 去重按展开后的整条规则做。
 */
function gen_builtin_rules() {
  const out = [];
  const seen = new Set();
  for (const [group, items] of BUILTIN_TABLE) {
    for (const item of items) {
      const rule = item.includes(',') ? item + ',' + group : 'DOMAIN-SUFFIX,' + item + ',' + group;
      if (seen.has(rule)) continue;
      seen.add(rule);
      out.push(rule);
    }
  }
  out.push(BUILTIN_FINAL);
  return out;
}

export { gen_builtin_rules };

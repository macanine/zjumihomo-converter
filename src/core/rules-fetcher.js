/**
 * 分流规则：默认用内置表，需要更全的覆盖面时从 ACL4SSR 拉取。
 *
 * ACL4SSR 的分发结构和本项目原本的假设不同，这里的关键点：
 *   - Clash/config/*.ini 是 subconverter 配方格式，不是 Clash YAML。
 *     规则以 `ruleset=策略组名,规则文件URL` 的形式引用，不是规则本身。
 *   - 真正的规则在 Clash/*.list 里，是纯文本（DOMAIN-KEYWORD,admarvel），
 *     **不含策略组名**——组名必须由 .ini 那一行补上。
 *   - .ini 里还有 `[]GEOIP,CN` / `[]FINAL` 这种内联规则，没有对应文件。
 *
 * 所以流程是：拉 .ini → 解析出「组名 + 目标」列表 → 并发拉各 .list
 * → 给每行前缀组名 → 按可用的策略组过滤。
 *
 * 过滤是必须的：规则引用了配置里不存在的策略组时，mihomo 会拒绝加载整份配置。
 */

import { gen_builtin_rules } from '../rules/builtin.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const REPO = 'ACL4SSR/ACL4SSR';
const REF = 'master';
const RAW_PREFIX = `https://raw.githubusercontent.com/${REPO}/${REF}/Clash/`;

// 依次尝试，第一个成功的用于后续所有文件。国内直连 raw.githubusercontent 常被阻断，
// 所以备了镜像；.ini 里的绝对 URL 会按命中镜像重写。
const BASES = [
  RAW_PREFIX,
  `https://ghfast.top/${RAW_PREFIX}`,
  `https://cdn.jsdelivr.net/gh/${REPO}@${REF}/Clash/`,
];

const PRESETS = {
  mini: 'config/ACL4SSR_Online_Mini.ini',
  mini_adblock: 'config/ACL4SSR_Online_Mini_AdblockPlus.ini',
  mini_multi: 'config/ACL4SSR_Online_Mini_MultiMode.ini',
  mini_multicountry: 'config/ACL4SSR_Online_Mini_MultiCountry.ini',
  full: 'config/ACL4SSR_Online_Full.ini',
  full_adblock: 'config/ACL4SSR_Online_Full_AdblockPlus.ini',
  full_netflix: 'config/ACL4SSR_Online_Full_Netflix.ini',
};

const CACHE_TTL = 3600 * 1000;

// 单次上游请求的超时。镜像站不可达时如果不设上限，请求会一直挂着，
// 用户那边表现为转换「卡死」而不是「回退到内置规则」。
const FETCH_TIMEOUT = 5000;

// 整体拉取预算。一次转换要拉十来个文件，逐个等超时会累积成分钟级等待，
// 所以给整批一个总预算，超了就放弃并回退内置规则。
// 这个值同时是镜像逐个重试的上限：raw 不可达时最多等这么久就整体放弃。
const TOTAL_BUDGET = 8000;

// 单个请求的最小超时。给太小的值会让慢速但可用的连接被误杀。
const MIN_TIMEOUT = 1500;

// 模块级缓存。和 ua_default 一样是跨请求共享的可变状态，但这里是刻意为之：
// 一次转换要拉十来个文件，不缓存的话每个请求都要等一遍网络。
// 缓存的是最终规则数组，按 ini 地址分键，带 TTL 避免规则长期不更新。
const cache = new Map();

/** 带超时的 fetch。用 AbortController 真正中断请求，而不是只放弃等待。 */
async function fetch_with_timeout(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(new Request(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept': 'text/plain,*/*' },
      signal: ac.signal,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** 拉一个文本文件，非 200 视为失败 */
async function fetch_text(url, budget) {
  const ms = budget ? Math.max(MIN_TIMEOUT, Math.min(FETCH_TIMEOUT, budget.left())) : FETCH_TIMEOUT;
  const res = await fetch_with_timeout(url, ms);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

/** 把 raw.githubusercontent 的绝对地址改写到命中的镜像上 */
function rewrite(url, base) {
  if (base === RAW_PREFIX) return url;
  if (url.startsWith(RAW_PREFIX)) return base + url.slice(RAW_PREFIX.length);
  // 有些条目写成 github.com/.../blob/... 或其它形式，统一替换主机部分
  return url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/Clash\//, base);
}

/** 解析 .ini，返回 [{ group, url }] 或 [{ group, inline }] */
function parse_ini(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('ruleset=')) continue;
    const body = line.slice('ruleset='.length);
    const comma = body.indexOf(',');
    if (comma < 0) continue;
    const group = body.slice(0, comma).trim();
    const target = body.slice(comma + 1).trim();
    if (!group || !target) continue;
    // []GEOIP,CN / []FINAL 这类是内联规则，没有文件可拉
    if (target.startsWith('[]')) out.push({ group, inline: target.slice(2) });
    else out.push({ group, url: target });
  }
  return out;
}

// 规则末尾的选项关键字，必须留在策略组之后
const RULE_OPTIONS = new Set(['no-resolve', 'src', 'dns-failed', 'extended']);

// mihomo 当前支持的规则类型。ACL4SSR 的 .list 里含 URL-REGEX，
// 而 mihomo v1.19 已移除该类型，遇到会让整份配置加载失败，
// 所以不认识的类型要丢掉（实测仅 ProxyMedia.list 里 1 条）。
const KNOWN_TYPES = new Set([
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX', 'GEOSITE',
  'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'GEOIP', 'SRC-IP-CIDR', 'SRC-IP-SUFFIX',
  'SRC-PORT', 'DST-PORT', 'IN-PORT', 'IN-TYPE', 'IN-USER', 'IN-NAME',
  'PROCESS-NAME', 'PROCESS-PATH', 'PROCESS-NAME-REGEX', 'PROCESS-PATH-REGEX',
  'NETWORK', 'UID', 'RULE-SET', 'MATCH', 'AND', 'OR', 'NOT', 'SUB-RULE',
]);

/**
 * 把 .list 里的一行（或 .ini 里的内联规则）拼成合法的 Clash 规则。
 *
 * .list 里每行是 `类型,参数[,no-resolve]`，**不含策略组名**，组名由 .ini 指定。
 * Clash 的格式是 `类型,参数,策略组[,no-resolve]`——组名插在参数之后，
 * 而 no-resolve 这类选项必须留在最末。所以既不能在行首也不能简单地在行尾拼组名：
 *   DOMAIN-SUFFIX,a.com            -> DOMAIN-SUFFIX,a.com,🎯 全球直连
 *   IP-CIDR,1.0.1.0/24,no-resolve  -> IP-CIDR,1.0.1.0/24,🎯 全球直连,no-resolve
 *   FINAL                          -> MATCH,🐟 漏网之鱼
 */
function build_rule(line, group) {
  let s = line.trim();
  // .list 里偶有 [] 前缀（继承自 subconverter 写法），去掉
  if (s.startsWith('[]')) s = s.slice(2).trim();
  if (!s) return null;

  const parts = s.split(',').map(x => x.trim()).filter(x => x !== '');
  if (!parts.length) return null;

  const head = parts[0].toUpperCase();

  // 终结规则没有参数，格式是 MATCH,策略组（统一写成 mihomo 的 MATCH）
  if (head === 'FINAL' || head === 'MATCH') return 'MATCH,' + group;

  // 类型 + 参数至少两段才有意义
  if (parts.length < 2) return null;

  // 内核不认识类型会让整份配置加载失败，直接丢掉
  if (!KNOWN_TYPES.has(head)) return null;

  const tail = [];
  while (parts.length > 2 && RULE_OPTIONS.has(parts[parts.length - 1].toLowerCase())) {
    tail.unshift(parts.pop());
  }
  return [...parts, group, ...tail].join(',');
}

/** 从一条规则里取出策略组名（末尾选项之前的最后一段） */
function rule_group(rule) {
  const parts = rule.split(',').map(s => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!RULE_OPTIONS.has(parts[i].toLowerCase())) return parts[i];
  }
  return null;
}

/** 内置规则表的选择器名 */
const BUILTIN_SELECTOR = 'builtin';

/**
 * 取分流规则。内置表直接展开（不联网），其余选择器交给 ACL4SSR 拉取。
 *
 * 两条路径都要过 filter_rules：引用不存在策略组的规则必须丢，
 * 否则 mihomo 会拒绝加载整份配置。
 *
 * @param {string} selector  内置名 builtin / 预设名（mini/full/...）/ .ini 的完整地址
 * @param {Set<string>} available_groups  配置里实际存在的策略组名
 * @returns {Promise<{rules:string[], source:string, dropped:number}>}
 */
async function resolve_rules(selector, available_groups) {
  if (String(selector).toLowerCase() !== BUILTIN_SELECTOR) {
    return fetch_acl4ssr_rules(selector, available_groups);
  }

  const { rules, dropped } = filter_rules(gen_builtin_rules(), available_groups, BUILTIN_SELECTOR);
  // 终结规则可能被过滤掉（组名不在模板里时），那就没有规则接住未匹配的流量了。
  // 补回模板自带的兜底组；连它都没有就退回 DIRECT——内置策略，一定存在。
  if (!rules.some(r => /^MATCH,/i.test(r))) {
    rules.push(available_groups && available_groups.has('🐟 漏网之鱼')
      ? 'MATCH,🐟 漏网之鱼' : 'MATCH,DIRECT');
  }
  return { rules, source: BUILTIN_SELECTOR, dropped };
}

/** 把一份 .list 的文本展开成规则数组 */
function parse_list(text, group) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^[#;/]/.test(line)) continue;
    const r = build_rule(line, group);
    if (r) out.push(r);
  }
  return out;
}

/**
 * 拉取并组装规则。
 *
 * @param {string} selector  预设名（mini/full/...）或 .ini 的完整地址
 * @param {Set<string>} available_groups  配置里实际存在的策略组名
 * @returns {Promise<{rules:string[], source:string, dropped:number}>}
 */
async function fetch_acl4ssr_rules(selector, available_groups) {
  const key = String(selector);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return filter_rules(hit.value, available_groups, hit.source);
  }

  const iniPath = PRESETS[key] || key;
  const is_url = /^https?:\/\//i.test(iniPath);

  // 既不是已知预设名、也不是 URL 的，三个镜像都会 404，重试没有意义，直接失败。
  // 这样拼错名字（或用了已移除的 builtin）能立刻回退，而不是白等三个镜像。
  if (!is_url && !PRESETS[key]) {
    throw new Error(`未知的规则预设 "${key}"，可用: ${Object.keys(PRESETS).join(', ')}`);
  }

  // 整批拉取的deadline，所有请求共享
  const deadline = Date.now() + TOTAL_BUDGET;
  const budget = { left: () => deadline - Date.now() };

  // 依次尝试各个 base，第一个拉到 .ini 的就用它。
  // 镜像重试受总预算约束：预算耗尽就不再试下一个，避免 raw 不可达时
  // 三个镜像各等满一轮，把总耗时拖到预算的数倍。
  let ini = null;
  let base = RAW_PREFIX;
  let lastErr = null;
  for (const b of BASES) {
    if (budget.left() <= MIN_TIMEOUT) { lastErr = new Error('拉取超时'); break; }
    const url = is_url ? rewrite(iniPath, b) : b + iniPath;
    try {
      ini = await fetch_text(url, budget);
      base = b;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (ini == null) {
    throw new Error('无法获取 ACL4SSR 配置: ' + (lastErr ? lastErr.message : '未知错误'));
  }

  const rulesets = parse_ini(ini);
  if (!rulesets.length) throw new Error('ACL4SSR 配置里没有解析到任何 ruleset');

  // 并发拉取所有规则文件。用 allSettled：个别文件失败不该让整批作废，
  // 拿到多少算多少，总比整个转换失败好。
  const settled = await Promise.allSettled(rulesets.map(async (rs) => {
    if (rs.inline !== undefined) return null;
    if (budget.left() <= 0) throw new Error('拉取超时');
    return await fetch_text(rewrite(rs.url, base), budget);
  }));

  const rules = [];
  let failed = 0;
  rulesets.forEach((rs, i) => {
    if (rs.inline !== undefined) {
      const r = build_rule(rs.inline, rs.group);
      if (r) rules.push(r);
      return;
    }
    const s = settled[i];
    if (s.status !== 'fulfilled' || s.value == null) { failed++; return; }
    for (const r of parse_list(s.value, rs.group)) rules.push(r);
  });

  // 一个文件都没拉到，说明网络整体不可用，交给上层走兜底
  if (!rules.length) throw new Error('ACL4SSR 规则文件全部拉取失败');

  const source = (is_url ? 'custom' : key) + ':' + rulesets.length + '组' +
    (failed ? `(失败${failed})` : '');
  cache.set(key, { at: Date.now(), value: rules, source });
  return filter_rules(rules, available_groups, source);
}

/**
 * 丢掉引用了不存在策略组的规则。
 * mihomo 遇到未知策略组会整份配置加载失败，所以这里必须过滤而不是放行。
 */
function filter_rules(rules, available_groups, source) {
  if (!available_groups || !available_groups.size) {
    return { rules, source, dropped: 0 };
  }
  const kept = [];
  let dropped = 0;
  for (const r of rules) {
    const group = rule_group(r);
    if (group && available_groups.has(group)) kept.push(r);
    else dropped++;
  }
  return { rules: kept, source, dropped };
}

export { fetch_acl4ssr_rules, resolve_rules };

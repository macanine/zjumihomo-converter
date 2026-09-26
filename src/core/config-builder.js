import { gen_nodes } from './nodes.js';
import { clash_config } from '../config.js';
import { resolve_rules, rule_group } from './rules-fetcher.js';
import { apply_override, check_override } from './override.js';
// 打包器会把这份 YAML 转成 JS 字面量内联进来，运行时不需要读文件
import zju_override from '../../zju-override.yaml';

// 规则来源。默认用内置规则表（src/rules/builtin.js，离线可用、按用途分流），
// 换成 ACL4SSR 预设名或 .ini 地址就走远端拉取（覆盖面更大但依赖转换端能出网）。
const DEFAULT_RULES = 'builtin';

// 拉取彻底失败时的最小兜底规则。
// 没有它就只能返回错误，而 mihomo 不接受缺少 rules 的配置。
// 这两条保证配置合法、流量仍能正常走代理，只是没有细分流。
// 用到的策略组都在模板里，不会引入未知组。
const FALLBACK_RULES = [
  'GEOIP,CN,🎯 全球直连',
  'MATCH,🐟 漏网之鱼',
];

// 校园网覆写默认开启（这是本项目的部署场景）。
// URL 上传 ovr=0 可关闭，用于拿到不含校园网配置的通用订阅。
const DEFAULT_OVERRIDE = true;

/**
 * 剪除没有被任何规则引用到的策略组。
 *
 * 模板里有一半组是给 ACL4SSR 预设预备的（微软服务、电报信息、全球拦截……）。
 * 换成内置规则后没有任何规则指向它们，留着只会在客户端里多出一排永远不走
 * 流量的死开关。保留集合从「规则目标」出发，把被保留组候选里引用的组也收进来
 * （漏网之鱼→节点选择→自动选择），迭代到不再增长为止。
 *
 * 必须在「把节点塞进各策略组」之前跑（省得往死组里填节点），也必须在应用覆写
 * 之前跑：覆写随后自带的「🏫 校园网」组与置顶规则成对出现，不受这里影响。
 */
function prune_unused_groups(cfg) {
  const groups = cfg['proxy-groups'];
  if (!Array.isArray(groups) || !groups.length) return;
  const by_name = new Map(groups.map(g => [g.name, g]));
  const used = new Set();
  for (const r of cfg.rules || []) {
    const t = rule_group(r);
    if (t && by_name.has(t)) used.add(t);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const g of groups) {
      if (!used.has(g.name) || !Array.isArray(g.proxies)) continue;
      for (const p of g.proxies) {
        if (by_name.has(p) && !used.has(p)) { used.add(p); grew = true; }
      }
    }
  }
  cfg['proxy-groups'] = groups.filter(g => used.has(g.name));
}


async function gen_cfg(data, udp_en, tfo_en, dns, listmode, rules_sel, ovr) {
  let proxy = {}, nodes_name;
  let cfg;

  if (typeof (data) != 'string' || data.length < 1) {
    return null;
  }

  const is_list = !!(listmode && /true/i.test(listmode));
  const want_rules = (rules_sel === undefined || rules_sel === '') ? DEFAULT_RULES : rules_sel;

  // 规则获取和节点解析互不依赖，并发跑以省掉一个网络往返。
  // 立刻挂上 catch，避免提前 return 时留下未处理的 rejection。
  let rules_result = null;
  let rules_promise = null;
  if (!is_list) {
    const groups = new Set((clash_config['proxy-groups'] || []).map(g => g.name));
    rules_promise = resolve_rules(want_rules, groups)
      .then(r => { rules_result = r; })
      .catch(e => { console.error('规则获取失败，使用最小兜底规则: %o', e); });
  }

  await gen_nodes(data, proxy);
  if (proxy.nodes.length < 1) {
    return null;
  }

  // 处理节点数据：去重和name重命名
  try {
    let s = new Set();
    let i = proxy.nodes.filter(obj => {
      if (!obj.name) return false;
      let key = `${obj.server}-${obj.port}`;
      if (s.has(key)) return false;
      s.add(key);
      return true;
    });
    let m = new Map();
    proxy.nodes = i.map(obj => {
      let o = obj.name;
      if (m.has(o)) {
        let r = Math.random().toString(36).substring(2, 12);
        let n = `${o}-${r}`;
        return { ...obj, name: n };
      } else {
        m.set(o, true);
        return obj;
      }
    });
    nodes_name = proxy.nodes.map(item => item.name);
    console.log(`---nodes---${proxy.nodes.length} up=${proxy.up} dn=${proxy.dn} total=${proxy.to} expire=${proxy.ex}`);
  } catch (e) {
    console.error("Error processing nodes: %o", e);
    return null;
  }

  // 修改节点全局配置（udp, tfo）
  if (udp_en !== undefined) {
    let en = /^(t|1|y|enable|on)$/i.test(udp_en) ? true : false;
    proxy.nodes.forEach(item => {
      if (item.udp !== undefined) {
        item.udp = en;
      }
    });
  }
  if (tfo_en !== undefined) {
    let en = /^(t|1|y|enable|on)$/i.test(tfo_en) ? true : false;
    proxy.nodes.forEach(item => {
      if (item.tfo !== undefined) {
        item.tfo = en;
      }
    });
  }

  if (is_list) {
    cfg = {};
    cfg['proxies'] = proxy.nodes;
  } else {
    cfg = structuredClone(clash_config);
    cfg['proxies'] = proxy.nodes;

    // 规则：一律来自远端拉取；拉不到就用最小兜底，保证配置始终合法可用
    await rules_promise;
    if (rules_result && rules_result.rules.length) {
      cfg['rules'] = rules_result.rules;
      console.log('---rules---' + rules_result.source +
        ` kept=${rules_result.rules.length} dropped=${rules_result.dropped}`);
    } else {
      cfg['rules'] = FALLBACK_RULES.slice();
      console.log('---rules---fallback (远端不可用，仅保留最小分流)');
    }
    prune_unused_groups(cfg);

    // 处理策略组
    try {
      cfg['proxy-groups'].forEach(obj => {
        if (obj.name && !/广告|拦截|直连|净化/.test(obj.name)) {
          if (obj.proxies && Array.isArray(obj.proxies)) {
            obj.proxies.push(...nodes_name);
          } else {
            obj.proxies = nodes_name.slice();
          }
        }
      });
    } catch (e) {
      console.error("Error processing proxy groups: %o", e);
      return null;
    }

    // 应用覆写片段（校园网节点/策略组/置顶规则）。
    // 必须放在上面「把节点塞进各策略组」之后：否则「校园网」组会被
    // 自动填入所有订阅节点，而它应该只含 DIRECT 和 ZJUconnect。
    const want_override = ovr === undefined ? DEFAULT_OVERRIDE : !/^(0|false|no|off)$/i.test(ovr);
    if (want_override) {
      const problems = check_override(zju_override, cfg);
      if (problems.length) {
        // 覆写有问题时整体跳过，而不是产出会被 Clash 拒绝的配置
        console.error('覆写片段校验未通过，已跳过: %o', problems);
      } else {
        const st = apply_override(cfg, zju_override);
        if (st) {
          console.log(`---override---proxies=${st.proxies} groups=${st.groups} rules=${st.rules} dns=${st.dns}`);
        }
      }
    }

    // 修改DNS配置
    if (dns === '0') {
      delete cfg['dns'];
    } else if (dns === '2') {
      try {
        let resv = ['enable', 'listen', 'ipv6'];
        for (let i in cfg['dns']) {
          if (!resv.includes(i)) {
            delete cfg['dns'][i];
          }
        }
      } catch (e) { }
    }
  }

  // 端口、external-controller 密钥等一律用 config.js 里的默认值，
  // 不再开放 URL 参数（模板本身就是给这个部署场景调的）。
  return { 'data': cfg, 'up': proxy.up, 'dn': proxy.dn, 'to': proxy.to, 'ex': proxy.ex, 'sub_name': proxy.sub_name };
}

export { gen_cfg };

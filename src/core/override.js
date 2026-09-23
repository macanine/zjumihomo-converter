/**
 * 应用覆写片段（默认来自项目根目录的 zju-override.yaml）。
 *
 * 覆写片段是标准的 Clash 片段，支持四个键：proxies / proxy-groups / rules / dns。
 * 合并语义和「追加」不同，这里是有意为之：
 *   - proxies      追加（节点名去重，同名以覆写为准）
 *   - proxy-groups 追加（同名则整体替换）
 *   - rules        置顶插入
 *   - dns          逐键合并进模板的 dns 段（列表追加、映射表合并、标量覆盖）
 *
 * rules 必须置顶，否则毫无作用：ACL4SSR 拉回来的规则里有
 * `GEOIP,CN,🎯 全球直连` 和末尾的 `MATCH,...`，校园网规则若排在后面
 * 永远匹配不到。置顶后这几条优先级最高。
 *
 * 依赖的模块级缓存：和规则拉取一样，覆写片段在模块加载时就已内联成
 * 常量（打包器把 YAML 转成了 JS 字面量），所以这里没有 IO。
 */

/**
 * @param {object} cfg       正在组装的配置（会被就地修改）
 * @param {object} override  覆写片段，含 proxies / proxy-groups / rules / dns
 * @returns {object|null} 各段合并条数，覆写为空时返回 null
 */
function apply_override(cfg, override) {
  if (!override || typeof override !== 'object') return null;

  const stats = { proxies: 0, groups: 0, rules: 0, dns: 0 };

  // 1. 追加节点。同名节点以覆写为准（用户显式配置的应覆盖订阅里的）
  if (Array.isArray(override.proxies) && override.proxies.length) {
    const names = new Set(override.proxies.map(p => p && p.name).filter(Boolean));
    cfg['proxies'] = [
      ...(cfg['proxies'] || []).filter(p => !names.has(p && p.name)),
      ...override.proxies,
    ];
    stats.proxies = override.proxies.length;
  }

  // 2. 策略组置顶。同名整体替换，避免出现两个同名组导致 Clash 报错。
  // 置顶而非追加：策略组在 Clash 界面里按顺序展示，覆写组（校园网）
  // 是这台机器最常用的入口，应该排在最上面。
  if (Array.isArray(override['proxy-groups']) && override['proxy-groups'].length) {
    const by_name = new Map(override['proxy-groups'].map(g => [g && g.name, g]));
    const kept = (cfg['proxy-groups'] || []).filter(g => !by_name.has(g && g.name));
    cfg['proxy-groups'] = [...override['proxy-groups'], ...kept];
    stats.groups = override['proxy-groups'].length;
  }

  // 3. 规则置顶
  if (Array.isArray(override.rules) && override.rules.length) {
    cfg['rules'] = [...override.rules, ...(cfg['rules'] || [])];
    stats.rules = override.rules.length;
  }

  // 4. DNS 合并进模板。按值的类型区分语义，因为这三类东西的「正确合并方式」不同：
  //    - 映射表（nameserver-policy）逐键合并，整体覆盖会丢掉模板里已有的条目
  //    - 列表（fake-ip-filter）追加去重，模板里那一长串仍要生效
  //    - 标量直接覆盖
  if (override.dns && typeof override.dns === 'object') {
    const base = (cfg['dns'] && typeof cfg['dns'] === 'object') ? cfg['dns'] : (cfg['dns'] = {});
    for (const [k, v] of Object.entries(override.dns)) {
      const cur = base[k];
      if (Array.isArray(v) && Array.isArray(cur)) {
        base[k] = [...cur, ...v.filter(x => !cur.includes(x))];
      } else if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
        base[k] = { ...cur, ...v };
      } else {
        base[k] = v;
      }
    }
    stats.dns = Object.keys(override.dns).length;
  }

  return stats;
}

/**
 * 校验覆写片段引用的策略组是否都存在。
 * 覆写里的规则若指向不存在的组，Clash 会拒绝加载整份配置，
 * 所以这里提前检查并给出明确提示，而不是等用户导入时才报错。
 *
 * @returns {string[]} 问题描述列表，空数组表示没问题
 */
function check_override(override, cfg) {
  const problems = [];
  if (!override || typeof override !== 'object') return problems;

  const groups = new Set((cfg['proxy-groups'] || []).map(g => g && g.name).filter(Boolean));
  const proxies = new Set((cfg['proxies'] || []).map(p => p && p.name).filter(Boolean));
  // 覆写自己带来的组和节点也要算作「存在」——校验发生在合并之前，
  // 否则「校园网」引用同片段里的 ZJUconnect 会被误判为缺失。
  for (const g of override['proxy-groups'] || []) if (g && g.name) groups.add(g.name);
  for (const p of override.proxies || []) if (p && p.name) proxies.add(p.name);
  const builtin = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL']);
  const OPTIONS = new Set(['no-resolve', 'src', 'dns-failed', 'extended']);

  // 组里引用的节点/子组必须存在
  for (const g of override['proxy-groups'] || []) {
    if (!g || !g.name) { problems.push('proxy-groups 里有条目缺少 name'); continue; }
    for (const ref of g.proxies || []) {
      if (builtin.has(ref) || groups.has(ref) || proxies.has(ref)) continue;
      problems.push(`策略组「${g.name}」引用了不存在的节点/组「${ref}」`);
    }
  }

  // 规则的目标必须是组或内置策略
  for (const rule of override.rules || []) {
    if (typeof rule !== 'string') { problems.push('rules 里有非字符串条目'); continue; }
    const parts = rule.split(',').map(s => s.trim());
    if (parts.length < 2) { problems.push(`规则字段不足: ${rule}`); continue; }
    let i = parts.length - 1;
    while (i >= 0 && OPTIONS.has(parts[i].toLowerCase())) i--;
    const target = parts[i];
    if (!(groups.has(target) || builtin.has(target))) {
      problems.push(`规则「${rule}」指向不存在的策略组「${target}」`);
    }
  }

  return problems;
}

export { apply_override, check_override };

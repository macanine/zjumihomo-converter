// 订阅命名。
//
// 客户端（Clash Verge、Mihomo Party、ClashX）导入订阅时都用响应头
// Content-Disposition 里的文件名给配置命名，没有才退到订阅链接本身。
// 不返回这个头，用户看到的配置名就是 URL 末段——也就是接口名 sub。
//
// 名字来源按可信度排序：上游响应头里的文件名（机场自己起的）→ 订阅链接末段 → 主机名。

import { decodeURIComponentSafe } from './utils.js';

// 机场的订阅地址多是 /api/v1/client/subscribe?token=xxx 这类通用端点，
// 末段没有信息量，遇到这些词改用主机名。
const GENERIC_SEGMENTS = new Set([
  'sub', 'subscribe', 'subscription', 'link', 'links', 'clash', 'client',
  'api', 'profile', 'get', 'token', 'user', 'v1', 'v2', 'v3',
]);

const NAME_MAX = 60;

// 去掉不能进文件名或 HTTP 头的字符。控制字符（含 \r\n）必须删掉：
// 混进响应头会变成头注入，客户端解析也会失败。
function sanitize_name(name) {
  if (typeof (name) != 'string') return '';
  return name
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')  // "." / ".." 会被客户端当路径
    .slice(0, NAME_MAX)
    .trim();
}

// 上游响应头里的文件名，即「源文件」自己的名字，最可信。
function name_from_headers(headers) {
  let cd = '';
  try {
    cd = headers.get('content-disposition') || '';
  } catch (e) {
    return '';
  }
  if (!cd) return '';

  // filename*=charset''value 优先于 filename=（RFC 5987），可能还带语言标签
  let m = cd.match(/filename\*\s*=\s*([^;]+)/i);
  if (m) {
    let v = m[1].trim().replace(/^"|"$/g, '');
    let i = v.indexOf("''");
    if (i != -1) v = v.slice(i + 2);
    try {
      return sanitize_name(decodeURIComponent(v));
    } catch (e) {
      return sanitize_name(v);
    }
  }
  m = cd.match(/filename\s*=\s*"([^"]*)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);
  return m ? sanitize_name(m[1]) : '';
}

// 从订阅链接本身推断：末段优先，通用端点名则退到主机名
function name_from_url(link) {
  let x;
  try {
    x = new URL(link);
  } catch (e) {
    return '';
  }
  let segs = x.pathname.split('/').filter(s => s.length > 0);
  let last = segs.length ? decodeURIComponentSafe(segs[segs.length - 1]) : '';
  let base = last.replace(/\.(ya?ml|txt|json|conf|ini)$/i, '').trim();
  if (base.length > 1 && !GENERIC_SEGMENTS.has(base.toLowerCase())) {
    return sanitize_name(base);
  }
  return sanitize_name(x.hostname.replace(/^www\./, ''));
}

// RFC 5987 的 attr-char 比 encodeURIComponent 保留的字符更严：单引号必须转义，
// 否则客户端按 '' 切分 charset 和值时会把名字切坏。
function attr_encode(s) {
  return encodeURIComponent(s).replace(/['()*!]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// filename= 只能是 ASCII：头里放不下中文，Worker 会直接抛错。
// 非 ASCII 的名字退到主机名之类的 ASCII 兜底，真正的中文名走 filename*。
function ascii_name(name, alt) {
  const clean = (s) => (typeof (s) == 'string' ? s.replace(/[^\x20-\x7e]/g, '').trim() : '');
  let a = clean(name);
  if (/[0-9A-Za-z]/.test(a)) return a;
  let b = clean(alt);
  return /[0-9A-Za-z]/.test(b) ? b : 'profile';
}

/**
 * 生成订阅响应的 Content-Disposition 值。
 *
 * 算不出名字时返回 null——让客户端用自己的兜底规则，比硬塞一个没意义的名字好
 * （粘贴节点列表这种没有来源名字的场景就会走到这里）。
 *
 * @param {string} header_name 上游订阅响应头里的文件名
 * @param {string} data 用户传的 url 参数，可能含多条订阅链接
 */
function content_disposition(header_name, data) {
  const name = sanitize_name(header_name);

  let alt = '';
  if (typeof (data) == 'string') {
    // 多条订阅取第一条能解析出名字的
    for (let item of data.split(/[\n|]/)) {
      let link = item.trim();
      if (!/^https?:\/\//i.test(link)) continue;
      alt = name_from_url(link);
      if (alt) break;
    }
  }

  const final = name || alt;
  if (!final) return null;
  return `attachment; filename="${ascii_name(final, alt)}"; filename*=UTF-8''${attr_encode(final)}`;
}

export { name_from_headers, content_disposition };

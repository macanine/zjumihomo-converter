import yaml from 'js-yaml';
import { sub_ua } from './globals.js';
import { isValidUrl, fetch_text_limited, MAX_FETCH_BYTES, contentTypeIsText, decodeBase64 } from './utils.js';
import { name_from_headers } from './sub-name.js';
import { decode_ss } from '../protocols/ss.js';
import { decode_ssr } from '../protocols/ssr.js';
import { decode_vmess } from '../protocols/vmess.js';
import { decode_trojan } from '../protocols/trojan.js';
import { decode_hysteria } from '../protocols/hysteria.js';
import { decode_hysteria2 } from '../protocols/hysteria2.js';
import { decode_vless } from '../protocols/vless.js';


const MAX_NODES = 1000;
const MAX_BASE64_DEPTH = 5;
const MAX_SUBSCRIPTION_FETCHES = 50;
const MAX_TOTAL_SUBSCRIPTION_BYTES = 8 * 1024 * 1024;

async function gen_nodes(data, proxy, depth = 0) {
  if (!data || !proxy) {
    return null;
  }
  if (!Array.isArray(proxy.nodes)) {
    proxy.nodes = [];
  }
  if (typeof (data) == 'object') {
    let up, dn, to, ex;
    up = data.up; // upload
    dn = data.dn; // download
    to = data.to; // total
    ex = data.ex; // expire

    // 上游响应头里带的订阅名，最终由 index.js 放进 Content-Disposition
    if (data.name && !proxy.sub_name) {
      proxy.sub_name = data.name;
    }

    if (!isNaN(up) && !isNaN(dn) && !isNaN(to) && !isNaN(ex)) {
      if (!isNaN(proxy.up) && !isNaN(proxy.dn) && !isNaN(proxy.to) && !isNaN(proxy.ex)) {
        proxy.up += up; // 累计上传流量
        proxy.dn += dn; // 累计下载流量
        proxy.to += to; // 累计总流量
        proxy.ex = Math.max(proxy.ex, ex);  // 取最晚过期的
      } else {
        proxy.up = up;
        proxy.dn = dn;
        proxy.to = to;
        proxy.ex = ex;
      }
    }

    data = data.data;
  }
  if (typeof (data) != 'string' || data.length < 1) {
    return null;
  }
  if (data.length > MAX_FETCH_BYTES || proxy.nodes.length >= MAX_NODES) return null;
  if (!/[^-_a-zA-Z0-9+/=\r\n ]/.test(data)) {
    let d0 = decodeBase64(data);
    if (d0 != null) {
      if (depth < MAX_BASE64_DEPTH) await gen_nodes(d0, proxy, depth + 1);
      return null;
    }
  } else {
    try {
      let d1 = yaml.load(data);
      let nodes = d1['proxies'];
      if (nodes && nodes.length > 0) {
        proxy.nodes.push(...nodes.slice(0, MAX_NODES - proxy.nodes.length));
        return null;
      }
    } catch {
      // 订阅内容可能含凭据，解析器错误会带原文片段，日志只记事件不回显内容。
      console.warn('subscription YAML parse failed');
    }
    data = data.trim();
    var lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let n = lines[i].trim();
      if (!/[^-_a-zA-Z0-9+/=\r\n ]/.test(n)) {
        if (depth < MAX_BASE64_DEPTH) await gen_nodes(n, proxy, depth + 1);
        continue;
      } else {
        var pre = n.split('://')[0];
        var node = null;
        switch (pre) {
          case 'ss':
            node = decode_ss(n);
            break;
          case 'ssr':
            node = decode_ssr(n);
            break;
          case 'vmess':
            node = decode_vmess(n);
            break;
          case 'trojan':
            node = decode_trojan(n);
            break;
          case 'http':
          case 'https':
            if ((proxy.subscription_fetches || 0) < MAX_SUBSCRIPTION_FETCHES) {
              proxy.subscription_fetches = (proxy.subscription_fetches || 0) + 1;
              await gen_nodes(await decode_link(n, proxy), proxy, depth + 1);
            }
            break;
          case 'hysteria':
            node = decode_hysteria(n);
            break;
          case 'hysteria2':
          case 'hy2':
            node = decode_hysteria2(n);
            break;
          case 'vless':
            node = decode_vless(n);
            break;
        }
        if (node != null && proxy.nodes.length < MAX_NODES) {
          proxy.nodes.push(node);
        }
      }
    }
  }
  return null;
}


async function decode_link(url, proxy) {
  var t, r, z, up, dn, to, ex;
  if (!isValidUrl(url)) return null;
  const remaining_bytes = MAX_TOTAL_SUBSCRIPTION_BYTES - (proxy.subscription_bytes || 0);
  if (remaining_bytes <= 0) return null;
  const started = Date.now();
  try {
    // 只发 UA（Clash Verge 自己也不设 Accept，reqwest 默认就是 */*）。
    // 之前那个浏览器风格的 Accept 跟 clash-verge 的 UA 是矛盾的组合，
    // 按 Accept 判断「浏览器访问」的面板会回一份 HTML 首页。
    const fetched = await fetch_text_limited(url, { timeout: 8000, maxBytes: Math.min(MAX_FETCH_BYTES, remaining_bytes), headers: { 'User-Agent': sub_ua } });
    r = fetched.response;
    if (!contentTypeIsText(r.headers) || r.status != 200 || fetched.text == null) {
      return null;
    }
    t = fetched.text;
    const bytes = new TextEncoder().encode(t).byteLength;
    proxy.subscription_bytes = (proxy.subscription_bytes || 0) + bytes;
    console.info(`subscription fetch ok ms=${Date.now() - started} bytes=${bytes}`);
  } catch (e) {
    console.warn(`subscription fetch failed ms=${Date.now() - started}: ` + (e && e.message ? e.message : 'request error'));
    return null;
  }

  try {
    z = r.headers.get('subscription-userinfo');
    if (z) {
      up = parseInt(z.match(/upload=(\d+)/i)[1], 10);
      dn = parseInt(z.match(/download=(\d+)/i)[1], 10);
      to = parseInt(z.match(/total=(\d+)/i)[1], 10);
      ex = parseInt(z.match(/expire=(\d+)/i)[1], 10);
    }
  } catch (e) { }

  // 一直返回对象：订阅名要跟着节点数据一起带出去，交给响应头用。
  // 流量字段可能是 NaN，gen_nodes 里的 isNaN 判断会跳过。
  return { 'data': t, 'name': name_from_headers(r.headers), 'up': up, 'dn': dn, 'to': to, 'ex': ex };
}

export { gen_nodes, decode_link };

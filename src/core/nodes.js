import yaml from 'js-yaml';
import { get_ua_default } from './globals.js';
import { isValidUrl, contentTypeIsText, decodeBase64 } from './utils.js';
import { name_from_headers } from './sub-name.js';
import { decode_ss } from '../protocols/ss.js';
import { decode_ssr } from '../protocols/ssr.js';
import { decode_vmess } from '../protocols/vmess.js';
import { decode_trojan } from '../protocols/trojan.js';
import { decode_hysteria } from '../protocols/hysteria.js';
import { decode_hysteria2 } from '../protocols/hysteria2.js';
import { decode_vless } from '../protocols/vless.js';


async function gen_nodes(data, proxy) {
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
  if (!/[^-_a-zA-Z0-9+/=\r\n ]/.test(data)) {
    let d0 = decodeBase64(data);
    if (d0 != null) {
      await gen_nodes(d0, proxy);
      return null;
    }
  } else {
    try {
      let d1 = yaml.load(data);
      let nodes = d1['proxies'];
      if (nodes && nodes.length > 0) {
        proxy.nodes.push(...nodes);
        return null;
      }
    } catch (e) {
      console.error("yaml error: %o", e);
    }
    data = data.trim();
    var lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let n = lines[i].trim();
      if (!/[^-_a-zA-Z0-9+/=\r\n ]/.test(n)) {
        await gen_nodes(n, proxy);
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
            await gen_nodes(await decode_link(n), proxy);
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
        if (node != null) {
          proxy.nodes.push(node);
        }
      }
    }
  }
  return null;
}


async function decode_link(url) {
  var t, r, req, z, up, dn, to, ex;
  if (!isValidUrl(url)) return null;
  try {
    req = new Request(url, { 'method': 'GET', 'headers': { 'User-Agent': get_ua_default(), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' } });
    r = await fetch(req);
    if (!contentTypeIsText(r.headers) || r.status != 200) {
      return null;
    }
    t = await r.text();
  } catch (e) {
    console.error("fetch error: " + url + '\n', e);
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

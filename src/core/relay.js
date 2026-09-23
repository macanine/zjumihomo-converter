import { sub_ua } from './globals.js';

// 中继：把订阅链接交给 api.v1.mk 转一遍，再把它的结果交给客户端。
// 借它的规则/重命名/emoji 等处理能力，同时客户端只看到我们的域名。
//
// 拉机场时用它自己的 UA 参数（diyua）写成跟我们本地一致的那个，否则中继和本地两条路
// 可能拿到不同的订阅内容（机场按 UA 区分返回）。它那边失败就返回 null，由调用方落回
// 本地转换——客户端拿不到配置比多一层转换严重得多。
const RELAY_ENDPOINT = 'https://api.v1.mk/sub';

async function gen_relay(url, list_mode) {
  let q = new URLSearchParams({ target: 'clash', url: url, diyua: sub_ua });
  if (list_mode) q.set('list', 'true');

  let r, body;
  try {
    r = await fetch(new Request(RELAY_ENDPOINT + '?' + q.toString(), {
      method: 'GET',
      headers: { 'User-Agent': sub_ua },
    }));
    if (r.status != 200) {
      console.warn('relay: api.v1.mk 返回 ' + r.status);
      return null;
    }
    body = await r.text();
  } catch (e) {
    console.warn('relay: 请求 api.v1.mk 失败 ' + e);
    return null;
  }

  // 200 也可能是它的错误页，认不出配置就当失败，别把 HTML 塞给客户端
  if (!body.includes('proxies:')) {
    console.warn('relay: api.v1.mk 返回的不是配置');
    return null;
  }

  // 只透传和客户端有关的三样：内容类型、流量信息、订阅名
  let headers = { 'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8' };
  let ui = r.headers.get('subscription-userinfo');
  if (ui) headers['Subscription-Userinfo'] = ui;
  let cd = r.headers.get('content-disposition');
  if (cd) headers['Content-Disposition'] = cd;
  return new Response(body, { status: 200, headers });
}

export { gen_relay, RELAY_ENDPOINT };

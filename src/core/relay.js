import { sub_ua } from './globals.js';

// 中继：只借 api.v1.mk 拉取并标准化节点，最终配置仍由本项目组装。
//
// 拉机场时用它自己的 UA 参数（diyua）写成跟我们本地一致的那个，否则中继和本地两条路
// 可能拿到不同的订阅内容（机场按 UA 区分返回）。它那边失败就返回 null，由调用方落回
// 本地转换——客户端拿不到配置比多一层转换严重得多。
const RELAY_ENDPOINT = 'https://api.v1.mk/sub';

async function gen_relay(url) {
  let q = new URLSearchParams({ target: 'clash', url: url, diyua: sub_ua });

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

  // 调用方把这份 YAML 当作节点输入交给 gen_cfg，不透传 api.v1.mk 的规则和配置。
  return { body, headers: {
    'content-type': r.headers.get('content-type') || 'text/plain; charset=utf-8',
    'subscription-userinfo': r.headers.get('subscription-userinfo') || '',
    'content-disposition': r.headers.get('content-disposition') || '',
  } };
}

export { gen_relay, RELAY_ENDPOINT };

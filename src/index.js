import yaml from 'js-yaml';

import { key_default, set_ua_default } from './core/globals.js';
import { gen_cfg } from './core/config-builder.js';
import { content_disposition } from './core/sub-name.js';
import { nginx } from './pages/nginx.js';
import { gen_html } from './pages/html.js';
import { gen_icon } from './pages/favicon.js';

export default {
  async fetch(request, env, ctx) {
    let key = (env.key || key_default).replace(/\W/g, '');
    let url = new URL(request.url);

    if (url.pathname.search(new RegExp('^(?:|\/*|(\/+index.html?)?)$')) != -1) {
      return nginx(200);
    }
    else if (url.pathname.search(new RegExp('^\/' + key + '($|\/)')) != -1) {
      const SUBINF = '/sub';   // 订阅转换接口
      let path = url.pathname.slice(key.length + 1);
      if (path.search(new RegExp('^(?:|\/(index.html?)?)$')) != -1) {
        return gen_html(url.origin + '/' + key + SUBINF + '?');
      }
      else if (path == SUBINF) {
        let ua = request.headers.get('User-Agent');
        if (ua && typeof (ua) == 'string' && ua.length > 0) {
          set_ua_default(ua);
        }
        let headers = { 'Content-Type': 'text/plain; charset=utf-8' };
        let par = url.searchParams;
        let t = par.get('target');
        let u = par.get('url');
        if (u) {
          u = u.replaceAll('|', '\n');
        }

        // 其他配置参数。端口和 UI 密钥不再开放，用 src/config.js 里的默认值。
        let varnamelist = ['udp', 'tfo', 'dns', 'list', 'rules', 'ovr'];
        let varlist = [];
        varnamelist.forEach((v) => {
          let w = par.get(v) || undefined;
          varlist.push(w)
        });

        if (t == 'clash') {
          let x = await gen_cfg(u, ...varlist);
          if (x != null) {
            let y = yaml.dump(x.data);
            let up = x.up;
            let dn = x.dn;
            let to = x.to;
            let ex = x.ex;
            if (!isNaN(up) && !isNaN(dn) && !isNaN(to) && !isNaN(ex)) {
              headers['Subscription-Userinfo'] = `upload=${up}; download=${dn}; total=${to}; expire=${ex}`;
            }
            // 客户端拿它给新配置命名，否则名字就是 URL 末段「sub」
            let cd = content_disposition(x.sub_name, u);
            if (cd) {
              headers['Content-Disposition'] = cd;
            }
            return new Response(y, { status: 200, headers });
          } else {
            return new Response('no valid nodes.', { status: 404, headers });
          }
        } else {
          return new Response('unsupported target.', { status: 403, headers });
        }
      }
    }
    else if (url.pathname == '/favicon.ico') {
      return gen_icon();
    }
    return nginx(404);
  },

};

import { decodeURIComponentSafe } from '../core/utils.js';


function decode_hysteria(hysteriaLink) {
  const pre = 'hysteria://';
  var dataPart, parts, server, port, params, name, alpn, randomName, hysteria;
  if (!hysteriaLink.startsWith(pre)) {
    return null;
  }
  try {
    dataPart = hysteriaLink.slice(pre.length);
    parts = new URL('http://' + dataPart);
    server = parts["hostname"];
    port = parseInt(parts["port"] || '80', 10);
    name = parts["hash"];
    if (name) {
      name = decodeURIComponentSafe(name.slice(1));
    }
    params = parts.searchParams;
  } catch (e) {
    console.error("Hysteria decode error: " + hysteriaLink + '\n', e);
    return null;
  }

  if (!port || !server) return null;
  randomName = `hy-${Math.random().toString(36).substring(2, 12)}`;

  hysteria = {};
  hysteria["name"] = name || randomName;
  hysteria["type"] = 'hysteria';
  hysteria["server"] = server;
  hysteria["port"] = port;
  hysteria["sni"] = params.get("peer") || "";
  hysteria["obfs"] = params.get("obfs") || "";
  alpn = params.get("alpn") || "";
  if (alpn) {
    hysteria["alpn"] = alpn.split(",");
  }
  hysteria["auth_str"] = params.get("auth");
  hysteria["protocol"] = params.get("protocol");
  hysteria["up"] = params.get("up") || params.get("upmbps") || "10";        // 默认10Mbps
  hysteria["down"] = params.get("down") || params.get("downmbps") || "10";
  hysteria["skip-cert-verify"] = /y|t|1|on/i.test(params.get("insecure"));

  return hysteria;
}

export { decode_hysteria };

import { decodeURIComponentSafe } from '../core/utils.js';


function decode_hysteria2(hysteria2Link) {
  const pre1 = 'hysteria2://';
  const pre2 = 'hy2://';
  var dataPart, u, server, port, params, name, alpn, obfs, sni, auth, randomName, hysteria2, fp, up, down;
  if (hysteria2Link.startsWith(pre1)) {
    dataPart = hysteria2Link.slice(pre1.length);
  } else if (hysteria2Link.startsWith(pre2)) {
    dataPart = hysteria2Link.slice(pre2.length);
  } else {
    return null;
  }

  try {
    u = new URL('https://' + dataPart);
    server = u.hostname;
    port = parseInt(u.port || "443", 10);
    name = u.hash;
    if (name) {
      name = decodeURIComponentSafe(name.slice(1));
    }
    params = u.searchParams;
  } catch (e) {
    console.error("Hysteria2 decode error: " + hysteria2Link + '\n', e);
    return null;
  }

  if (!server) return null;
  randomName = `hy2-${Math.random().toString(36).substring(2, 12)}`;

  hysteria2 = {};
  hysteria2["name"] = name || randomName;
  hysteria2["type"] = 'hysteria2';
  hysteria2["server"] = server;
  hysteria2["port"] = port;

  obfs = params.get("obfs");
  if (obfs && obfs.toLowerCase() !== "none") {
    hysteria2["obfs"] = obfs;
    hysteria2["obfs-password"] = params.get("obfs-password");
    if(!hysteria2["obfs-password"]) {
      return null;
    }
  }
  sni = params.get("sni") || params.get("peer");
  if (sni) {
    hysteria2["sni"] = sni;
  }
  alpn = params.get("alpn") || "";
  if (alpn) {
    hysteria2["alpn"] = alpn.split(",");
  }
  hysteria2["skip-cert-verify"] = /y|t|1|on/i.test(params.get("insecure"));
  auth = u.username;
  if (auth) {
    hysteria2["password"] = auth;
  }
  fp = params.get("pinSHA256");
  if (fp) {
    hysteria2["fingerprint"] = fp;
  }
  up = params.get("up");
  if (up) {
    hysteria2["up"] = up;
  }
  down = params.get("down");
  if (down) {
    hysteria2["down"] = down;
  }

  return hysteria2;
}

export { decode_hysteria2 };

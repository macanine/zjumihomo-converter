import { decodeURIComponentSafe } from '../core/utils.js';
import { udp_default, tfo_default } from '../core/globals.js';


function decode_vless(vlessLink) {
  const pre = 'vless://';
  var dataPart, parts, server, port, uuid, params, name, vless, randomName;
  if (!vlessLink.startsWith(pre)) {
    return null;
  }
  try {
    dataPart = vlessLink.slice(pre.length);
    parts = new URL('http://' + dataPart);
    uuid = parts["username"];
    server = parts["hostname"];
    port = parseInt(parts["port"] || '80', 10);
    name = parts["hash"];
    if (name) {
      name = decodeURIComponentSafe(name.slice(1));
    }
    params = parts.searchParams;
  } catch (e) {
    console.error("vless decode error: " + vlessLink + '\n', e);
    return null;
  }

  if (!port || !server || !uuid) return null;
  randomName = `vless-${Math.random().toString(36).substring(2, 12)}`;

  vless = {};
  vless["name"] = name || randomName;
  vless["type"] = 'vless';
  vless["server"] = server;
  vless["port"] = port;
  vless["uuid"] = uuid;
  vless["udp"] = udp_default;
  vless["tfo"] = tfo_default;

  let tls = (params.get("security") || '').toLowerCase();
  if (tls.endsWith("tls") || tls == "reality") {
    vless["tls"] = true;
    let fingerprint = params.get("fp");
    if (!fingerprint) {
      vless["client-fingerprint"] = "chrome";
    } else {
      vless["client-fingerprint"] = fingerprint;
    }
    let alpn = params.get("alpn");
    if (alpn) {
      vless["alpn"] = alpn.split(",");
    }
  }
  let host = params.get("host");
  let sni = params.get("sni") || host;
  if (sni) {
    vless["servername"] = sni;
  }
  let realityPublicKey = params.get("pbk");
  if (/^[A-Za-z0-9+\/]+={0,2}$/.test(realityPublicKey)) {
    let sid = params.get("sid");
    vless["reality-opts"] = {
      "public-key": realityPublicKey,
      "short-id": (sid && /^([0-9a-fA-F]{2})+$/.test(sid)) ? sid : ""
    };
  }

  let switchEncoding = params.get("packetEncoding");
  if (!switchEncoding || switchEncoding == "none") {
    // Do nothing
  } else if (switchEncoding == "packet") {
    vless["packet-encoding"] = "packet-addr";
  } else {
    vless["packet-encoding"] = "xudp";
  }

  let network = params.get("type") || "";
  network = network.toLowerCase();
  if (!network) {
    network = "tcp";
  }
  let fakeType = params.get("headerType") || "";
  fakeType = fakeType.toLowerCase();
  if (network == "tcp" && fakeType == "http") {
    network = "http";
  } else if (network == "http") {
    network = "h2";
  }
  vless["network"] = network;

  if (network == "http") {
    let headers = {};
    let httpOpts = {};
    httpOpts["path"] = ["/"];
    if (host) {
      headers["Host"] = host.split(",");
    }
    let method = params.get("method");
    if (method) {
      httpOpts["method"] = method;
    }
    let path = params.get("path");
    if (path) {
      httpOpts["path"] = path.split(",");
    }
    httpOpts["headers"] = headers;
    vless["http-opts"] = httpOpts;
  } else if (network == "h2") {
    let headers = {};
    let h2Opts = {};
    h2Opts["path"] = "/";
    let path = params.get("path");
    if (path) {
      h2Opts["path"] = String(path);
    }
    let host = params.get("host");
    if (host) {
      h2Opts["host"] = host.split(",");
    }
    h2Opts["headers"] = headers;
    vless["h2-opts"] = h2Opts;
  } else if (network == "ws") {
    let headers = {};
    let wsOpts = {};
    headers["User-Agent"] = "Mozilla/5.0"; // Replace with a random user agent if needed
    let host = params.get("host");
    if (host) {
      headers["host"] = String(host);
    }
    let path = params.get("path");
    if (path) {
      wsOpts["path"] = String(path);
    }
    wsOpts["headers"] = headers;

    let earlyData = params.get("ed");
    if (earlyData) {
      try {
        let med = parseInt(earlyData);
        wsOpts["max-early-data"] = med;
      } catch (e) { }
    }
    let earlyDataHeader = params.get("edh");
    if (earlyDataHeader) {
      wsOpts["early-data-header-name"] = earlyDataHeader;
    }

    vless["ws-opts"] = wsOpts;
  } else if (network == "grpc") {
    let grpcOpts = {};
    grpcOpts["grpc-service-name"] = params.get("serviceName") || '';
    vless["grpc-opts"] = grpcOpts;
  }
  let flow = params.get("flow");
  if (flow) {
    flow = String(flow).toLowerCase();
    let s = new Set(['xtls-rprx-vision-udp443', 'udp443']);
    if (s.has(flow)) {
      vless["flow"] = flow;
    } else {
      try {
        s.forEach((v) => {
          if (RegExp(v, 'i').test(flow)) {
            vless["flow"] = v;
            throw new Error();
          }
        });
      } catch (e) { }
    }
  }

  return vless;
}

export { decode_vless };

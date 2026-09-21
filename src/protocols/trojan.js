import { decodeURIComponentSafe } from '../core/utils.js';
import { udp_default, tfo_default } from '../core/globals.js';


function decode_trojan(trojanLink) {
  const pre = 'trojan://';
  var dataPart, parts, server, port, password, params, name, trojan, randomName;
  if (!trojanLink.startsWith(pre)) {
    return null;
  }
  try {
    dataPart = trojanLink.slice(pre.length);
    parts = new URL('https://' + dataPart);
    server = parts["hostname"];
    port = parseInt(parts["port"] || '443', 10);
    name = parts["hash"];
    if (name) {
      name = decodeURIComponentSafe(name.slice(1));
    }
    params = parts.searchParams;
    password = parts["username"];
  } catch (e) {
    console.error("Trojan decode error: " + trojanLink + '\n', e);
    return null;
  }

  if (!port || !server || !password) return null;
  randomName = `trojan-${Math.random().toString(36).substring(2, 12)}`;

  trojan = {};
  trojan["name"] = name || randomName;
  trojan["type"] = 'trojan';
  trojan["server"] = server;
  trojan["port"] = port;
  trojan["password"] = password;
  trojan["udp"] = udp_default;
  trojan["tfo"] = tfo_default;

  //let tls = params.get("security");
  //if (tls && (tls.endsWith("tls"))) {
  //  trojan["tls"] = true;
  //}
  let skip_cert_verify = params.get("allowInsecure");
  if (skip_cert_verify) {
    trojan["skip-cert-verify"] = /y|t|1|on/i.test(skip_cert_verify);
  }
  let sni = params.get("sni");
  if (sni) {
    trojan["sni"] = sni;
  }
  let alpn = params.get("alpn");
  if (alpn) {
    trojan["alpn"] = alpn.split(",");
  }
  let network = params.get("type") || "";
  network = network.toLowerCase();
  if (network) {
    trojan["network"] = network;
  }

  if (network === "ws") {
    let headers = {};
    let wsOpts = {};
    let path = params.get("path");
    if (path) {
      wsOpts["path"] = path;
    }
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36";
    wsOpts["headers"] = headers;
    trojan["ws-opts"] = wsOpts;
  }
  else if (network === "grpc") {
    let grpcOpts = {};
    grpcOpts["grpc-service-name"] = params.get("serviceName") || '';
    trojan["grpc-opts"] = grpcOpts;
  }

  let fingerprint = params.get("fp");
  if (!fingerprint) {
    trojan["client-fingerprint"] = "chrome";
  } else {
    trojan["client-fingerprint"] = fingerprint;
  }

  return trojan;
}

export { decode_trojan };

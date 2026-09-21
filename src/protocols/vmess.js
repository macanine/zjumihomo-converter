import { decodeBase64 } from '../core/utils.js';
import { udp_default, tfo_default } from '../core/globals.js';


function decode_vmess(vmessLink) {
  const pre = 'vmess://';
  var base64Part, values, vmess, network, tls, alpn, sni, headers, httpOpts, h2Opts, wsOpts, grpcOpts, cipher, host, path, fp;
  if (!vmessLink.startsWith(pre)) {
    return null;
  }
  try {
    base64Part = vmessLink.slice(pre.length);
    values = JSON.parse(decodeBase64(base64Part));
  } catch (e) {
    console.error("vmess decode error: " + vmessLink + '\n', e);
    return null;
  }

  vmess = {};
  vmess["name"] = values["ps"];
  vmess["type"] = 'vmess';
  vmess["server"] = values["add"];
  vmess["port"] = parseInt(values["port"] || '443', 10);
  vmess["uuid"] = values["id"];

  if (!vmess["uuid"] || !vmess["server"] || !vmess["port"]) {
    console.error("vmess decode error: " + vmessLink);
    return null;
  }

  vmess["alterId"] = values["aid"] || 0;
  vmess["udp"] = udp_default;
  vmess["tfo"] = tfo_default;
  //vmess["xudp"] = true;
  vmess["tls"] = false;
  vmess["skip-cert-verify"] = true;

  vmess["cipher"] = "auto";
  cipher = values["scy"];
  if (cipher) {
    vmess["cipher"] = cipher;
  }

  sni = values["sni"];
  if (sni) {
    vmess["servername"] = sni;
  }

  network = values["net"] || "tcp";
  network = network.toLowerCase();
  if (values["type"] === "http") {
    network = "http";
  } else if (network === "http") {
    network = "h2";
  }
  vmess["network"] = network;

  tls = values["tls"];
  if (tls !== undefined) {
    tls = tls.toString().toLowerCase();
    if (tls.endsWith("tls")) {
      vmess["tls"] = true;
    }
    alpn = values["alpn"];
    if (alpn) {
      vmess["alpn"] = alpn.split(",");
    }
  }

  fp = values["fp"];
  if (fp) {
    vmess["client-fingerprint"] = fp;
  }

  path = values["path"];
  host = values["host"];
  if (network === "http") {
    headers = {};
    httpOpts = {};
    if (host) {
      headers["Host"] = host.split(',');
    }
    httpOpts["path"] = ["/"];
    if (path) {
      httpOpts["path"] = path.split(',');
    }
    httpOpts["headers"] = headers;
    vmess["http-opts"] = httpOpts;

  } else if (network === "h2") {
    headers = {};
    h2Opts = {};
    if (host) {
      headers["Host"] = host.split(',');
    }
    if (path) {
      h2Opts["path"] = path;
    }
    h2Opts["headers"] = headers;
    vmess["h2-opts"] = h2Opts;

  } else if (network === "ws") {
    headers = {};
    wsOpts = {};
    wsOpts["path"] = "/";
    if (host) {
      headers["Host"] = host.split(',')[0];
    }
    if (path) {
      wsOpts["path"] = path;
    }
    wsOpts["headers"] = headers;
    vmess["ws-opts"] = wsOpts;

  } else if (network === "grpc") {
    grpcOpts = {};
    if (path) {
      grpcOpts["grpc-service-name"] = path;
    }
    vmess["grpc-opts"] = grpcOpts;
  }
  return vmess;
}

export { decode_vmess };

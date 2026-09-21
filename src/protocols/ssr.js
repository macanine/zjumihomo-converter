import { decodeBase64 } from '../core/utils.js';
import { udp_default } from '../core/globals.js';


function decode_ssr(ssrLink) {
  const pre = 'ssr://';
  const ssrCiphers = new Set([
    "none", "table", "rc4", "rc4-md5", "aes-128-cfb", "aes-192-cfb", "aes-256-cfb",
    "aes-128-ctr", "aes-192-ctr", "aes-256-ctr", "bf-cfb", "camellia-128-cfb",
    "camellia-192-cfb", "camellia-256-cfb", "cast5-cfb", "des-cfb", "idea-cfb",
    "rc2-cfb", "seed-cfb", "salsa20", "chacha20", "chacha20-ietf"
  ]);
  var base64Part, decoded, serverInfo, queryString, server, port, protocol, cipher, obfs, passwordBase64, params, protocol_param, obfs_param, remarks, password, randomName;

  if (!ssrLink.startsWith(pre)) {
    return null;
  }

  try {
    base64Part = ssrLink.slice(pre.length);
    decoded = decodeBase64(base64Part);

    // 分割服务器信息和查询参数
    [serverInfo, queryString] = decoded.split('/?');
    [server, port, protocol, cipher, obfs, passwordBase64] = serverInfo.split(':');

    // 解析查询参数
    params = new URLSearchParams(queryString);
    protocol_param = decodeBase64(params.get('protoparam'));
    obfs_param = decodeBase64(params.get('obfsparam'));
    remarks = decodeBase64(params.get('remarks'));
    password = decodeBase64(passwordBase64);
  } catch (e) {
    console.error("SSR decode error: " + ssrLink + '\n', e);
    return null;
  }

  if (!port || !password || !cipher || !ssrCiphers.has(cipher.toLowerCase())) return null;
  randomName = `ssr-${Math.random().toString(36).substring(2, 12)}`;

  return {
    name: remarks || randomName,
    type: "ssr",
    server: server,
    port: parseInt(port, 10),
    password: password,
    cipher: cipher,
    protocol: protocol,
    protocol_param: protocol_param || '',
    obfs: obfs,
    obfs_param: obfs_param || '',
    udp: udp_default
  };
}

export { decode_ssr };

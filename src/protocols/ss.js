import { decodeBase64, decodeURIComponentSafe } from '../core/utils.js';
import { udp_default, tfo_default } from '../core/globals.js';


function decode_ss(ssLink) {
  const pre = 'ss://';
  const ssCiphers = new Set([
    "rc4-md5", "aes-128-gcm", "aes-192-gcm", "aes-256-gcm", "aes-128-cfb",
    "aes-192-cfb", "aes-256-cfb", "aes-128-ctr", "aes-192-ctr", "aes-256-ctr",
    "camellia-128-cfb", "camellia-192-cfb", "camellia-256-cfb", "bf-cfb",
    "chacha20-ietf-poly1305", "xchacha20-ietf-poly1305", "salsa20", "chacha20",
    "chacha20-ietf", "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm",
    "2022-blake3-chacha20-poly1305", "2022-blake3-chacha12-poly1305",
    "2022-blake3-chacha8-poly1305"
  ]);

  var datapart, password, cipher, server, port, name, ss, parts, decodedPassword, randomName, t0, t1, plugin, pl;

  if (!ssLink.startsWith(pre)) {
    return null;
  }
  try {
    datapart = ssLink.slice(pre.length);

    name = '';
    t0 = datapart.match(/(?<=#)\S+/);
    if (t0) {
      name = decodeURIComponentSafe(t0[0]);
      datapart = datapart.replace(/#.*/, '');
    }

    plugin = {};
    t0 = datapart.match(/(?<=\?)\S+/);
    if (t0) {
      datapart = datapart.replace(/\/?\?.*/, '');
      t0 = decodeURIComponentSafe(t0[0]);
      t0 = t0.replaceAll(';', '&');
      t0 = new URLSearchParams(t0);
      pl = t0.get('plugin');
      switch (pl) {
        case 'obfs-local':
        case 'simple-obfs':
          plugin['plugin'] = 'obfs';
          plugin['plugin-opts'] = {};
          t1 = t0.get('obfs');
          if (t1) plugin['plugin-opts']['mode'] = t1;
          t1 = t0.get('obfs-host');
          if (t1) plugin['plugin-opts']['host'] = t1;
          break;
        case 'v2ray-plugin':
        case 'gost-plugin':
          plugin['plugin'] = pl;
          plugin['plugin-opts'] = {};
          plugin['plugin-opts']['mode'] = t0.get('mode') || 'websocket';
          plugin['plugin-opts']['host'] = t0.get('host') || '';
          plugin['plugin-opts']['path'] = t0.get('path') || '';
          t1 = t0.get('tls');
          plugin['plugin-opts']['tls'] = (t1 != null);
          t1 = t0.get('mux');
          plugin['plugin-opts']['mux'] = (t1 != null && (!/0|off|false/i.test(t1)));
          plugin['plugin-opts']['skip-cert-verify'] = true;
          break;
        case 'shadow-tls':
        case 'restls':
          plugin['plugin'] = pl;    // TODO
          break;
      }
    }

    if (/@\S+:\d+/.test(datapart)) {  // ss://base64(cipher:pswd)@server:port
      parts = datapart.split(/[@:]/);
      decodedPassword = decodeBase64(parts[0]);
      cipher = decodedPassword.split(':')[0];
      password = decodedPassword.split(':')[1];
      server = parts[1];
      port = parseInt(parts[2], 10);
    } else if (/^[-_a-zA-Z0-9+\/=]+$/.test(datapart)) {   // ss://bas64(cipher:pswd@server:port)
      datapart = decodeBase64(datapart);
      parts = datapart.split(/[@:]/);
      cipher = parts[0];
      password = parts[1];
      server = parts[2];
      port = parseInt(parts[3], 10);
    }
  } catch (e) {
    console.error("SS decode error: " + ssLink + '\n', e);
    return null;
  }

  if (!port || !cipher || !ssCiphers.has(cipher.toLowerCase())) return null;
  randomName = `ss-${Math.random().toString(36).substring(2, 12)}`;

  ss = { name: name || randomName, type: "ss", server: server, port: port, cipher: cipher, password: password, ...plugin, udp: udp_default, tfo: tfo_default };

  return ss;
}

export { decode_ss };

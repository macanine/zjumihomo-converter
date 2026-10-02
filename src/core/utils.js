const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal') return false;
  // URL 将非标准 IPv4（如 127.1 或整数形式）规范化为点分格式。
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const p = host.split('.').map(Number);
    const [a, b] = p;
    if (p.some(x => x > 255) || a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
        (a === 198 && (b === 18 || b === 19))) return false;
    return true;
  }
  if (host.includes(':')) {
    if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
        /^fe[89ab]/.test(host) || host.startsWith('::ffff:')) return false;
    return host.startsWith('2') || host.startsWith('3');
  }
  return true;
}

function parsePublicHttpUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !isPublicHost(u.hostname)) return null;
    return u;
  } catch { return null; }
}

function isValidUrl(value) {
  return typeof value === 'string' && parsePublicHttpUrl(value) !== null;
}

/** 有超时、重定向重校验和读取上限的文本请求。 */
async function fetch_text_limited(value, { timeout = 8000, maxBytes = MAX_FETCH_BYTES, headers = {} } = {}) {
  let url = parsePublicHttpUrl(value);
  if (!url) throw new Error('URL 不允许访问');
  const deadline = Date.now() + timeout;
  for (let redirects = 0; ; redirects++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('请求超时');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response;
    try {
      response = await fetch(new Request(url, { method: 'GET', headers, redirect: 'manual', signal: controller.signal }));
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timer);
      if (response.body) await response.body.cancel();
      if (redirects >= MAX_REDIRECTS) throw new Error('重定向次数过多');
      const location = response.headers.get('location');
      let next;
      try { next = location && parsePublicHttpUrl(new URL(location, url).href); } catch { next = null; }
      if (!next) throw new Error('重定向目标不允许访问');
      url = next;
      continue;
    }
    if (response.status !== 200) {
      clearTimeout(timer);
      if (response.body) await response.body.cancel();
      return { response, text: null };
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) { clearTimeout(timer); throw new Error('响应内容过大'); }
    if (!response.body) { clearTimeout(timer); return { response, text: '' }; }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('响应内容过大'); }
        chunks.push(chunk);
      }
    } finally { clearTimeout(timer); reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { response, text: new TextDecoder().decode(bytes) };
  }
}

function contentTypeIsText(headers) {
  let a = headers.get("content-type");
  return !a || /text\/|javascript|urlencoded|json|yaml|octet-stream/i.test(a);
}

function decodeBase64(str) {
  if (!str || str.length == 0) return null;
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  str = Buffer.from(str, 'base64').toString('utf-8');
  if (str.includes('\ufffd')) return null;
  return str;
}

function decodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str.replace(/%(?![0-9a-fA-F]{2})/g, '%25'));
  } catch { return str; }
}

export { isValidUrl, parsePublicHttpUrl, fetch_text_limited, MAX_FETCH_BYTES, contentTypeIsText, decodeBase64, decodeURIComponentSafe };

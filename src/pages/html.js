// Bootstrap CDN。只引 CSS，不引 JS——页面没有弹窗/下拉之类需要 JS 的组件，
// 少一个请求。图标用 emoji，不引图标库。
const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';

function gen_html(pre) {
  let t = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>zjumihomo</title>
<link href="${BOOTSTRAP_CSS}" rel="stylesheet">
<style>
  body { background: #f6f7f9; }
  .app { max-width: 860px; }
  .card { border: 1px solid #e6e8eb; border-radius: .75rem; }
  .brand { font-weight: 600; letter-spacing: .01em; }
  .brand small { font-weight: 400; }
  .form-label { font-size: .875rem; color: #495057; margin-bottom: .25rem; }
  .hint { font-size: .78rem; color: #8a9199; }
  .form-control, .form-select { font-size: .9rem; }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
  .section + .section { border-top: 1px solid #eef0f2; margin-top: 1.25rem; padding-top: 1.25rem; }
  .out { background: #fbfbfc; }
  footer { font-size: .78rem; color: #9aa1a9; }
</style>
</head>
<body>
<div class="container app py-4 py-md-5">

  <div class="d-flex align-items-baseline justify-content-between mb-3">
    <div class="brand fs-4">zjumihomo <small class="text-muted fs-6">订阅转换</small></div>
    <span class="hint">mihomo / clash</span>
  </div>

  <div class="card shadow-sm">
    <div class="card-body p-4">

      <div class="section">
        <label for="inputText" class="form-label">订阅链接</label>
        <textarea id="inputText" class="form-control" rows="4"
          placeholder="支持订阅链接 / base64订阅内容 / ss、ssr、vmess、trojan、vless、hysteria、hysteria2 节点&#10;多个链接每行一个，或用 | 分隔"></textarea>
      </div>

      <div class="section">
        <div class="row g-3">
          <div class="col-md-5">
            <label for="rules" class="form-label">分流规则</label>
            <select id="rules" class="form-select">
              <option value="mini" selected>ACL4SSR Mini（约 3400 条）</option>
              <option value="mini_adblock">ACL4SSR Mini + 去广告</option>
              <option value="mini_multi">ACL4SSR Mini 多模式</option>
              <option value="mini_multicountry">ACL4SSR Mini 多国家</option>
              <option value="full">ACL4SSR Full（约 9500 条）</option>
              <option value="full_adblock">ACL4SSR Full + 去广告</option>
              <option value="full_netflix">ACL4SSR Full + 奈飞</option>
            </select>
            <div class="hint mt-1">转换时从 ACL4SSR 云端拉取，需要能访问 GitHub</div>
          </div>
          <div class="col-md-3">
            <label for="client" class="form-label">客户端</label>
            <select id="client" class="form-select">
              <option value="clash" selected>mihomo / clash</option>
            </select>
            <div class="hint mt-1">目前仅支持 clash 内核</div>
          </div>
          <div class="col-md-4">
            <label for="dns" class="form-label">DNS</label>
            <select id="dns" class="form-select">
              <option value="1" selected>启用（默认）</option>
              <option value="2">仅监听</option>
              <option value="0">禁用</option>
            </select>
            <div class="hint mt-1">fake-ip 模式，含国内外分流解析</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="row g-3 align-items-start">
          <div class="col-md-6">
            <div class="form-label">UDP 代理</div>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="udp" id="udp2" value="2" checked>
              <label class="btn btn-outline-secondary btn-sm" for="udp2">默认</label>
              <input type="radio" class="btn-check" name="udp" id="udp1" value="1">
              <label class="btn btn-outline-secondary btn-sm" for="udp1">启用</label>
              <input type="radio" class="btn-check" name="udp" id="udp0" value="0">
              <label class="btn btn-outline-secondary btn-sm" for="udp0">禁用</label>
            </div>
          </div>
          <div class="col-md-6">
            <div class="form-label">TCP Fast Open</div>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="tfo" id="tfo2" value="2" checked>
              <label class="btn btn-outline-secondary btn-sm" for="tfo2">默认</label>
              <input type="radio" class="btn-check" name="tfo" id="tfo1" value="1">
              <label class="btn btn-outline-secondary btn-sm" for="tfo1">启用</label>
              <input type="radio" class="btn-check" name="tfo" id="tfo0" value="0">
              <label class="btn btn-outline-secondary btn-sm" for="tfo0">禁用</label>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="ovr" checked>
          <label class="form-check-label" for="ovr">
            校园网覆写
            <span class="hint d-block">添加 ZJUconnect 节点（127.0.0.1:1090）与「校园网」策略组，把浙大相关规则置顶，校内域名交给校内 DNS（10.10.0.21）解析</span>
          </label>
        </div>
      </div>

      <div class="section">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="lm" onchange="toggleList()">
          <label class="form-check-label" for="lm">
            仅输出节点列表
            <span class="hint d-block">只输出 proxies 段，不含策略组和规则</span>
          </label>
        </div>
      </div>

      <div class="section">
        <button class="btn btn-primary" onclick="processText()">生成订阅链接</button>
        <button class="btn btn-success" onclick="importToClash()">一键导入</button>
        <button class="btn btn-outline-secondary" onclick="copyOut()">复制</button>
        <span id="copied" class="hint ms-2"></span>
        <div class="mt-3">
          <textarea id="outputText" class="form-control out" rows="3" readonly
            placeholder="生成的订阅链接会显示在这里"></textarea>
        </div>
        <div class="hint mt-2">
          「一键导入」用 clash:// 唤起 Clash Verge / ClashX / Mihomo Party 等客户端；
          没反应就复制链接到客户端里手动添加
        </div>
      </div>

    </div>
  </div>

  <footer class="text-center mt-3">
    规则来自 <a href="https://github.com/ACL4SSR/ACL4SSR" class="text-decoration-none">ACL4SSR</a>
    · 源码在 <a href="https://github.com/macanine/zjumihomo-converter" class="text-decoration-none">GitHub</a>
  </footer>
</div>

<script>
function toggleList() {
  var on = document.getElementById('lm').checked;
  // 列表模式只输出节点，这些参数都无意义，置灰避免误解
  ['rules', 'dns', 'ovr'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.disabled = on;
  });
  ['udp', 'tfo'].forEach(function (n) {
    document.getElementsByName(n).forEach(function (el) { el.disabled = on; });
  });
}

function processText() {
  var a, js = {};
  a = document.getElementById('inputText').value.trim();
  if (!a) { return; }
  js.url = a.split('\\n').join('|');

  a = document.getElementById('client');
  try { js.target = a.value; } catch (e) {}

  ['udp', 'tfo'].forEach(function (n) {
    try {
      var els = document.getElementsByName(n);
      for (var i = 1; i < els.length; i++) {
        if (els[i].checked) { js[n] = els[i].value; break; }
      }
    } catch (e) {}
  });

  if (document.getElementById('lm').checked) {
    js['list'] = 'true';
  } else {
    try {
      var dns = document.getElementById('dns').value;
      if (dns) { js['dns'] = dns; }
    } catch (e) {}
    try {
      var rl = document.getElementById('rules').value;
      if (rl) { js.rules = rl; }
    } catch (e) {}
  }

  // 校园网覆写：勾选时不传参（默认开启），取消勾选时显式传 0 关闭
  try {
    if (!document.getElementById('ovr').checked) { js.ovr = '0'; }
  } catch (e) {}

  document.getElementById('outputText').value =
    '${pre}' + new URLSearchParams(js).toString();
  document.getElementById('copied').textContent = '';
}

// 唤起本机 Clash 客户端导入订阅。clash://install-config?url= 是 Clash Verge、
// ClashX、Mihomo Party 等客户端通用的一键导入协议。url 必须放在最后：
// Clash Verge 把 url= 之后的整串都当成订阅地址。
function importToClash() {
  processText();
  var el = document.getElementById('outputText');
  var tip = document.getElementById('copied');
  if (!el.value) { return; }
  try {
    location.href = 'clash://install-config?url=' + encodeURIComponent(el.value);
    tip.textContent = '已唤起 Clash，没反应就复制链接手动导入';
  } catch (e) {
    tip.textContent = '未能唤起 Clash，请复制链接手动导入';
  }
}

function copyOut() {
  var el = document.getElementById('outputText');
  if (!el.value) { return; }
  var done = function () { document.getElementById('copied').textContent = '已复制'; };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(el.value).then(done, function () { el.select(); });
  } else {
    el.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
  }
}
</script>
</body>
</html>`;
  return new Response(t, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export { gen_html };

// Bootstrap CDN。只引 CSS，不引它的 JS——页面没有弹窗/下拉之类需要 JS 的组件，
// 少一个请求。图标用 emoji，不引图标库。深色模式跟随系统（一段内联脚本切
// data-bs-theme，Bootstrap 5.3 自带深色变量，写在 head 里避免闪白）。
const BOOTSTRAP_CSS = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';

function gen_html(pre) {
  let t = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>zjumihomo 订阅转换</title>
<link href="${BOOTSTRAP_CSS}" rel="stylesheet">
<script>
  if (matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
  }
</script>
<style>
  /* 颜色一律走 Bootstrap 的 CSS 变量，这样深色模式不用额外写一套 */
  body { background: var(--bs-tertiary-bg); min-width: 320px; }
  .app { max-width: 780px; }
  .card { border-color: var(--bs-border-color); border-radius: .75rem; overflow: hidden; }
  .brand { font-weight: 600; letter-spacing: .01em; }
  .brand small { font-weight: 400; color: var(--bs-secondary-color); }
  .form-label { font-size: .875rem; color: var(--bs-secondary-color); margin-bottom: .25rem; }
  .hint { font-size: .8rem; color: var(--bs-secondary-color); }
  .section + .section { border-top: 1px solid var(--bs-border-color-translucent); margin-top: 1rem; padding-top: 1rem; }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
  .out { background: var(--bs-tertiary-bg); }
  /* 操作区吸在底部：手机上表单长，不用滚回去找按钮。
     内边距加上安全区，免得被 iPhone 的横条盖住。 */
  .actions {
    position: sticky; bottom: 0; z-index: 2;
    background: var(--bs-body-bg);
    border-top: 1px solid var(--bs-border-color);
    border-radius: 0 0 1rem 1rem;
    padding: .65rem .75rem calc(.65rem + env(safe-area-inset-bottom));
  }
  footer { font-size: .8rem; color: var(--bs-secondary-color); }
  /* iOS 会在字体小于 16px 的输入框获得焦点时把整个页面放大 */
  @media (max-width: 575.98px) {
    .container.app { padding: .75rem .65rem calc(.75rem + env(safe-area-inset-bottom)) !important; }
    .brand { font-size: 1.15rem !important; }
    .brand small { font-size: .85rem !important; }
    .section + .section { margin-top: .8rem; padding-top: .8rem; }
    .row.g-3 { --bs-gutter-y: .7rem; }
    .form-label { font-size: .8rem; }
    .hint { font-size: .74rem; line-height: 1.35; }
    .form-control, .form-select, textarea { font-size: 1rem; }
    .card-body { padding: .8rem; }
    #inputText { min-height: 92px; }
    #outputText { min-height: 48px; }
    .btn-group .btn { padding: .55rem .35rem; }
    .form-switch + .form-switch { margin-top: .45rem !important; }
    .actions .btn { white-space: nowrap; padding-left: .35rem; padding-right: .35rem; }
    footer { margin-top: .7rem !important; }
  }
</style>
</head>
<body>
<div class="container app py-4">

  <div class="d-flex align-items-baseline justify-content-between mb-3">
    <div class="brand fs-4">zjumihomo <small class="fs-6">订阅转换</small></div>
    <span class="hint">mihomo</span>
  </div>

  <div class="card shadow-sm">
    <div class="card-body">

      <div class="section">
        <label for="inputText" class="form-label">订阅链接</label>
        <textarea id="inputText" class="form-control" rows="4" aria-describedby="inputHint" autofocus
          placeholder="粘贴订阅链接、base64 订阅内容，或节点链接"></textarea>
        <div id="inputHint" class="hint mt-1">支持 ss / ssr / vmess / trojan / vless / hysteria / hysteria2；多个每行一个，也可用 | 分隔</div>
      </div>

      <div class="section">
        <div class="row g-3">
          <div class="col-12 col-sm-7">
            <label for="rules" class="form-label">分流规则</label>
            <select id="rules" class="form-select">
              <option value="builtin" selected>内置规则（离线可用）</option>
              <option value="mini">ACL4SSR Mini（约 3400 条）</option>
              <option value="mini_adblock">ACL4SSR Mini + 去广告</option>
              <option value="mini_multi">ACL4SSR Mini 多模式</option>
              <option value="mini_multicountry">ACL4SSR Mini 多国家</option>
              <option value="full">ACL4SSR Full（约 9500 条）</option>
              <option value="full_adblock">ACL4SSR Full + 去广告</option>
              <option value="full_netflix">ACL4SSR Full + 奈飞</option>
            </select>
            <div class="hint mt-1">选 ACL4SSR 时转换端要能访问 GitHub</div>
          </div>
          <div class="col-12 col-sm-5">
            <label for="dns" class="form-label">DNS</label>
            <select id="dns" class="form-select">
              <option value="1" selected>启用（fake-ip）</option>
              <option value="2">仅监听</option>
              <option value="0">禁用</option>
            </select>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="row g-3">
          <div class="col-12 col-sm-6">
            <div class="form-label">UDP 代理</div>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="udp" id="udp2" value="2" checked>
              <label class="btn btn-outline-secondary" for="udp2">默认</label>
              <input type="radio" class="btn-check" name="udp" id="udp1" value="1">
              <label class="btn btn-outline-secondary" for="udp1">启用</label>
              <input type="radio" class="btn-check" name="udp" id="udp0" value="0">
              <label class="btn btn-outline-secondary" for="udp0">禁用</label>
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="form-label">TCP Fast Open</div>
            <div class="btn-group w-100" role="group">
              <input type="radio" class="btn-check" name="tfo" id="tfo2" value="2" checked>
              <label class="btn btn-outline-secondary" for="tfo2">默认</label>
              <input type="radio" class="btn-check" name="tfo" id="tfo1" value="1">
              <label class="btn btn-outline-secondary" for="tfo1">启用</label>
              <input type="radio" class="btn-check" name="tfo" id="tfo0" value="0">
              <label class="btn btn-outline-secondary" for="tfo0">禁用</label>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="ovr" checked>
          <label class="form-check-label" for="ovr">
            校园网覆写
            <span class="hint d-block">ZJUconnect 节点 + 校园网策略组 + 校内 DNS</span>
          </label>
        </div>
        <div class="form-check form-switch mt-3">
          <input class="form-check-input" type="checkbox" id="lm" onchange="syncDisabled()">
          <label class="form-check-label" for="lm">仅输出节点列表</label>
        </div>
        <div class="form-check form-switch mt-3">
          <input class="form-check-input" type="checkbox" id="relay" onchange="syncDisabled()">
          <label class="form-check-label" for="relay">
            经 api.v1.mk 获取节点
            <span class="hint d-block">仅借 api.v1.mk 拉取节点，规则、DNS 和覆写仍使用本项目配置</span>
          </label>
        </div>
      </div>

      <div class="section">
        <label for="outputText" class="form-label">生成结果</label>
        <textarea id="outputText" class="form-control out" rows="2" readonly
          placeholder="生成后会显示在这里"></textarea>
      </div>

    </div>

    <div class="card-footer actions">
      <div class="row g-2">
        <div class="col-6 col-sm-5">
          <button id="generateBtn" class="btn btn-primary w-100" type="button" onclick="processText()">生成订阅链接</button>
        </div>
        <div class="col-3 col-sm-4">
          <button class="btn btn-success w-100" type="button" onclick="importToClash()">导入</button>
        </div>
        <div class="col-3 col-sm-3">
          <button class="btn btn-outline-secondary w-100" type="button" onclick="copyOut()">复制</button>
        </div>
      </div>
      <div id="copied" class="hint mt-1"></div>
    </div>
  </div>

  <footer class="text-center mt-3">
    <a href="https://github.com/macanine/zjumihomo-converter" class="text-decoration-none">源码</a>
    · 规则来自 <a href="https://github.com/ACL4SSR/ACL4SSR" class="text-decoration-none">ACL4SSR</a>
  </footer>
</div>

<script>
// 仅输出列表或经 api.v1.mk 获取节点时，规则等选项仍由本项目处理；只有列表模式会置灰它们
function syncDisabled() {
  var on = document.getElementById('lm').checked;
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
  var tip = document.getElementById('copied');
  var button = document.getElementById('generateBtn');
  if (!a) { tip.textContent = '请先粘贴订阅链接或节点'; document.getElementById('inputText').focus(); return; }
  button.disabled = true;
  button.textContent = '已生成';
  js.url = a.split('\\n').join('|');
  js.target = 'clash';

  var relayOn = document.getElementById('relay').checked;
  var listOn = document.getElementById('lm').checked;
  if (relayOn) { js.relay = '1'; }

  {
    ['udp', 'tfo'].forEach(function (n) {
      try {
        var els = document.getElementsByName(n);
        for (var i = 1; i < els.length; i++) {
          if (els[i].checked) { js[n] = els[i].value; break; }
        }
      } catch (e) {}
    });
  }

  if (listOn) {
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

  // 校园网覆写：勾选时不传参（默认开启），取消勾选时显式传 0 关闭。
  try {
    if (!relayOn && !document.getElementById('ovr').checked) { js.ovr = '0'; }
  } catch (e) {}

  document.getElementById('outputText').value =
    '${pre}' + new URLSearchParams(js).toString();
  tip.textContent = '链接已生成，可复制或一键导入';
  window.setTimeout(function () { button.disabled = false; button.textContent = '生成订阅链接'; }, 900);
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
  var done = function () { document.getElementById('copied').textContent = '已复制到剪贴板'; };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(el.value).then(done, function () { el.select(); });
  } else {
    el.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
  }
}

document.getElementById('inputText').addEventListener('keydown', function (event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    processText();
  }
});
syncDisabled();
</script>
</body>
</html>`;
  return new Response(t, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export { gen_html };

# 部署指南

> ## ⚠️ 必须选 Pages 服务，不能选 Workers
>
> 本项目是 **Cloudflare Pages** 项目（`wrangler.toml` 用
> `pages_build_output_dir` 指定产物目录）。
>
> 建项目时如果选成了 **Worker**，云端会去跑 `wrangler deploy`，而它只认
> `main` 入口，于是报：
>
> ```
> ▲ [WARNING] It seems that you have run `wrangler deploy` on a Pages project,
>   `wrangler pages deploy` should be used instead.
> ✘ [ERROR] Missing entry-point to Worker script or to assets directory
> ```
>
> 看到这个报错，说明项目建成了 Worker，删掉重建、**选 Pages** 即可。

三种方式，按需要选一种。都只需要一个 Cloudflare 账号（免费版即可）。

部署完成后访问 `https://<你的域名>/<key>` 就是转换表单页。

---

## 方式一：连接 Git 仓库自动部署（推荐）

1. 把仓库推到 GitHub
2. Cloudflare Dashboard → **Workers & Pages** → **Create**
3. **切到 `Pages` 选项卡**（不是 `Workers`），选 **Connect to Git**
4. 选中仓库，构建设置填：

   | 项 | 值 |
   |---|---|
   | Framework preset | `None` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

   **构建命令必须是 `npm run build`**——产物 `dist/_worker.js` 是构建生成的，
   不构建就没有这个目录，部署会失败。

5. 部署完成后，进项目的 **Settings → Functions → Compatibility flags**，
   确认有 **`nodejs_compat`**（代码用到 `Buffer`，缺了会运行时报错）
6. 访问 `https://<项目名>.pages.dev/sub`

之后每次 push 都会自动重新构建。

---

## 方式二：本地 wrangler 部署

适合想自己改代码的人。

```bash
# 1. 装依赖并构建（需 Node.js 18+）
npm install
npm run build

# 2. 本地验证，打开 http://127.0.0.1:8788/sub 试一下
npm run dev

# 3. 登录 Cloudflare
npx wrangler login

# 4. 部署
npm run deploy
```

第一次会问是否创建新项目，选是，项目名默认 `zjumihomo`。完成后输出访问地址，
形如 `https://zjumihomo.pages.dev`。

`npm run deploy` 实际执行的是 `wrangler pages deploy`——**部署命令必须是这个**，
用 `wrangler deploy`（Workers 的命令）会报上面那个错。

---

## 方式三：控制台直接上传（最快）

适合不想装任何东西、只想快速用起来。

1. 本地执行 `npm run build`
2. Cloudflare Dashboard → **Workers & Pages** → **Create** →
   **切到 `Pages` 选项卡** → **Upload assets**
3. 项目名随便取，把 `dist` 目录整个拖上去，**Deploy**
4. 进项目的 **Settings → Functions → Compatibility flags**，加上 **`nodejs_compat`**
5. 访问 `https://<项目名>.pages.dev/sub`

---

## 配置密钥

默认访问密钥是 `sub`。**强烈建议改掉**，否则任何知道地址的人都能用你的转换服务。

**推荐做法**：Dashboard → 你的 Pages 项目 → **Settings** → **Variables and Secrets**
→ 添加变量 `key`，值设成你的密钥。改完需要重新部署一次生效。

也可以在 `src/core/globals.js` 里改 `key_default`，然后重新构建部署。

密钥会经过 `replace(/\W/g, '')` 处理，只保留字母数字下划线。所以**不要用纯中文或
纯符号当密钥**——清洗后会变成空字符串，导致服务对所有人开放。

---

## 部署后验证

替换 `<域名>` 和 `<key>` 后执行：

```bash
# 表单页应该返回 200
curl -I "https://<域名>/<key>"

# 用公开测试订阅转换，应返回 YAML
curl "https://<域名>/<key>/sub?target=clash&url=https%3A%2F%2Fraw.githubusercontent.com%2Faiboboxx%2Fv2rayfree%2Fmain%2Fv2" | head -20
```

返回的 YAML 里应能看到 `proxies:`、`proxy-groups:`、`rules:` 三段，并且
`proxy-groups` 第一项是 `🏫 校园网`。

---

## 校园网部分

转换结果默认包含指向 `127.0.0.1:1090` 的 SOCKS5 节点，**需要你在本机先跑起
zju-connect**，否则那个节点不可用（不影响其他节点）。

```bash
# 装 zju-connect：https://github.com/Mythologyli/zju-connect
# 确保它监听 socks5 端口 1090
```

端口不是 1090、或不在校园网环境，改 [zju-override.yaml](zju-override.yaml)
后重新构建；不需要就直接用 `&ovr=0` 关掉。

「🏫 校园网」组默认走 **DIRECT**，只有手动切到 `ZJUconnect` 时才走隧道。

---

## 常见问题

**报 `Missing entry-point to Worker script or to assets directory`**
项目建成了 Worker。删掉重建，**Create 时选 `Pages` 选项卡**。
（如果报的是 `It seems that you have run wrangler deploy on a Pages project`，
同理：云端在跑 Workers 的部署命令，说明项目类型选错了。）

**部署成功但访问 500 / 报 `Buffer is not defined`**
缺少 `nodejs_compat`。Settings → Functions → Compatibility flags 里加上。

**部署报错找不到 `dist` 目录**
构建命令没设成 `npm run build`，或者构建失败了。本地先跑一次确认产物存在。

**转换失败，提示 `no valid nodes`**
订阅里没解析出有效节点。检查链接能否直接访问（有些机场要特定 UA），
或试着加 `&udp=1`。

**转换很慢（1-2 秒）**
正常。首次要从 ACL4SSR 拉十来个规则文件；之后 1 小时内走缓存，约几毫秒。

**等十几秒才返回，但规则很少**
规则拉取失败，走了最小兜底分流。说明 Cloudflare 连不上 GitHub 及其镜像。

**提示 `unsupported target`**
`target` 只能是 `clash`。

**Clash 里导入配置报错**
用本地 mihomo 内核看具体原因：`mihomo -t -f 配置.yaml -d <数据目录>`。
本项目的 `npm run test:mihomo` 就是用这个方式检查所有规则预设的。

**节点太多导致转换失败**
免费版有 10ms CPU 限制，约 5000 节点就会超。这是平台限制，可改付费计划
（30s CPU）或减少节点数。

**访问根路径显示 "Welcome to nginx!"**
刻意设计的伪装首页，不是出错。

# AGENTS.md

给在本仓库工作的 AI agent / 开发者的说明。人类用户请看 [README.md](README.md)。

## 这个项目是什么

Cloudflare Pages 上的订阅转换器：把各种机场订阅（ss/ssr/vmess/trojan/vless/hysteria/hysteria2）
转换成 mihomo（Clash.Meta）可用的 YAML 配置。**为浙江大学校园网环境定制**：转换结果会带上
指向本机 zju-connect 的 SOCKS5 节点和「🏫 校园网」策略组。

## 架构

单文件 worker 是构建产物，源码在 `src/`：

```
src/
├── index.js              入口：路由与请求处理（Cloudflare Pages Function）
├── config.js             YAML 模板：策略组、DNS、TUN、sniffer（不含规则）
├── core/
│   ├── globals.js        默认密钥、udp/tfo 默认值、UA（模块级可变状态）
│   ├── utils.js          base64 / URL / content-type 工具
│   ├── nodes.js          订阅解析：递归展开 base64、按行识别节点链接
│   ├── config-builder.js 组装最终配置：去重、重命名、注入策略组、应用覆写
│   ├── rules-fetcher.js  运行时从 ACL4SSR 拉取分流规则
│   ├── sub-name.js       推导订阅名 → Content-Disposition（客户端拿它命名配置）
│   └── override.js       应用 zju-override.yaml（节点/策略组/置顶规则）
├── protocols/            每个协议一个文件，各自导出 decode_xxx()
└── pages/                静态页面：nginx.js（伪装首页）html.js（表单）favicon.js
build/build.mjs           打包器（手写，零依赖）
test/smoke.mjs            冒烟测试（离线）
test/mihomo-check.mjs     用真实 mihomo 内核校验产出配置
zju-override.yaml         校园网覆写片段（构建时内联）
```

请求流程：`/<key>/sub?target=clash&url=...` → `gen_cfg()` → 拉规则（并发）→ 解析节点
→ 去重重命名 → 注入策略组 → 应用覆写 → `yaml.dump`。

## 必须知道的几件事

### dist/ 是产物，不要直接编辑

改代码改 `src/`，然后 `npm run build`。`npm run dev` / `npm run deploy` 会自动先构建。
`dist/` 已在 `.gitignore` 里。

### 打包器是手写的，扩展它时注意

`build/build.mjs` 自己解析 ESM 的 import/export，做拓扑排序后拼成单文件。它：

- **剥掉 import 语句**，靠「所有模块拼进同一作用域」工作。所以**跨模块顶层重名会静默改变语义**，
  打包器会报错拦截；别名导入（`import { a as b }`）不受支持，也会被拦。
- 支持 `.yaml` 数据文件导入：会被转成 JS 字面量内联（`zju-override.yaml` 就是这么进来的）。
- 会校验：缺导出、循环依赖、入口缺 `export default`、顶层重名。
- 产物必须保持**零外部 import**（Cloudflare 控制台直接粘贴部署依赖这一点）。

词法扫描器（跳过字符串/模板串/正则/注释）已用陷阱文件测过，但改它时请重跑 `npm test`。

### 规则格式：组名在参数之后

这是踩过的坑。ACL4SSR 的 `.list` 每行是 `类型,参数[,no-resolve]`，**不含策略组名**；
Clash 规则格式是 `类型,参数,策略组[,no-resolve]`。组名要插在参数**之后**，而 `no-resolve`
必须留在最末：

```
DOMAIN-SUFFIX,a.com           → DOMAIN-SUFFIX,a.com,🎯 全球直连
IP-CIDR,1.0.1.0/24,no-resolve → IP-CIDR,1.0.1.0/24,🎯 全球直连,no-resolve
FINAL                         → MATCH,🐟 漏网之鱼
```

拼错位置的后果是 Clash 把域名当成代理名，报 `proxy [xxx] not found`。

### 覆写为什么必须在策略组处理之后

`config-builder.js` 里有个循环把订阅节点塞进每个策略组（排除广告/拦截/直连/净化）。
「🏫 校园网」组不能被塞进订阅节点，所以覆写必须在那个循环**之后**应用。

覆写的三段语义不同：proxies 追加、proxy-groups **置顶**（校园网要排最前）、rules **置顶**
（否则被 ACL4SSR 的 `GEOIP,CN` 和末尾 `MATCH` 抢走，永远匹配不到）。

### 没有本地兜底规则

本地规则已全部移除，一律运行时从 ACL4SSR 拉取。拉取失败时用 `FALLBACK_RULES`
（`GEOIP,CN,🎯 全球直连` + `MATCH,🐟 漏网之鱼`），保证配置合法且流量能走通。

拉取有三级超时：单请求 5s、整批 8s 预算、镜像重试也受预算约束。未知的 `rules` 取值
立即失败（不会白等三个镜像）。

### 内核不支持的规则类型会被丢弃

ACL4SSR 的 `ProxyMedia.list` 里有 `URL-REGEX`，mihomo v1.19 已移除该类型支持，
留着会让整份配置加载失败。`rules-fetcher.js` 的 `KNOWN_TYPES` 维护白名单。

### 订阅名走 Content-Disposition，不是 URL 末段

客户端导入订阅时用的名字来自响应头，不给我们就得拿 URL 末段——也就是接口名 `sub`。
三个客户端的取值顺序（读源码确认过）：`name=` 参数 → `Content-Disposition` 的文件名 →
URL 末段。所以名字由 `sub-name.js` 推导后写进 `Content-Disposition`，来源按可信度：
上游响应头里的文件名 → 订阅链接末段 → 主机名。

写这个名字时有两个坑：

- **非 ASCII 名不能放进 `filename=`**：HTTP 头塞不下中文，Worker 会直接抛错。中文名走
  RFC 5987 的 `filename*=UTF-8''%xx`，`filename=` 里只放 ASCII 兜底（通常是主机名）。
- **`filename*` 必须排在最后**，单引号必须转义：Mihomo Party 按 `filename*=.*''` 切分后把
  剩余部分整个拿去 `decodeURIComponent`，单引号没转义的话 Clash Verge 按 `''` 切分又会切坏。
  实测格式（与 subconverter 一致）：`attachment; filename="<ascii>"; filename*=UTF-8''<pct>`。

名字还会被客户端当文件名用，所以 `sub-name.js` 里要删掉路径分隔符和控制字符。

### 「一键导入」用 clash:// 协议

表单的「一键导入」拼 `clash://install-config?url=<编码后的订阅地址>`，Clash Verge、ClashX、
Mihomo Party 都认这个协议。**`url=` 必须放在最后**：Clash Verge 的解析是找 `url=` 子串后
把剩余整串都当订阅地址（`utils/resolve/scheme.rs`），后面再接参数会被吃进 URL 里。

### 端口和 UI 密钥不做成参数

`mixed-port` / `socks-port` / `redir-port` / `tproxy-port` / `port` / `secret` 一律用
`src/config.js` 的模板值，表单和 URL 参数都不再暴露（改端口就改 `config.js`）。
`mp` `sp` `hp` `rp` `tp` `secret` 这些老参数会被静默忽略。

## 测试

```bash
npm test            # 72 项冒烟测试，离线（用桩 fetch 模拟 ACL4SSR）
npm run test:mihomo # 用本机 mihomo 内核校验产出配置，需要网络
```

**改动规则、策略组、覆写相关代码后必须跑 `npm run test:mihomo`。** 自写的检查器只能验证
「你以为的」格式——之前规则组名位置写反、`URL-REGEX` 不受支持这两个 bug，冒烟测试全绿
但内核直接拒绝，只有它能发现。内核路径取自 Clash Verge，没装则自动跳过。

## 约定

- 注释用中文，解释**为什么**（约束、坑），不复述代码在做什么。
- 标识符保持现有风格：函数 `snake_case`，协议解码器 `decode_xxx`。
- 不引入构建依赖。打包器手写是刻意的，产物必须零外部依赖。
- `src/config.js` 是数据不是逻辑，改动它属于用户自定义范围。

## 提交规范

用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，格式为
`<type>: <描述>`：

- **type 必须是小写英文**：`feat`（新功能）、`fix`（修 bug）、`docs`（文档）、
  `refactor`（重构）、`test`（测试）、`chore`（杂项）、`perf`（性能）
- type 后面是**半角冒号加一个空格**，不要用全角「：」，也不要漏掉冒号
- 描述用中文，一句话说清做了什么，不加句号
- 正文可选，用来写「为什么」——动机、约束、踩过的坑，而不是罗列改动
- 一次提交只做一件事，跨类型的改动拆开

```
feat: 支持 hysteria2 的 obfs 参数
fix: 修正规则里策略组名的位置
docs: 补充 Cloudflare Pages 部署步骤
refactor: 把协议解码器拆成独立模块
```

```
fix: 校园网组被塞入订阅节点

覆写原先在「把节点塞进各策略组」之前应用，导致「🏫 校园网」组
被自动填满订阅节点。改为在其后应用，并用测试锁住这个顺序。
```

## 环境

- Node ≥ 18（用到 `structuredClone`、顶层 await）
- 部署目标：Cloudflare **Pages** + `nodejs_compat`（`Buffer` 来自这里）
- `wrangler.toml` 用 `pages_build_output_dir = "./dist"` 指定产物目录，云端构建
  命令必须是 `npm run build`
- **必须建成 Pages 项目，不能建成 Worker**。选成 Worker 时云端会跑
  `wrangler deploy`，它只认 `main` 入口，会报 `Missing entry-point to Worker
  script or to assets directory`

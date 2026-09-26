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
│   ├── globals.js        默认密钥、udp/tfo 默认值、拉订阅用的 UA 常量
│   ├── utils.js          base64 / URL / content-type 工具
│   ├── nodes.js          订阅解析：递归展开 base64、按行识别节点链接
│   ├── config-builder.js 组装最终配置：去重、重命名、剪除未引用的策略组、注入策略组、应用覆写
│   ├── rules-fetcher.js  规则入口：内置表展开 / 运行时从 ACL4SSR 拉取
│   ├── relay.js          中继：把订阅链接交给 api.v1.mk 转换
│   ├── sub-name.js       推导订阅名 → Content-Disposition（客户端拿它命名配置）
│   └── override.js       应用 zju-override.yaml（节点/策略组/置顶规则）
├── rules/builtin.js      内置分流规则表（默认规则来源，离线可用）
├── protocols/            每个协议一个文件，各自导出 decode_xxx()
└── pages/                静态页面：nginx.js（伪装首页）html.js（表单）favicon.js
build/build.mjs           打包器（手写，零依赖）
test/smoke.mjs            冒烟测试（离线）
test/mihomo-check.mjs     用真实 mihomo 内核校验产出配置
zju-override.yaml         校园网覆写片段（构建时内联）
```

请求流程：`/<key>/sub?target=clash&url=...` → `gen_cfg()` → 取规则（内置表展开，或并发拉
ACL4SSR）→ 解析节点 → 去重重命名 → 按规则引用剪除没人用的策略组 → 注入策略组 →
应用覆写 → `yaml.dump`。

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

覆写各段语义不同：proxies 追加、proxy-groups **置顶**（校园网要排最前）、rules **置顶**
（内置表和 ACL4SSR 都带 `GEOIP,CN` 这类兜底和末尾的 `MATCH`，校园网规则排在后面就
永远匹配不到）；dns 段按值的类型合并——列表追加（`fake-ip-filter` 不能丢掉模板里那一长串）、
映射表逐键合并（`nameserver-policy`）、标量覆盖。

### DNS 上游：校内域名走校内，其余走 114

上游分成两段，改的时候别只改一半：

- **校内域名**（`*.zju.edu.cn` / `*.zjusec.com` / `*.cc98.org`）在公共 DNS 上查不到（或只给
  公网入口），所以在覆写里用 `nameserver-policy` 指向 `10.10.0.21#🏫 校园网`。`#策略组` 是
  mihomo 的 DNS over proxy 写法，查询跟着组走——组里默认 DIRECT，在校内网时直达校内 DNS；
  切到 ZJUconnect 后由 zju-connect 转发，人在校外也能解析。
- **其余（外部）域名**走 `src/config.js` 里的 `nameserver: 114.114.114.114`。

校内那几个域名还必须同时加进 `fake-ip-filter`，光配 nameserver-policy 不够：fake-ip 生效时
mihomo 直接把 `198.18.x.x` 发给客户端，**压根不会去问 nameserver**，真实地址只在 mihomo
自己发起连接时才解析，绕过代理的进程拿着 fake-ip 就连不上。实测只有 `www.zju.edu.cn` 因为
模板 `fake-ip-filter` 里的 `geosite:cn` 侥幸拿到真实 IP，`cc98.org` / `www.zjusec.com`
都会返回 fake-ip。

外部域名这一半有个前提：**校园网拦截发往校外的明文 53 端口**。实测 `1.1.1.1`、`8.8.8.8`、
`223.5.5.5`、`119.29.29.29` 查 `www.google.com` 返回的是同一批错误 IP（Facebook 的地址），
只有 TCP 853 没被拦。所以 114 的答案对国内域名是准的，国外域名得靠模板 `dns.fallback` 那组
国外 DoT 校正——实测 `www.google.com` 从 114 拿到 `185.45.5.35`（错的），最终采用的是
fallback 给出的 `142.251.x.x`。**别删那组 fallback**，删了就只剩被污染的答案。

验证方式：用真实内核跑一份临时配置（端口错开），日志里查 `--> <IP> A from <上游>`：

```
www.zju.edu.cn --> [10.203.4.70] A from udp://10.10.0.21:53      # 校内
www.baidu.com  --> [153.3.238.127 ...] A from udp://114.114.114.114:53
www.google.com --> [142.251.150.119 ...] A from tls://1.1.1.1:853 # fallback 校正
```

### 分流规则：默认内置，ACL4SSR 是可选项

默认 `rules=builtin`，用 `src/rules/builtin.js` 里那张表，**不联网**——转换端出不了网也能
分流（校园网里访问 GitHub 本来就不稳，纯靠远端拉取等于没有分流）。

这张表的设计前提是「**只列目标与兜底不同的规则**」，所以总共才 158 条：兜底是最后那条
`MATCH,🐟 漏网之鱼`，而该组在 `src/config.js` 里默认选中 🚀 节点选择，**没被命中的流量
一律走代理**。于是表里只剩两类——要直连的（本机、局域网、国内域名）和要单独挑节点的
（流媒体、AI）——其余类别（开发、下载、游戏、社交、CDN……）一概不列，列了也只是换个
组名走同一条代理。五个要点：

- **兜底组的默认选中项是这张表的前提**。把 🐟 漏网之鱼 改成默认直连，那些没列出来的
  站点就会静默变成直连，所以冒烟测试锁着它的候选顺序。反过来说，往表里加规则前先问
  「它的目标跟兜底一样吗」，一样就不必加。
- **必应必须显式钉在直连**。它国内直连可达，但只靠 `GEOIP,CN` 兜的话，解析一旦落到
  海外边沿（IPv6、或上游给出 13.107.x 这类全球地址）就接不住，流量掉进兜底组走代理，
  而必应中国对海外出口直接拒绝访问。国内段只留日常大厂，其余国内站点由 `GEOIP,CN`
  接住（上游 114 对国内域名的答案是准的），`.cn` 后缀一条就覆盖全部。
- **顺序就是优先级**（Clash 先匹配先命中）。表里流媒体排在 AI 段前面不是随意的：AI 段
  末尾有 `DOMAIN-KEYWORD,google`，而 `googlevideo.com` 也含 "google"，反过来 YouTube
  会被 AI 组抢走；测试里有专门一条盯这个。
- **组名必须和 `src/config.js` 里的策略组对得上**。指向不存在的组时规则会被 `filter_rules`
  丢掉，表现为「那类流量静默退回兜底」，不报错。冒烟测试逐条核对目标是否存在。
- 展开时按整条规则去重（来源配置里有整整两段重复的 AI/学术规则），最后补一条
  `MATCH,🐟 漏网之鱼`；终结规则若因组名缺失被过滤掉，`resolve_rules` 会补回来——
  没有它就是「未匹配流量无处可去」。同段内被 DOMAIN-KEYWORD 覆盖的 DOMAIN-SUFFIX
  不重复列（同组内命中哪条结果一样）。

模板里为 ACL4SSR 预备的策略组（微软服务、电报信息、全球拦截……）在组装时按「规则是否
引用到」剪除（`config-builder.js` 的 `prune_unused_groups`）：内置规则下客户端只看到
实际参与分流的组，换 ACL4SSR 预设时被引用到的组自动保留。所以往表里加新组时，模板里
得先有这个组，规则才挂得上去。

`rules=mini|full|...` 或 `.ini` 地址仍然是从 ACL4SSR 拉取，那条路径的大坑见下面几节。
拉取失败时用 `FALLBACK_RULES`（`GEOIP,CN,🎯 全球直连` + `MATCH,🐟 漏网之鱼`），
保证配置合法且流量能走通。拉取有三级超时：单请求 5s、整批 8s 预算、镜像重试也受预算
约束；未知的 `rules` 取值立即失败（不会白等三个镜像）。

### 内核不支持的规则类型会被丢弃

ACL4SSR 的 `ProxyMedia.list` 里有 `URL-REGEX`，mihomo v1.19 已移除该类型支持，
留着会让整份配置加载失败。`rules-fetcher.js` 的 `KNOWN_TYPES` 维护白名单。

### 拉订阅时用 Clash Verge 的 UA

`nodes.js` 发上游请求时固定带 `User-Agent: clash-verge/v<版本>`（`src/core/globals.js` 里的
`sub_ua` 常量），**不再转发来访客户端的 UA**。两个原因：机场普遍按 UA 区分返回内容，
浏览器 UA 可能换来一份 HTML 首页而不是订阅；而且原来的 UA 是模块级可变状态，同一个
isolate 内会被后续请求读到。写法对齐 clash-verge-rev 的 `utils/network.rs`（它只设 UA，
Accept 交给 reqwest 默认的 `*/*`），所以请求里也不再自己塞浏览器风格的 Accept。

### 中继：`relay=1` 时把链接交给 api.v1.mk

`src/core/relay.js`：带着订阅链接请求 `https://api.v1.mk/sub?target=clash&url=...`，把它
产出的配置原样返回给客户端（借它的规则/重命名/emoji 处理，客户端也只看得到我们的域名）。
几个要点：

- **url 要用没做过换行替换的原始值**：本地解析会把 `|` 换成换行，而 api.v1.mk 认的是
  `|` 分隔的原始形式，所以 `index.js` 里单独留了 `raw_u`。
- **拉机场的 UA 用 `diyua` 参数**（值就是 `sub_ua`），否则中继和本地两条路可能拿到不同的
  订阅内容——机场按 UA 区分返回。
- **失败一律落回本地转换**（网络不通、非 200、body 里没有 `proxies:`）。最后那条尤其重要：
  api.v1.mk 出错时也回 200，正文是 `No nodes were found!` 之类的纯文本，直接透传等于给
  客户端一份坏配置。实测它还会对某些上游直接回 403（`raw.githubusercontent.com`、
  `cdn.jsdelivr.net` 都被挡），这种情况同样落回本地。
- 中继模式下 `rules` / `dns` / `ovr` / `udp` / `tfo` 都不参与，只有 `list` 会转成它的
  `list=true`；表单里这些控件会置灰。

验证方式：本地起 worker 打一次 `relay=1`，看返回是不是完整配置（`proxies:` + `rules:`）
且 `Subscription-Userinfo` 跟着透传。

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
npm test            # 50 项冒烟测试，离线（用桩 fetch 模拟 ACL4SSR）
npm run test:mihomo # 用本机 mihomo 内核校验产出配置，需要网络
```

`npm test` **不会自动构建**（`dist/_worker.js` 是它测的对象），改完代码先 `npm run build`，
否则跑的是上一版产物——表现为测试结果和你刚改的东西无关。

**改动规则、策略组、覆写相关代码后必须跑 `npm run test:mihomo`。** 自写的检查器只能验证
「你以为的」格式——之前规则组名位置写反、`URL-REGEX` 不受支持这两个 bug，冒烟测试全绿
但内核直接拒绝，只有它能发现。内核路径取自 Clash Verge，没装则自动跳过。

冒烟测试只留会挡住真 bug 的断言：格式约定、顺序前提、会崩或静默失效的行为。**不要往
里加页面结构检查**（有没有某个 id、有没有引入 Bootstrap、页脚链接对不对）——改版就红，
挡不住任何真实回归。改 `src/pages/html.js` 后请自己用浏览器按 390px 和桌面宽度各看一遍。

## 前端

`src/pages/html.js` 是表单页，用 Bootstrap 5（只引 CSS，不引它的 JS）。几条约定：

- **配色走 Bootstrap 的 CSS 变量**（`var(--bs-body-bg)` 之类），深色模式靠 head 里那段
  内联脚本切 `data-bs-theme` 实现，不需要另写一套深色样式。
- **移动端优先**：小屏下输入控件字号不低于 16px（iOS 会在更小的字号上放大整个页面），
  操作按钮吸在底部（`.actions`，内边距含安全区），列用 `col-12 col-sm-*` 堆叠。
- 表单里出现过的元素 id（`inputText` / `rules` / `dns` / `udp` / `tfo` / `ovr` / `lm` /
  `outputText` / `copied`）被内联脚本按 id 取用，改结构时一起改。

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

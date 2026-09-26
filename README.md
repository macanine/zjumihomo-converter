# zjumihomo

Clash 订阅转换器，为**浙江大学校园网**环境定制。

- 把订阅链接、base64 订阅内容或单条节点链接，转换成 mihomo（Clash.Meta）可用的 YAML
- 支持 ss / ssr / vmess / trojan / vless / hysteria / hysteria2
- 内置一套分流规则（离线可用，国内直连、流媒体和 AI 单独成组，其余走代理），
  也可以换成运行时从 [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 拉取、跟随上游更新
- 自动加入指向本机 zju-connect 的 SOCKS5 节点和「🏫 校园网」策略组

源码使用 ESM，构建由开源 esbuild 完成；部署在 **Cloudflare Pages**，产物是单个自包含的 worker 文件。

本项目基于 [Js-Sung/sub2clashmeta](https://github.com/Js-Sung/sub2clashmeta) 改造：上游负责
通用的订阅转换，这里在其之上加了校园网覆写、运行时拉取 ACL4SSR 规则等定制，并把单文件的
`dist/_worker.js` 拆成 `src/` 下可维护的模块。感谢原作者。

## 快速开始

```bash
npm install
npm run build
npm run dev        # http://127.0.0.1:8788/sub
```

默认密钥 `sub`，可在 `src/core/globals.js` 改，或部署后用环境变量 `key` 覆盖。

部署见 [DEPLOY.md](DEPLOY.md)（**必须选 Pages 服务，不是 Workers**）。

## 接口

```
https://<域名>/<key>/sub?target=clash&url=<订阅链接>
```

访问 `https://<域名>/<key>` 是表单页，填完订阅点「生成订阅链接」即可。点「一键导入」会用
`clash://install-config?url=...` 唤起本机的 Clash Verge / ClashX / Mihomo Party 等客户端
（没装或没反应就复制链接手动添加）。

导入后的配置名取自订阅本身：优先用订阅响应头里带的文件名，其次是订阅链接的末段，
再不然是主机名；粘贴节点列表这种没有来源名字的情况才交给客户端自己定。

| 参数 | 说明 |
|---|---|
| `url` | 订阅链接 / base64 内容 / 节点链接，多个用 `\|` 或换行分隔（必填） |
| `target` | 仅 `clash` |
| `rules` | 规则来源，默认 `builtin`（内置）；也可用 `mini` `mini_adblock` `mini_multi` `full` `full_adblock` `full_netflix` 从 ACL4SSR 拉取，或直接给 .ini 的 URL |
| `ovr` | 校园网覆写，`0` 关闭（默认开启） |
| `udp` `tfo` | `1` 启用、`0` 禁用、`2` 默认 |
| `dns` | `1` 启用、`2` 仅监听、`0` 禁用 |
| `list` | `true` 时只输出 proxies 段 |
| `relay` | `1` 时仅通过 [api.v1.mk](https://api.v1.mk/) 获取节点，规则、DNS、覆写和最终配置仍由本项目生成 |

端口（`mixed-port` 等）和 `external-controller` 密钥不开放参数，一律用
[src/config.js](src/config.js) 里的模板值；老链接里遗留的 `mp` `sp` `hp` `rp` `tp` `secret`
会被忽略。

流量信息（`Subscription-Userinfo`）会透传，多个订阅合并流量、取最晚过期时间。

拉取订阅链接时固定用 Clash Verge 的 UA（`clash-verge/v<版本>`），不转发你客户端的 UA；
机场按 UA 区分返回内容时，这样拿到的是 Clash 那份。

`relay=1` 是「节点获取代理」：把订阅链接交给 api.v1.mk，只取它返回的 `proxies` 节点，
再由本项目生成规则、DNS、校园网覆写和策略组。订阅链接会交给这个第三方服务；它抓不到
你的订阅（连接失败、403，或者返回的不是配置）时，会自动回退到原始订阅的本地转换。

## 分流规则

默认用**内置规则表**（[src/rules/builtin.js](src/rules/builtin.js)，158 条），转换时直接
展开，**不联网**——转换端出不了网也能分流，校园网里这点比覆盖面更要紧。

它只写两类规则：**要走直连的**、**要单独挑节点的**，其余全部交给兜底。兜底是
`MATCH,🐟 漏网之鱼`，而该组默认选中 🚀 节点选择，所以没被任何规则命中的流量一律走代理——
开发、下载、游戏、社交、CDN 这些类别因此不必逐条列举，列了也只是换个组名走同一条代理。

| 策略组 | 管什么 | 例子 |
|---|---|---|
| 🎯 全球直连 | 本机、局域网、路由器管理页、必应、国内域名 | `localhost`、`baidu.com`、`bing.com`、`edu.cn`、`GEOIP,CN` |
| 🌍 国外媒体 | 流媒体：单独成组方便挑一个解锁流媒体的节点 | `youtube.com`、`netflix.com`、`spotify.com` |
| 🤖 AI 研究 | AI 与学术：不少 AI 服务挑 IP 地区 | `openai.com`、`claude.ai`、`arxiv.org` |
| 🐟 漏网之鱼 | 其余全部，默认走代理 | `github.com`、`steamcommunity.com` |

要把某个类别单独拆出来（微软、苹果、下载、成人站点……），在内置表里加一段、组名用
[src/config.js](src/config.js) 里已有的组就行；想让未匹配的流量走直连，改 🐟 漏网之鱼 的
候选顺序即可。

要更全的覆盖面可以把 `rules` 换成 ACL4SSR 预设（`mini` 约 3400 条、`full` 约 9500 条），
此时规则在转换时从云端拉取，**需要转换端能访问 GitHub**（内置 raw / ghfast.top / jsdelivr
镜像回退）。首次 1-2 秒，之后缓存 1 小时；拉取失败只保留最小分流（国内直连、其余走代理），
配置始终可用。

无论哪条路径，引用了不存在策略组、或内核不支持的规则类型都会被自动丢弃——留着会让
mihomo 拒绝加载整份配置。

## 校园网

默认加入 SOCKS5 节点 `ZJUconnect`（`127.0.0.1:1090`，需本机先跑
[zju-connect](https://github.com/Mythologyli/zju-connect)）、置顶的「🏫 校园网」策略组
（默认走 DIRECT），以及置顶的浙大相关分流规则（`*.zju.edu.cn`、`cc98.org`、
`10.0.0.0/8` 等；`vpn/rvpn/webvpn.zju.edu.cn` 走直连以便校外登录）。

校内域名的 DNS 也强制交给校内 DNS `10.10.0.21`，详见下面的 [DNS](#dns) 一节。

调整规则改 [zju-override.yaml](zju-override.yaml)（改完需 `npm run build`）；
不需要校园网配置就加 `&ovr=0`（此时不会引用校内 DNS，避免在校外拿到一份
指向不可达 DNS 的配置）。

## DNS

上游按「是不是校内域名」分成两段：

| 域名 | 上游 |
|---|---|
| `*.zju.edu.cn`、`*.zjusec.com`、`*.cc98.org` | 校内 DNS `10.10.0.21` |
| 其余（外部）域名 | `114.114.114.114` |

校外没有这些校内域名的解析记录，用公共 DNS 查会拿到公网入口或直接查不到，内网服务
因此打不开。校内 DNS 的查询跟着「🏫 校园网」策略组走，组里默认 DIRECT（在校内网时直达），
切到 ZJUconnect 后由 zju-connect 转发，所以在校外也能解析。这几个域名同时不做 fake-ip
转换，客户端拿到的是校内真实地址，绕过代理的进程也能正常访问。

模板里还留着一组国外 DoT（`tls://1.1.1.1:853` 等）作为 `fallback`：校园网会拦截发往
校外的**明文 53 端口**（实测 `1.1.1.1`、`8.8.8.8`、`223.5.5.5`、`119.29.29.29` 查同一个
被墙域名返回的是同一批错误 IP），只有 TCP 853 没被拦。所以 `114.114.114.114` 的答案
对国内域名是准的，国外域名则靠 fallback 校正——实测 `www.google.com` 由 114 拿到的是
`185.45.5.35` 这类错误结果，最终采用的是 fallback 解析出的真实地址。这组 fallback
别删，删掉就只剩被污染的答案。

上游在 [src/config.js](src/config.js)（外部域名）和 [zju-override.yaml](zju-override.yaml)
（校内域名）里改，改完 `npm run build`。

## 开发

```bash
npm run build       # 由 src/ 生成 dist/_worker.js
npm test            # 冒烟测试（离线）
npm run test:mihomo # 用本机 mihomo 内核校验产出配置
```

改代码请改 `src/`，`dist/_worker.js` 是自动生成的。架构、踩过的坑和代码约定见
[AGENTS.md](AGENTS.md)。

## 参考

- [Js-Sung/sub2clashmeta](https://github.com/Js-Sung/sub2clashmeta) —— **原版**，本项目的上游
- [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) —— 可选的远端分流规则来源
- [zju-connect](https://github.com/Mythologyli/zju-connect) —— 浙大校园网连接工具
- [SubConv](https://github.com/SubConv/SubConv)、[sublink-worker](https://github.com/7Sageer/sublink-worker)、[subconverter](https://github.com/tindy2013/subconverter)

## License

MIT

本项目源码：<https://github.com/macanine/zjumihomo-converter>

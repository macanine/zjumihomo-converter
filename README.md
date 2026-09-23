# zjumihomo

Clash 订阅转换器，为**浙江大学校园网**环境定制。

- 把订阅链接、base64 订阅内容或单条节点链接，转换成 mihomo（Clash.Meta）可用的 YAML
- 支持 ss / ssr / vmess / trojan / vless / hysteria / hysteria2
- 分流规则运行时从 [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 拉取，跟随上游更新无需重新部署
- 自动加入指向本机 zju-connect 的 SOCKS5 节点和「🏫 校园网」策略组

纯 JavaScript，零依赖，部署在 **Cloudflare Pages** 上，产物是单个自包含的 worker 文件。

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
| `rules` | 规则预设，默认 `mini`；还有 `mini_adblock` `mini_multi` `full` `full_adblock` 等，或直接给 .ini 的 URL |
| `ovr` | 校园网覆写，`0` 关闭（默认开启） |
| `udp` `tfo` | `1` 启用、`0` 禁用、`2` 默认 |
| `dns` | `1` 启用、`2` 仅监听、`0` 禁用 |
| `list` | `true` 时只输出 proxies 段 |

端口（`mixed-port` 等）和 `external-controller` 密钥不开放参数，一律用
[src/config.js](src/config.js) 里的模板值；老链接里遗留的 `mp` `sp` `hp` `rp` `tp` `secret`
会被忽略。

流量信息（`Subscription-Userinfo`）会透传，多个订阅合并流量、取最晚过期时间。

## 分流规则

默认 `mini`（ACL4SSR Mini，约 3400 条）。规则在转换时从云端拉取，**需要能访问
GitHub**（内置 raw / ghfast.top / jsdelivr 镜像回退）。首次 1-2 秒，之后缓存 1 小时；
拉取失败只保留最小分流（国内直连、其余走代理），配置始终可用。

引用了不存在策略组、或内核不支持的规则类型会被自动丢弃——留着会让 mihomo 拒绝加载。

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
- [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) —— 分流规则来源
- [zju-connect](https://github.com/Mythologyli/zju-connect) —— 浙大校园网连接工具
- [SubConv](https://github.com/SubConv/SubConv)、[sublink-worker](https://github.com/7Sageer/sublink-worker)、[subconverter](https://github.com/tindy2013/subconverter)

## License

MIT

本项目源码：<https://github.com/macanine/zjumihomo-converter>

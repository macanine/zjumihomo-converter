# zjumihomo

Clash 订阅转换器，为**浙江大学校园网**环境定制。

- 把订阅链接、base64 订阅内容或单条节点链接，转换成 mihomo（Clash.Meta）可用的 YAML
- 支持 ss / ssr / vmess / trojan / vless / hysteria / hysteria2
- 分流规则运行时从 [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) 拉取，跟随上游更新无需重新部署
- 自动加入指向本机 zju-connect 的 SOCKS5 节点和「🏫 校园网」策略组

纯 JavaScript，零依赖，部署在 **Cloudflare Pages** 上，产物是单个自包含的 worker 文件。

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

访问 `https://<域名>/<key>` 是表单页，填完订阅点「生成订阅链接」即可。

| 参数 | 说明 |
|---|---|
| `url` | 订阅链接 / base64 内容 / 节点链接，多个用 `\|` 或换行分隔（必填） |
| `target` | 仅 `clash` |
| `rules` | 规则预设，默认 `mini`；还有 `mini_adblock` `mini_multi` `full` `full_adblock` 等，或直接给 .ini 的 URL |
| `ovr` | 校园网覆写，`0` 关闭（默认开启） |
| `udp` `tfo` | `1` 启用、`0` 禁用、`2` 默认 |
| `mp` `sp` `hp` `rp` `tp` | mixed / socks / port / redir / tproxy 端口，填 `0` 删除该项 |
| `dns` | `1` 启用、`2` 仅监听、`0` 禁用 |
| `secret` | 外部控制面板密钥 |
| `list` | `true` 时只输出 proxies 段 |

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

调整规则改 [zju-override.yaml](zju-override.yaml)（改完需 `npm run build`）；
不需要校园网配置就加 `&ovr=0`。

## 开发

```bash
npm run build       # 由 src/ 生成 dist/_worker.js
npm test            # 冒烟测试（离线）
npm run test:mihomo # 用本机 mihomo 内核校验产出配置
```

改代码请改 `src/`，`dist/_worker.js` 是自动生成的。架构、踩过的坑和代码约定见
[AGENTS.md](AGENTS.md)。

## 参考

- [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) —— 分流规则来源
- [zju-connect](https://github.com/Mythologyli/zju-connect) —— 浙大校园网连接工具
- [SubConv](https://github.com/SubConv/SubConv)、[sublink-worker](https://github.com/7Sageer/sublink-worker)、[subconverter](https://github.com/tindy2013/subconverter)

## License

MIT

export const clash_config = {
  "mixed-port": 7890,
  "socks-port": 7891,
  "redir-port": 7892,
  "tproxy-port": 7893,
  "port": 7894,
  "allow-lan": true,
  "mode": "Rule",
  "external-ui": "zashboard",
  "external-ui-url": 'https://ghfast.top/https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip',
  "secret": "123456",
  "external-controller": ":9090",
  "log-level": "info",
  "routing-mark": 6969,
  "tun": {
    "enable": false,
    "stack": "mixed",
    "auto-route": true,
    "auto-redirect": true,
    "auto-detect-interface": true,
    "dns-hijack": [
      "any:53",
      "tcp://any:53"
    ],
    "device": "mihomo",
    "mtu": 9000,
    "strict-route": false,
    "gso": true,
    "gso-max-size": 65536,
    "udp-timeout": 300,
    "iproute2-table-index": 2022,
    "iproute2-rule-index": 9000,
    "endpoint-independent-nat": false,
    "route-exclude-address": [
      "172.16.0.0/12",
      "192.168.0.0/16",
      "fc00::/7"
    ]
  },
  // DNS 上游分两段：校内域名由 zju-override.yaml 的 nameserver-policy 交给校内
  // DNS 解析，这里只兜住其余（外部）域名。校园网会拦截发往校外的明文 53 端口
  // （实测 1.1.1.1 / 8.8.8.8 / 223.5.5.5 查同一个被墙域名返回同一批错误 IP），
  // 所以国内域名用 114 的结果是好的，国外域名靠下面那组 DoT fallback 校正——
  // 那组走 TCP 853，没有被拦截，删掉就没有反污染能力了。
  "dns": {
    "enable": true,
    "listen": "0.0.0.0:1053",
    "ipv6": true,
    "default-nameserver": [
      "223.5.5.5",
      "119.29.29.29",
      "223.6.6.6"
    ],
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "use-hosts": true,
    "nameserver": [
      "114.114.114.114"
    ],
    "fallback": [
      "tls://1.1.1.1:853",
      "tls://dns.opendns.com",
      "tls://dns.umbrella.com",
      "tls://dns.sse.cisco.com",
      "tls://dns.adguard-dns.com"
    ],
    "fallback-filter": {
      "geoip": true,
      "geoip-code": "CN",
      "ipcidr": [
        "240.0.0.0/4",
        "0.0.0.0/32"
      ]
    },
    "fake-ip-filter-mode": "blacklist",
    "fake-ip-filter": [
      "*",
      "+.lan",
      "*.localdomain",
      "*.example",
      "*.invalid",
      "+.localhost",
      "*.test",
      "+.local",
      "*.home.arpa",
      "p.webshare.io",
      "time.*.com",
      "time.*.gov",
      "time.*.edu.cn",
      "time.*.apple.com",
      "time-ios.apple.com",
      "time1.*.com",
      "time2.*.com",
      "time3.*.com",
      "time4.*.com",
      "time5.*.com",
      "time6.*.com",
      "time7.*.com",
      "ntp.*.com",
      "ntp1.*.com",
      "ntp2.*.com",
      "ntp3.*.com",
      "ntp4.*.com",
      "ntp5.*.com",
      "ntp6.*.com",
      "ntp7.*.com",
      "*.time.edu.cn",
      "*.ntp.org.cn",
      "+.pool.ntp.org",
      "time1.cloud.tencent.com",
      "music.163.com",
      "*.music.163.com",
      "*.126.net",
      "musicapi.taihe.com",
      "music.taihe.com",
      "songsearch.kugou.com",
      "trackercdn.kugou.com",
      "*.kuwo.cn",
      "api-jooxtt.sanook.com",
      "api.joox.com",
      "joox.com",
      "y.qq.com",
      "*.y.qq.com",
      "streamoc.music.tc.qq.com",
      "mobileoc.music.tc.qq.com",
      "isure.stream.qqmusic.qq.com",
      "dl.stream.qqmusic.qq.com",
      "aqqmusic.tc.qq.com",
      "amobile.music.tc.qq.com",
      "*.xiami.com",
      "*.music.migu.cn",
      "music.migu.cn",
      "+.msftconnecttest.com",
      "+.msftncsi.com",
      "localhost.ptlogin2.qq.com",
      "localhost.sec.qq.com",
      "+.qq.com",
      "+.tencent.com",
      "+.srv.nintendo.net",
      "*.n.n.srv.nintendo.net",
      "+.stun.playstation.net",
      "xbox.*.*.microsoft.com",
      "*.*.xboxlive.com",
      "xbox.*.microsoft.com",
      "xnotify.xboxlive.com",
      "+.battlenet.com.cn",
      "+.wotgame.cn",
      "+.wggames.cn",
      "+.wowsgame.cn",
      "+.wargaming.net",
      "proxy.golang.org",
      "stun.*.*",
      "stun.*.*.*",
      "+.stun.*.*",
      "+.stun.*.*.*",
      "+.stun.*.*.*.*",
      "+.stun.*.*.*.*.*",
      "heartbeat.belkin.com",
      "*.linksys.com",
      "*.linksyssmartwifi.com",
      "*.router.asus.com",
      "mesu.apple.com",
      "swscan.apple.com",
      "swquery.apple.com",
      "swdownload.apple.com",
      "swcdn.apple.com",
      "swdist.apple.com",
      "lens.l.google.com",
      "stun.l.google.com",
      "na.b.g-tun.com",
      "+.nflxvideo.net",
      "*.square-enix.com",
      "*.finalfantasyxiv.com",
      "*.ffxiv.com",
      "*.ff14.sdo.com",
      "ff.dorado.sdo.com",
      "*.mcdn.bilivideo.cn",
      "+.media.dssott.com",
      "shark007.net",
      "Mijia Cloud",
      "+.cmbchina.com",
      "+.cmbimg.com",
      "local.adguard.org",
      "+.sandai.net",
      "+.n0808.com",
      "+.market.xiaomi.com",
      "*.lan",
      "*.localhost",
      "*.local",
      "*.direct",
      "cable.auth.com",
      "network-test.debian.org",
      "detectportal.firefox.com",
      "resolver1.opendns.com",
      "global.turn.twilio.com",
      "global.stun.twilio.com",
      "app.yinxiang.com",
      "injections.adguard.org",
      "localhost.*.weixin.qq.com",
      "*.blzstatic.cn",
      "*.cmpassport.com",
      "id6.me",
      "open.e.189.cn",
      "opencloud.wostore.cn",
      "id.mail.wo.cn",
      "mdn.open.wo.cn",
      "hmrz.wo.cn",
      "nishub1.10010.com",
      "enrichgw.10010.com",
      "*.wosms.cn",
      "*.jegotrip.com.cn",
      "*.icitymobile.mobi",
      "*.pingan.com.cn",
      "*.cmbchina.com",
      "*.10099.com.cn",
      "*.microdone.cn",
      "PDC._msDCS.*.*",
      "DC._msDCS.*.*",
      "GC._msDCS.*.*",
      "+.cdn.nintendo.net",
      "+.battle.net",
      "+.uu.163.com",
      "ps.res.netease.com",
      "+.pub.3gppnetwork.org",
      "+.services.googleapis.cn",
      "+.clientservices.googleapis.com",
      "+.googleapis.cn",
      "+.xn--ngstr-lra8j.com",
      "*.rockstargames.com",
      "geosite:cn"
    ]
  },
  "sniffer": {
    "enable": true,
    "override-destination": true,
    "sniff": {
      "http": {
        "ports": [
          80,
          8080
        ]
      },
      "tls": {
        "ports": [
          443,
          8443
        ]
      }
    },
    "skip-domain": [
      "courier.push.apple.com",
      "Mijia Cloud"
    ]
  },
  "proxies": null,
  "proxy-groups": [
    {
      "name": "🚀 节点选择",
      "type": "select",
      "proxies": [
        "♻️ 自动选择",
        "🔮 负载均衡",
        "✈ 故障切换",
        "DIRECT"
      ]
    },
    {
      "name": "♻️ 自动选择",
      "type": "url-test",
      "url": "http://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50,
      "proxies": null
    },
    {
      "url": "http://www.gstatic.com/generate_204",
      "interval": 500,
      "name": "🔮 负载均衡",
      "type": "load-balance",
      "proxies": null
    },
    {
      "url": "http://www.gstatic.com/generate_204",
      "interval": 500,
      "name": "✈ 故障切换",
      "type": "fallback",
      "proxies": null
    },
    {
      "name": "🌍 国外媒体",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    {
      "name": "📲 电报信息",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    {
      "name": "Ⓜ️ 微软服务",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    {
      "name": "🍎 苹果服务",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    {
      "name": "📢 谷歌FCM",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    // 内置规则表（src/rules/builtin.js）只用到这个组：AI 服务挑 IP 地区，
    // 值得单独一个入口；其余代理类流量走下面的兜底组，不再单独分组。
    {
      "name": "🤖 AI 研究",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    },
    {
      "name": "🎯 全球直连",
      "type": "select",
      "proxies": [
        "DIRECT",
        "🚀 节点选择",
        "♻️ 自动选择"
      ]
    },
    {
      "name": "🛑 全球拦截",
      "type": "select",
      "proxies": [
        "REJECT",
        "DIRECT"
      ]
    },
    {
      "name": "🍃 应用净化",
      "type": "select",
      "proxies": [
        "REJECT",
        "DIRECT"
      ]
    },
    // 内置规则表的兜底组：没被任何规则命中的流量都进这里。
    // 默认选中「节点选择」= 未匹配的走代理，这样内置表只需要列「要直连的」
    // 和「要单独挑节点的」，其余不必逐条列举（候选里也留了直连，方便一处切换）。
    {
      "name": "🐟 漏网之鱼",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连"
      ]
    }
  ]
};

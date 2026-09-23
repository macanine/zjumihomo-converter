/**
 * 内置分流规则表。
 *
 * 来源是 GLaDOS 客户端的 mihomo 配置里的 rules 段，按本项目的策略组词汇重写。
 * 内置的理由：规则默认要从 ACL4SSR 云端拉，转换端一旦出不了网（校园网里很常见）
 * 就只剩两条兜底规则，等于没有分流。内置一份让「离线也按用途分流」成为默认。
 *
 * 表项是 [策略组, 条目…]，条目两种写法：
 *   - 不含逗号：域后缀，展开成 DOMAIN-SUFFIX（来源里绝大多数是这种）
 *   - 含逗号：完整规则（类型,参数），原样接上策略组
 *     （DOMAIN-KEYWORD,porn / GEOIP,CN / DST-PORT,8080）
 *
 * **顺序就是优先级**：Clash 先匹配先命中。所以分段顺序与来源配置严格一致，
 * 同一个策略组会因此出现多次——那是来源自己的分段，合并会改变匹配结果。
 * 段内条目同样按来源原样保留，包括被前面更宽的规则遮住的那些。
 * 每条上面的「来源分组」注释用来对账：想核对某条规则出自哪里时看它。
 *
 * 组名必须和 src/config.js 里的策略组对得上。引用不存在的组时规则会被
 * filter_rules 丢掉（mihomo 会拒绝加载引用未知组的配置），所以加组和加规则
 * 要一起改。分类映射（来源 → 本项目）：
 *
 *   DIRECT            → 🎯 全球直连
 *   Default Proxy     → 🚀 节点选择
 *   Research + AI     → 🤖 AI 研究
 *   Streaming         → 🌍 国外媒体
 *   Developer         → 💻 开发工具
 *   Download/Express  → ⬇️ 下载更新
 *   Steam             → 🎮 游戏平台
 *   Microsoft         → Ⓜ️ 微软服务
 *   Apple             → 🍎 苹果服务
 *   US / TW / 固定 IP → 🚀 节点选择（那是机场自己的节点分组，通用转换器没有对应概念）
 *
 * 两处按本项目场景做的取舍：
 *   - 机场自有域名（glados.vip / glados.work / gladns.*）删掉，对别人没有意义；
 *   - pstatp.com（抖音、头条的 CDN）来源里同时排在「流媒体」段和「国内」段，
 *     按先匹配先命中会走国外媒体组。这里直接归国内直连——它就是个国内 CDN。
 *
 * 模板里的「📲 电报信息」「📢 谷歌FCM」两个组由内置表空着（ACL4SSR 预设才用）：
 * 来源配置把电报/Discord/社交一律丢给 Default Proxy，这里跟着走 🚀 节点选择。
 * 想让它们单独成组，就在这张表里把那几条挪到对应组名下——组本来就在模板里。
 */

const BUILTIN_TABLE = [
  // 来源分组：DIRECT
  ['🎯 全球直连', [
    'DST-PORT,8080', 'localhost', 'localhost.localdomain', 'local', 'internal', 'intranet', 'corp',
    'private', 'router.asus.com', 'tplinkwifi.net', 'tplogin.cn', 'tendawifi.com', 'miwifi.com',
    'router.ctc', 'my.router', 'fritz.box', 'myrouter.local', 'netgear.com', 'routerlogin.net',
    'linksyssmartwifi.com', 'synology.me', 'myqnapcloud.com', 'test', 'example', 'invalid',
    'dev.local', 'test.local', 'localdomain', 'DOMAIN-KEYWORD,.local', 'DOMAIN-KEYWORD,localhost',
  ]],
  // 来源分组：Default Proxy
  ['🚀 节点选择', [
    'ipinfo.io', 'ip-api.com', 'ipapi.co', 'ipify.org', 'api.ipify.org', 'icanhazip.com',
    'ifconfig.me', 'ifconfig.co', 'checkip.amazonaws.com', 'ipecho.net', 'myip.com',
    'whatismyip.com', 'whatismyipaddress.com', 'whoer.net', 'ipleak.net', 'ipleak.org', 'ip.me',
    'ip.sb', 'ip.gs', 'ip138.com', 'ipip.net', 'cip.cc', 'myip.la', 'ip.skk.moe', 'ip.tool.lu',
    'dnsleaktest.com', 'dnsleak.com', 'browserleaks.com', 'bash.ws', 'webrtc-leak.glitch.me',
    'ip2location.com', 'maxmind.com', 'geoiplookup.net', 'db-ip.com', 'ipgeolocation.io',
    'ipstack.com', 'ipdata.co', 'abstractapi.com', 'ip-score.com', 'speedtest.net', 'fast.com',
    'speedof.me', 'DOMAIN-KEYWORD,whatismyip', 'DOMAIN-KEYWORD,myipaddress',
    'DOMAIN-KEYWORD,ipleak', 'DOMAIN-KEYWORD,ipcheck', 'DOMAIN-KEYWORD,checkip',
  ]],
  // 来源分组：Microsoft
  ['Ⓜ️ 微软服务', [
    'microsoft.com', 'microsoftonline.com', 'msftauth.net', 'msauth.net', 'msauthimages.net',
    'msftauthimages.net', 'msn.com', 'live.com', 'office.com', 'office365.com', 'sharepoint.com',
    'outlook.com', 'hotmail.com', 'windows.com', 'windows.net', 'azure.com', 'azure.net',
    'azureedge.net', 'azurewebsites.net', 'bing.com', 'bing.net', 'skype.com', 'linkedin.com',
    'licdn.com', 'onenote.com', 'onenote.net', 'onedrive.com', 'onedrive.live.com',
    'teams.microsoft.com', 'visualstudio.com', 'xbox.com', 'xboxlive.com', 'windowsupdate.com',
    'msedge.net', 'msftconnecttest.com', 'exp-tas.com', 'DOMAIN-KEYWORD,microsoft',
    'DOMAIN-KEYWORD,msft',
  ]],
  // 来源分组：Apple
  ['🍎 苹果服务', [
    'apple.com', 'apple.com.cn', 'cdn-apple.com', 'icloud.com', 'icloud-content.com', 'me.com',
    'appsto.re', 'apps.apple.com', 'mzstatic.com', 'itunes.apple.com', 'iosapps.itunes.apple.com',
    'osxapps.itunes.apple.com', 'music.apple.com', 'apple-cloudkit.com', 'apple-livephotoskit.com',
    'appleid.apple.com', 'appleid.cdn-apple.com', 'appleiphonecell.com', 'apzones.com',
    'swcdn.apple.com', 'swdist.apple.com', 'swdownload.apple.com', 'updates.cdn-apple.com',
    'updates-http.cdn-apple.com', 'appldnld.apple.com', 'xp.apple.com', 'gdmf.apple.com',
    'mesu.apple.com', 'osrecovery.apple.com', 'tv.apple.com', 'news.apple.com', 'apple.news',
    'push.apple.com', 'setup.icloud.com', 'www.apple.com', 'aaplimg.com', 'apple.co',
    'applimg.com', 'DOMAIN-KEYWORD,apple', 'DOMAIN-KEYWORD,icloud', 'DOMAIN-KEYWORD,itunes',
  ]],
  // 来源分组：Default Proxy
  ['🚀 节点选择', [
    'telegram.org', 't.me', 'telegram.me', 'telegra.ph', 'telesco.pe', 'discord.com', 'discord.gg',
    'discordapp.com', 'discordapp.net', 'discord.media', 'whatsapp.com', 'whatsapp.net', 'wa.me',
    'DOMAIN-KEYWORD,telegram', 'DOMAIN-KEYWORD,discord', 'twitter.com', 'x.com', 'twimg.com',
    't.co', 'twittercdn.com', 'facebook.com', 'fbcdn.net', 'fb.com', 'fb.me', 'fbsbx.com',
    'facebook.net', 'tfbnw.net', 'instagram.com', 'cdninstagram.com', 'instagr.am', 'reddit.com',
    'redd.it', 'redditmedia.com', 'redditstatic.com', 'DOMAIN-KEYWORD,twitter',
    'DOMAIN-KEYWORD,facebook', 'DOMAIN-KEYWORD,instagram', 'longbridge.global', 'lbctrl.com',
    'lbkrs.com', 'wbrks.com', 'lbkg.net', 'lb-static.com', 'longportapp.cn', 'longportapp.com',
    'longportapp.hk', 'longbridgeapp.com', 'longbridge.com', 'longbridge.cloud', 'longbridge.cn',
    'longbridgehk.com', 'longbridge.hk', 'longbridge.sg', 'longbridge-inc.com', 'futuhk.com',
    'futusg.com', 'futu.link', 'futunn.com', 'futunn.cn', 'futuhn.com', 'futusign.com',
    'futuinc.com', 'futu.com', 'futu0.com', 'futu1.com', 'futu2.com', 'futu3.com', 'futu4.com',
    'futu5.com', 'futu6.com', 'futu7.com', 'futu8.com', 'futu9.com', 'futuniuniu.com', 'futu.cn',
    'futufin.com', 'futuhk2.com', 'futuholdings.com', 'futuesop.com', 'futuau.com', 'futuhk1.com',
    'futuhkapp.com', 'futuoa.com', 'futubull.cn', 'futuchain.com', 'futuone.com', 'futuclean.com',
    'ftnndn.com', 'futuweb.com', 'futures.hk', 'moomoo.com', 'moomoo-us.com', 'moomooequity.com',
    'moomootrustee.com', 'fututrade.com', 'futusecurities.com', 'futumkt.com', 'futu.sg',
    'futu.au', 'futustatic.com', 'atigrpulse.com', 'atigrzen.com', 'itigergrowth.com',
    'itigergrowtha.com', 'skytigris.cn', 'skytigris.com', 'tigrdw.com', 'tigrwd.com',
    'tigerbrokers.com', 'tigerbrokers.com.au', 'tigerbrokers.com.hk', 'tigerbrokers.com.sg',
    'tigerbrokers.nz', 'tigersecurities.com', 'tradeup.com', 'laohu8.com', 'tigerbbs.cn',
    'tigerbbs.com', 'xiaohu8.com', 'zhijianfengyi.cn', 'zhijianfengyi.com',
    'DOMAIN-KEYWORD,futunn', 'DOMAIN-KEYWORD,futubull', 'DOMAIN-KEYWORD,futuhk',
    'DOMAIN-KEYWORD,futufin', 'DOMAIN-KEYWORD,futuholdings', 'DOMAIN-KEYWORD,futuniuniu',
    'DOMAIN-KEYWORD,futuesop', 'DOMAIN-KEYWORD,moomoo', 'DOMAIN-KEYWORD,tigerbrokers',
  ]],
  // 来源分组：Download
  ['⬇️ 下载更新', [
    'huggingface.co', 'cdn-lfs.huggingface.co', 'cdn-lfs-us-1.huggingface.co',
    'cdn-lfs-eu-1.huggingface.co', 's3.amazonaws.com', 'hf.co', 'cdn.openai.com', 'oaistatic.com',
    'files.oaiusercontent.com', 'civitai.com', 'image.civitai.com', 'model.civitai.com',
    'replicate.com', 'replicate.delivery', 'wandb.ai', 'api.wandb.ai', 'kaggle.com',
    'storage.googleapis.com', 'modelzoo.co', 'download.pytorch.org', 'download.tensorflow.org',
    'ngc.nvidia.com', 'api.ngc.nvidia.com', 'ollama.ai', 'ollama.com', 'registry.ollama.ai',
    'lmstudio.ai',
  ]],
  // 来源分组：Research + AI
  ['🤖 AI 研究', [
    'chat.com', 'chatgpt.com', 'chatgpt.site', 'crixet.com', 'oaistatic.com', 'oaistatsig.com',
    'oaiusercontent.com', 'openai.com', 'sora.com', 'anthropic.com', 'claude.ai', 'claude.com',
    'clau.de', 'claudeusercontent.com', 'claudemcpclient.com', 'claudemcpcontent.com',
    'gemini.google.com', 'bard.google.com', 'deepmind.com', 'deepmind.google',
    'aistudio.google.com', 'makersuite.google.com', 'gemini.google', 'chat.google.com',
    'ai.studio', 'generativeai.google', 'generativelanguage.googleapis.com', 'ai.google.dev',
    'aiplatform.googleapis.com', 'aicode.googleapis.com', 'ai.google', 'ai.google.com',
    'gemini.gstatic.com', 'labs.google.com', 'labs.google', 'jules.google', 'jules.google.com',
    'antigravity.google', 'flow.google', 'flow.google.com', 'stitch.withgoogle.com',
    'cloud.google.com', 'notebooklm.google.com', 'notebooklm.google', 'notebook.google',
    'notebook.google.com', 'perplexity.ai', 'mistral.ai', 'cohere.ai', 'cohere.com', 'groq.com',
    'x.ai', 'grok.com', 'cursor.com', 'cursor.sh', 'cursorapi.com', 'cursor-cdn.com',
    'together.ai', 'replicate.com', 'stability.ai', 'midjourney.com', 'poe.com', 'character.ai',
    'inflection.ai', 'pi.ai', 'DOMAIN-KEYWORD,openai', 'DOMAIN-KEYWORD,claude',
    'DOMAIN-KEYWORD,anthropic', 'DOMAIN-KEYWORD,gemini.google',
    'DOMAIN-KEYWORD,generativelanguage', 'DOMAIN-KEYWORD,cursor',
  ]],
  // 来源分组：Streaming
  ['🌍 国外媒体', [
    'youtube.com', 'ytimg.com', 'googlevideo.com', 'youtu.be', 'youtube-nocookie.com', 'yt.be',
    'DOMAIN-KEYWORD,youtube',
  ]],
  // 来源分组：Research + AI
  ['🤖 AI 研究', [
    'google.com', 'google.com.hk', 'google.co.jp', 'googleapis.com', 'googleapis.cn',
    'gstatic.com', 'ggpht.com', 'googleusercontent.com', 'googlesyndication.com',
    'googleadservices.com', 'google-analytics.com', 'play.google.com', 'play.googleapis.com',
    'android.clients.google.com', 'android.com', 'googleplay.com', 'play-fe.googleapis.com',
    'play-games.googleusercontent.com', 'play-lh.googleusercontent.com', 'xn--ngstr-lra8j.com',
    'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'philpapers.org', 'zenodo.org',
    'figshare.com', 'osf.io', 'springer.com', 'springerlink.com', 'link.springer.com',
    'sciencedirect.com', 'elsevier.com', 'nature.com', 'science.org', 'sciencemag.org',
    'wiley.com', 'onlinelibrary.wiley.com', 'tandfonline.com', 'sagepub.com', 'cambridge.org',
    'oxfordjournals.org', 'academic.oup.com', 'oup.com', 'pnas.org', 'cell.com', 'thelancet.com',
    'bmj.com', 'nejm.org', 'acs.org', 'pubs.acs.org', 'rsc.org', 'iop.org', 'iopscience.iop.org',
    'aip.org', 'aps.org', 'mdpi.com', 'frontiersin.org', 'plos.org', 'plosone.org', 'hindawi.com',
    'degruyter.com', 'karger.com', 'emerald.com', 'ingentaconnect.com', 'annualreviews.org',
    'ieee.org', 'ieeexplore.ieee.org', 'acm.org', 'dl.acm.org', 'jstor.org', 'muse.jhu.edu',
    'projecteuclid.org', 'mathscinet.ams.org', 'ams.org', 'siam.org', 'doi.org', 'crossref.org',
    'orcid.org', 'scopus.com', 'webofscience.com', 'clarivate.com', 'dimensions.ai', 'lens.org',
    'nih.gov', 'ncbi.nlm.nih.gov', 'pubmed.gov', 'pubmedcentral.nih.gov', 'clinicaltrials.gov',
    'cochranelibrary.com', 'uptodate.com', 'medscape.com', 'webmd.com', 'scholar.google.com',
    'semanticscholar.org', 'academia.edu', 'researchgate.net', 'mendeley.com', 'zotero.org',
    'connectedpapers.com', 'scite.ai', 'litmaps.com', 'inciteful.xyz', 'base-search.net',
    'core.ac.uk', 'worldcat.org', 'loc.gov', 'proquest.com', 'ebsco.com', 'ebscohost.com',
    'gale.com', 'dblp.org', 'paperswithcode.com', 'openreview.net', 'aclweb.org',
    'aclanthology.org', 'neurips.cc', 'icml.cc', 'iclr.cc', 'cvpr.org', 'thecvf.com',
    'wolfram.com', 'wolframalpha.com', 'mathworld.wolfram.com', 'overleaf.com', 'sharelatex.com',
    'authorea.com', 'hypothes.is', 'gmail.com', 'googlemail.com', 'mail.google.com',
    'DOMAIN-KEYWORD,google', 'DOMAIN-KEYWORD,scholar.google',
  ]],
  // 来源分组：Streaming
  ['🌍 国外媒体', [
    'netflix.com.edgesuite.net', 'us-west-2.amazonaws.com', 'netflix.com', 'netflix.net',
    'nflximg.net', 'nflximg.com', 'nflxvideo.net', 'nflxso.net', 'nflxext.com', 'twitch.tv',
    'twitchcdn.net', 'twitchsvc.net', 'jtvnw.net', 'twitchcon.com', 'spotify.com',
    'spotifycdn.com', 'scdn.co', 'spoti.fi', 'spotify.link', 'disneyplus.com', 'disney-plus.net',
    'dssott.com', 'bamgrid.com', 'disney.com', 'disneystreaming.com', 'disneyaccount.com',
    'disneyplus.bn5x.net', 'hulu.com', 'huluim.com', 'hulustream.com', 'pornhub.com',
    'pornhubpremium.com', 'phncdn.com', 'xvideos.com', 'xvideos-cdn.com', 'xnxx.com',
    'xhamster.com', 'xhamsterlive.com', 'xhcdn.com', 'redtube.com', 'redtubefiles.com',
    'youporn.com', 'ypncdn.com', 'tube8.com', 'spankbang.com', 'spankbang.party', 'sb-cd.com',
    'eporner.com', 'eporner.sex', 'tnaflix.com', 'empflix.com', 'txxx.com', 'hdzog.com',
    'hclips.com', 'upornia.com', 'vjav.com', 'jav.guru', 'javhd.com', 'javlibrary.com', 'r18.com',
    'dmm.co.jp', 'stripchat.com', 'chaturbate.com', 'cam4.com', 'livejasmin.com', 'bongacams.com',
    'myfreecams.com', 'camsoda.com', 'streamate.com', 'flirt4free.com', 'imlive.com', 'rule34.xxx',
    'rule34.paheal.net', 'e-hentai.org', 'exhentai.org', 'ehgt.org', 'nhentai.net', 'hitomi.la',
    'gelbooru.com', 'danbooru.donmai.us', 'sankakucomplex.com', 'konachan.com', 'yande.re',
    'sex.com', 'imagefap.com', 'fapello.com', 'coomer.party', 'kemono.party', 'simpcity.su',
    'f95zone.to', 'lewdzone.com', 'leakedbb.com', 'avgle.com', 'thisav.com', 'missav.com',
    'supjav.com', 'jable.tv', '91porn.com', 'caoliu.com', 'sexinsex.net', 't66y.com', 'xart.com',
    'brazzers.com', 'realitykings.com', 'mofos.com', 'bangbros.com', 'naughtyamerica.com',
    'digitalplayground.com', 'fakehub.com', 'teamskeet.com', 'vixen.com', 'blacked.com',
    'tushy.com', 'onlyfans.com', 'fansly.com', 'fanvue.com', 'patreon.com', 'gumroad.com',
    'loyalfans.com', 'justfor.fans', 'manyvids.com', 'clips4sale.com', 'iwantclips.com',
    'rncdn1.com', 'rncdn2.com', 'rncdn3.com', 'rncdn7.com', 'hbomax.com', 'max.com', 'hbo.com',
    'hbo', 'h264.io', 'DOMAIN-KEYWORD,netflix', 'DOMAIN-KEYWORD,twitch', 'DOMAIN-KEYWORD,porn',
    'DOMAIN-KEYWORD,xxx', 'DOMAIN-KEYWORD,xnxx', 'DOMAIN-KEYWORD,hentai', 'DOMAIN-KEYWORD,adult',
  ]],
  // 来源分组：Developer
  ['💻 开发工具', [
    'github.com', 'github.io', 'githubusercontent.com', 'githubassets.com', 'ghcr.io',
    'github.dev', 'copilot.github.com', 'ghe.com', 'githubsupport.com', 'gitlab.com', 'gitlab.io',
    'npmjs.com', 'npmjs.org', 'yarnpkg.com', 'unpkg.com', 'jsdelivr.net', 'esm.sh', 'pypi.org',
    'pythonhosted.org', 'python.org', 'docker.com', 'docker.io', 'dockerhub.com',
    'registry-1.docker.io', 'auth.docker.io', 'index.docker.io',
    'production.cloudflare.docker.com', 'vercel.com', 'vercel.app', 'netlify.com', 'netlify.app',
    'heroku.com', 'railway.app', 'render.com', 'fly.io', 'replit.com', 'glitch.com',
    'supabase.com', 'supabase.co', 'planetscale.com', 'neon.tech', 'codepen.io', 'codesandbox.io',
    'jsfiddle.net', 'stackblitz.com', 'v2ex.com', 'stackoverflow.com', 'stackexchange.com',
    'dev.to', 'hashnode.com', 'medium.com', 'figma.com', 'notion.so', 'notion.site', 'linear.app',
    'trello.com', 'asana.com', 'slack.com', 'atlassian.com', 'atlassian.net', 'jira.com',
    'confluence.com', 'airtable.com', 'clickup.com', 'monday.com', 'DOMAIN-KEYWORD,github',
  ]],
  // 来源分组：Express
  ['⬇️ 下载更新', [
    'download.microsoft.com', 'windowsupdate.com', 'update.microsoft.com', 'wustat.windows.com',
    'ntservicepack.microsoft.com', 'go.microsoft.com', 'dl.delivery.mp.microsoft.com',
    'emdl.ws.microsoft.com', 'msftconnecttest.com', 'msftncsi.com', 'swcdn.apple.com',
    'swdist.apple.com', 'swdownload.apple.com', 'updates.cdn-apple.com', 'appldnld.apple.com',
    'iosapps.itunes.apple.com', 'osxapps.itunes.apple.com', 'updates-http.cdn-apple.com',
    'xp.apple.com', 'gdmf.apple.com', 'mesu.apple.com', 'osrecovery.apple.com', 'ccmdl.adobe.com',
    'ccmdls.adobe.com', 'adobedownloads.edgesuite.net', 'ardownload.adobe.com', 'armdl.adobe.com',
    'download.jetbrains.com', 'plugins.jetbrains.com', 'update.code.visualstudio.com',
    'az764295.vo.msecnd.net', 'vscode.download.prss.microsoft.com', 'dl.google.com',
    'edgedl.me.gvt1.com', 'redirector.gvt1.com', 'update.googleapis.com', 'download.mozilla.org',
    'archive.mozilla.org', 'aus5.mozilla.org', 'wetransfer.com', 'we.tl', 'send-anywhere.com',
    'sendgb.com', 'transfer.sh', 'file.io', 'gofile.io', 'anonfiles.com', 'bayfiles.com',
    'fileditch.com', 'archive.org', 'ia600.us.archive.org', 'ia800.us.archive.org',
    'ia900.us.archive.org', 'web.archive.org', 'catbox.moe', 'files.catbox.moe',
    'litter.catbox.moe', 'imgur.com', 'i.imgur.com', 'streamable.com', 'ufile.io',
    'uploadfiles.io', 'zippyshare.com', '1fichier.com', 'rapidgator.net', 'uploaded.net', 'ul.to',
    'turbobit.net', 'nitroflare.com',
  ]],
  // 来源分组：Steam
  ['🎮 游戏平台', [
    'store.steampowered.com', 'steampowered.com', 'steamgames.com', 'valvesoftware.com', 's.team',
    'steamcommunity.com', 'steamusercontent.com', 'steamstatic.com', 'steamcdn-a.akamaihd.net',
    'cdn.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com', 'steam-chat.com',
    'steamcontent.com', 'steampipe.akamaized.net', 'lancache.steamcontent.com',
    'edgecast.steamstatic.com', 'steambroadcast.akamaized.net', 'steamtv.cloud',
    'api.steampowered.com', 'partner.steamgames.com', 'help.steampowered.com',
    'support.steampowered.com', 'login.steampowered.com', 'checkout.steampowered.com',
    'steamuserimages-a.akamaihd.net', 'steamvideo-a.akamaihd.net', 'steamcommunity-a.akamaihd.net',
    'steamstore-a.akamaihd.net', 'media.steampowered.com', 'video.steampowered.com',
    'workshop.steampowered.com', 'cloud.steampowered.com',
    'steamcloud-us-west1.storage.googleapis.com', 'steamcloud-eu-west1.storage.googleapis.com',
    'cache.steamcontent.com', 'content-origin.steampowered.com', 'valve.net',
    'steamconnecttest.com', 'dota2.com', 'steamchina.com', 'csgo.wmsj.cn', 'wmsjsteam.com',
    'epicgames.com', 'epicgames.dev', 'unrealengine.com', 'fortnite.com',
    'fortnite-vod.akamaized.net', 'DOMAIN-KEYWORD,steamcdn', 'DOMAIN-KEYWORD,steamcontent',
    'DOMAIN-KEYWORD,steampowered', 'DOMAIN-KEYWORD,steamcommunity',
  ]],
  // 来源分组：Default Proxy
  ['🚀 节点选择', [
    'akamai.net', 'akamaized.net', 'akamaihd.net', 'akamaitechnologies.com', 'akadns.net',
    'akam.net', 'edgesuite.net', 'edgekey.net', 'cloudflare.com', 'cloudflare-dns.com',
    'cdnjs.cloudflare.com', 'cloudflareinsights.com', 'fastly.net', 'fastlylb.net', 'fastly.com',
    'cloudfront.net', 'azureedge.net', 'msecnd.net', 'azure.com', 'blob.core.windows.net',
    'vo.msecnd.net', 'gstatic.com', 'googleapis.com', 'stackpath.com', 'stackpathdns.com',
    'maxcdn.com', 'netdna-cdn.com', 'netdna-ssl.com', 'kxcdn.com', 'keycdn.com', 'cdn77.org',
    'cdn77.com', 'limelight.com', 'llnwd.net', 'llnw.net', 'hwcdn.net', 'cachefly.net',
    'b-cdn.net', 'bunnycdn.com', 'jsdelivr.net', 'unpkg.com', 'cdnjs.com', 'bootstrapcdn.com',
    'ajax.googleapis.com', 'DOMAIN-KEYWORD,cloudflare', 'DOMAIN-KEYWORD,fastly',
    'DOMAIN-KEYWORD,jsdelivr', 'tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com',
    'muscdn.com', 'musical.ly', 'tiktokcdn-us.com', 'ttcdn-us.com', 'ibytedtos.com',
    'DOMAIN-KEYWORD,tiktok',
  ]],
  // 来源分组：DIRECT
  ['🎯 全球直连', [
    'cn', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ip111.cn', 'ip.cn', 'qq.com',
    'tencent.com', 'weixin.com', 'wechat.com', 'wx.qq.com', 'weixin.qq.com', 'qpic.cn', 'gtimg.cn',
    'gtimg.com', 'idqqimg.com', 'qlogo.cn', 'myqcloud.com', 'tenpay.com', 'tengxun.com',
    'taobao.com', 'tmall.com', 'alipay.com', 'aliyun.com', 'alicdn.com', 'alibaba.com',
    'alibabacloud.com', 'aliyuncs.com', '1688.com', 'aliexpress.com', 'alimama.com',
    'alipayobjects.com', 'mmstat.com', 'tbcdn.cn', 'taobaocdn.com', 'cainiao.com', 'ele.me',
    'elemecdn.com', 'amap.com', 'autonavi.com', 'dingtalk.com', 'dingtalkapps.com', 'xiami.com',
    'youku.com', 'ykimg.com', 'tudou.com', 'cibntv.net', 'ucweb.com', 'baidu.com', 'baidubce.com',
    'baidustatic.com', 'bdstatic.com', 'bdimg.com', 'bcebos.com', 'baiducontent.com',
    'baidupcs.com', 'baifubao.com', 'hao123.com', 'nuomi.com', 'tieba.com', 'pan.baidu.com',
    'bytedance.com', 'bytedance.net', 'bytecdn.cn', 'byteimg.com', 'bytegoofy.com', 'douyin.com',
    'douyincdn.com', 'douyinpic.com', 'douyinstatic.com', 'amemv.com', 'snssdk.com', 'toutiao.com',
    'toutiaocdn.com', 'toutiaoimg.com', 'pstatp.com', 'ixigua.com', 'ixiguavideo.com',
    'huoshan.com', 'huoshanzhibo.com', 'feiliao.com', 'zjurl.cn', 'zijieapi.com', 'feishu.cn',
    'feishucdn.com', 'larkoffice.com', 'bilibili.com', 'bilivideo.com', 'bilivideo.cn',
    'biliapi.net', 'biliapi.com', 'hdslb.com', 'acgvideo.com', 'im9.com', '163.com', '126.com',
    'netease.com', 'netease.im', 'ntes.com', 'ydstatic.com', 'youdao.com', '163yun.com',
    'neteasegames.com', 'nie.netease.com', 'yeah.net', 'jd.com', 'jd.hk', 'jdcloud.com',
    'jdpay.com', '360buyimg.com', 'jcloudcache.com', 'jcloudcdn.com', 'jddebug.com', 'jdcache.com',
    'iqiyi.com', 'iqiyipic.com', 'qiyi.com', 'qiyipic.com', 'pps.tv', 'ppstream.com', 'qy.net',
    'sina.com', 'sina.com.cn', 'sinaimg.cn', 'sinajs.cn', 'sina.cn', 'weibo.com', 'weibo.cn',
    'weibocdn.com', 'miaopai.com', 'zhihu.com', 'zhimg.com', 'xiaomi.com', 'xiaomi.cn', 'mi.com',
    'miui.com', 'xiaomiyoupin.com', 'duokan.com', 'huawei.com', 'vmall.com', 'huaweicloud.com',
    'hicloud.com', 'hichina.com', 'dbankcloud.com', 'kuaishou.com', 'gifshow.com', 'yxixy.com',
    'kwimgs.com', 'kuaishouzt.com', 'pinduoduo.com', 'yangkeduo.com', 'pinduoduo.net',
    'meituan.com', 'meituan.net', 'dianping.com', 'dpfile.com', 'maoyan.com', 'didiglobal.com',
    'didialift.com', 'xiaojukeji.com', 'udache.com', 'sohu.com', 'sogou.com', 'sogoucdn.com',
    'sogo.com', 'so.com', '360.cn', '360.com', 'qihoo.com', 'qhimg.com', 'qhimgs.com',
    'douban.com', 'doubanio.com', 'ctrip.com', 'c-ctrip.com', 'ly.com', 'qunar.com', 'fliggy.com',
    'tuniu.com', 'suning.com', 'suning.cn', 'vip.com', 'vipstatic.com', 'gome.com.cn',
    'xunlei.com', 'sandai.net', 'wandoujia.com', 'coolapk.com', 'oppo.com', 'vivo.com',
    'meizu.com', 'flyme.cn', 'lenovo.com', 'zol.com.cn', 'ccb.com', 'icbc.com.cn', 'boc.cn',
    'abchina.com', 'psbc.com', 'cmbchina.com', 'unionpay.com', 'bankcomm.com', 'spdb.com.cn',
    'cebbank.com', 'cmbc.com.cn', 'ifeng.com', 'thepaper.cn', 'caixin.com', 'yicai.com',
    'jiemian.com', 'cctv.com', 'cctv.cn', 'xinhuanet.com', 'people.com.cn', 'chinadaily.com.cn',
    'huanqiu.com', 'guancha.cn', 'cankaoxiaoxi.com', 'bjnews.com.cn', 'csdn.net', 'oschina.net',
    'gitee.com', 'iteye.com', 'infoq.cn', '51cto.com', 'cnblogs.com', 'jianshu.com', 'juejin.cn',
    'segmentfault.com', 'xuetangx.com', 'icourse163.org', 'mooc.cn', 'study.163.com',
    'yuketang.cn', 'taptap.com', 'taptapdada.com', '37.com', '4399.com', '7k7k.com', 'yy.com',
    'duowan.com', 'huya.com', 'douyu.com', 'douyucdn.cn', 'douyutv.com', 'aliyuncdn.com',
    'alikunlun.com', 'kunlunaq.com', 'kunlunca.com', 'kunlunsl.com', 'kunlunpi.com',
    'kunlungr.com', 'cdnhwc2.com', 'cdnhwc3.com', 'hwcloudcdn.com', 'baishan.com',
    'baishancloud.com', 'baishancdnx.com', 'qiniucdn.com', 'qiniudn.com', 'qbox.me', 'upyun.com',
    'upaiyun.com', 'clouddn.com', 'ksyuncdn.com', 'ksyun.com', 'ks-cdn.com', 'kscdnx.com',
    'chinanetcenter.com', 'wangsu.com', 'wscdns.com', 'wsglb0.com', 'cdn20.com', 'cdn30.com',
    'staticdn.net', 'bdydns.com', 'bdydns.net', 'tencentcloudcdn.com', 'dnsv1.com', 'tdnsv5.com',
    'tdnsv6.com', 'cdntip.com', 'cdntips.com', 'cdnle.com', 'txcdns.com', 'qcloud.com',
    'qcloudcdn.com', 'qcloudimg.com', 'qcloudcos.com', 'myqcloud.cos', 'cloudfront.cn',
    'mtyun.com', 'ctcdn.cn', 'ctyun.cn', 'ctyunapi.cn', 'chinacache.com', 'chinacache.net',
    'ccgslb.com', 'ccgslb.net', 'lxdns.com', 'lxcdn.com', 'fastweb.com.cn', 'fastcdn.com',
    'cloudglb.com', 'cloudgslb.com', 'GEOIP,CN', 'GEOIP,PRIVATE',
  ]],
];

// 终结规则。来源里是 MATCH,Default Proxy；这里指向模板自带的兜底组，
// 它的默认选中项是直连（要让未匹配流量走代理，就改 src/config.js 里那个组的顺序）。
const BUILTIN_FINAL = 'MATCH,🐟 漏网之鱼';

/**
 * 展开成 Clash 规则数组。
 * 条目不含逗号时按域后缀处理，含逗号时视为完整规则。
 * 去重按展开后的整条规则做——来源配置里有整整两段重复的 AI/学术规则。
 */
function gen_builtin_rules() {
  const out = [];
  const seen = new Set();
  for (const [group, items] of BUILTIN_TABLE) {
    for (const item of items) {
      const rule = item.includes(',') ? item + ',' + group : 'DOMAIN-SUFFIX,' + item + ',' + group;
      if (seen.has(rule)) continue;
      seen.add(rule);
      out.push(rule);
    }
  }
  out.push(BUILTIN_FINAL);
  return out;
}

export { gen_builtin_rules };

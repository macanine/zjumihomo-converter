// 模块级共享状态。

const key_default = "sub";
const udp_default = true;
const tfo_default = false;

// 拉订阅链接时固定用的 UA。
//
// 机场普遍按 UA 区分返回内容，之前转发客户端自己的 UA 有两个问题：同一个
// isolate 里它会被后续请求读到（跨请求串味），而且客户端五花八门——用浏览器
// UA 时有些面板会当成浏览器访问，回一份 HTML 首页而不是订阅。
// 这里对齐真实 Clash Verge 的写法（clash-verge-rev 的 utils/network.rs：
// `clash-verge/v{版本}`），版本号只是让它看起来真实，机场一般只认前缀。
const sub_ua = 'clash-verge/v2.5.5';

export { key_default, udp_default, tfo_default, sub_ua };

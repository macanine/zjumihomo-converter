// 模块级共享状态。
//
// 注意 ua_default：它是可变的、由请求写入的，在同一个 isolate 内会被后续请求读到。
// 这里用 getter/setter 把这层共享显式化，但没有改变原有语义。

const key_default = "sub";
const udp_default = true;
const tfo_default = false;

let ua_default = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

function get_ua_default() {
  return ua_default;
}

function set_ua_default(ua) {
  ua_default = ua;
}

export { key_default, udp_default, tfo_default, get_ua_default, set_ua_default };

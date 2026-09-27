// 节点名称的 emoji 统一在这里处理，避免不同协议或上游格式各自实现一套规则。
const TAIWAN_FLAG = /🇹🇼/gu;
const ANY_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D/gu;

function normalize_node_emoji(name, mode = '1') {
  if (typeof name !== 'string') return name;
  if (mode === '0') return name.replace(ANY_EMOJI, '').replace(/\s{2,}/g, ' ').trim();
  if (mode === '1' || mode === undefined || mode === '') return name.replace(TAIWAN_FLAG, '🇨🇳');
  return name;
}

export { normalize_node_emoji };

// 玩家策略（無頭模擬用）：決定奏摺時如何選項。
// choose(options, ctx) 回傳選中的 option；回傳 null 或 undefined 時退回預設的種子隨機選擇，
// 因此預設路徑（不傳 choose）與稽核輸出完全不變。
// ctx: { state, event, seed, year, month }。

const sumEffect = (option, keys) => keys.reduce((s, k) => s + (Number(option.effects?.[k]) || 0), 0);

// 國庫優先：取國庫效果最大且為正的選項；無正向者退回預設。
export function greedyChoose(options) {
  let best = null;
  let bestVal = 0;
  for (const o of options) {
    const v = Number(o.effects?.treasury) || 0;
    if (v > bestVal) { best = o; bestVal = v; }
  }
  return best;
}

// 暴政：取仁德 / 民心效果為負、且負值最大的選項；無負向者退回預設。
export function tyrantChoose(options) {
  let best = null;
  let bestVal = 0;
  for (const o of options) {
    const v = sumEffect(o, ['benevolence', 'people']);
    if (v < bestVal) { best = o; bestVal = v; }
  }
  return best;
}

export const STRATEGY_PROFILES = Object.freeze({
  default: null,
  greedy: greedyChoose,
  tyrant: tyrantChoose,
});

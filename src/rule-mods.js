// 祖訓／詔令修正（玩法深度擴充基礎）。
//
// state.edicts 以規則 key 為鍵，值為 { add, mul }：修正後數值 = (base + add) * mul，
// 缺漏的欄位視為 add: 0、mul: 1。本階段尚無任何祖訓寫入 edicts，故任何 key 皆回傳 base。
// 純函式：不讀取 rng、不修改 state。

export function ruleMod(state, key, base) {
  const e = state?.edicts?.[key];
  if (!e || typeof e !== 'object') return base;
  const add = Number.isFinite(e.add) ? e.add : 0;
  const mul = Number.isFinite(e.mul) ? e.mul : 1;
  return (base + add) * mul;
}

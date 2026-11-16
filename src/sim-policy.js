// 模擬玩家策略（玩法深度擴充；時段行動建模）。
//
// 策略物件：{ id, participates }。
//   defaultSimPolicy()：'slots'，參與時段行動——每月午後選一項、夜間選一項（各耗 1 行動，見 slots.js）。
//     選擇為均勻隨機，以 makeRng([seed, 年, 月, 'slot', 時段]) 擲骰，不消耗既有亂數流。
//   nonePolicy()：'none'，不參與任何新系統，applySimPolicy 原樣回傳且不呼叫 rng（對照用）。

import { makeRng } from './rng.js';
import { SLOTS, PERIOD_QUOTA, ensureAgency } from './slots.js';
import { takeSlot } from './slot-effects.js';

export function defaultSimPolicy() {
  return { id: 'slots', participates: true };
}

export function nonePolicy() {
  return { id: 'none', participates: false };
}

// 月內每時段：依配額選擇（配額為 0 的時段不選）。ctx 需含 seed、year、month。
export function applySimPolicy(state, policy = defaultSimPolicy(), ctx = {}) {
  if (!policy || !policy.participates) return state;
  if (state.alive === false) return state;
  const { seed, year, month } = ctx;
  ensureAgency(state);
  for (const slotName of Object.keys(PERIOD_QUOTA)) {
    const opts = SLOTS[slotName].opts;
    const pick = makeRng([seed, year, month, 'slot', slotName])();
    const choice = opts[Math.floor(pick * opts.length)][0];
    takeSlot(state, slotName, choice); // 配額不足時 spendSlot 自行拒絕，狀態不變
  }
  return state;
}

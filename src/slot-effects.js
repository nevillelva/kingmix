// 時段行動的實際效果（每個選項一次消耗 1 行動，見 slots.js）。
//
// 效果皆為確定性規則，不消耗任何既有亂數流；僅在 takeSlot 時套用一次。
// 模擬（sim-policy.js）與網頁（render-actions.js onSlot）共用 takeSlot，確保兩者結果一致。
//
// 效果表（設計：小幅、不改變健康，以免牽動健康門檻事件；數值經稽核與可達性測試確認）：
//   午後 audience  召見大臣：在朝大臣中忠誠最低者 +AUDIENCE_LOYALTY（同分取 id 較小者）
//   午後 review    校閱軍務：皇帝軍事 +REVIEW_MILITARY（國家軍備 armament 不受影響）
//   午後 garden    幸御花園：魅力 +GARDEN_CHARM
//   夜間 harem     後宮    ：魅力 +HAREM_CHARM（不加健康：健康為 E571 等事件的觸發門檻）
//   夜間 dc        東廠密報：皇權 +DC_POWER

import { setStat } from './state.js';
import { isCourtOfficial } from './officials.js';
import { spendSlot } from './slots.js';

export const AUDIENCE_LOYALTY = 2;
export const REVIEW_MILITARY = 2;
export const GARDEN_CHARM = 2;
export const HAREM_CHARM = 1;
export const DC_POWER = 2;

// 套用某時段選項的效果（不檢查、不記帳）。未知選項不做任何事。
export function applySlotEffect(state, slotName, choiceKey) {
  if (choiceKey === 'audience') {
    const courtiers = state.officials.filter((o) => isCourtOfficial(o) && o.alive !== false);
    if (!courtiers.length) return;
    const target = [...courtiers].sort((a, b) => (a.loyalty - b.loyalty) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    target.loyalty = Math.min(100, target.loyalty + AUDIENCE_LOYALTY);
  } else if (choiceKey === 'review') {
    setStat(state, 'military', state.stats.military + REVIEW_MILITARY, { silent: true });
  } else if (choiceKey === 'garden') {
    setStat(state, 'charm', state.stats.charm + GARDEN_CHARM, { silent: true });
  } else if (choiceKey === 'harem') {
    setStat(state, 'charm', state.stats.charm + HAREM_CHARM, { silent: true });
  } else if (choiceKey === 'dc') {
    setStat(state, 'power', state.stats.power + DC_POWER, { silent: true });
  }
  void slotName;
}

// 記帳並套用效果：通過 spendSlot 才生效。回傳 spendSlot 的結果。
export function takeSlot(state, slotName, choiceKey) {
  const r = spendSlot(state, slotName, choiceKey);
  if (r.ok) applySlotEffect(state, slotName, choiceKey);
  return r;
}

// 時段選項設定（僅介面，不改引擎）。
// 午後：三選一（召見大臣、校閱軍務、幸御花園），皆為既有分頁或朝政行動面板的入口。
// 夜間：二選一（後宮、東廠密報）。「休息」不是卡片選項：未選即為「本夜不採取行動」，
// 不耗行動、不產生效果，故不列為選項。

export const SLOTS = Object.freeze({
  afternoon: Object.freeze({ name: '午後', pick: '三選一', opts: Object.freeze([
    Object.freeze(['audience', '召見大臣', '前往朝臣，面見在朝諸臣', { tab: 'officials' }]),
    Object.freeze(['review', '校閱軍務', '開啟朝政行動的外交面板（宣戰、結盟）', { panel: 'diplo' }]),
    Object.freeze(['garden', '幸御花園', '前往後宮，見諸嬪妃', { tab: 'harem' }]),
  ]) }),
  night: Object.freeze({ name: '夜間', pick: '二選一', note: '本夜不採取行動：不選即是休息，不耗行動，不產生效果。', opts: Object.freeze([
    Object.freeze(['harem', '後宮', '前往後宮，安排侍寢與嬪妃', { tab: 'harem' }]),
    Object.freeze(['dc', '東廠密報', '前往東廠，閱覽密報與案件', { tab: 'dc' }]),
  ]) }),
});

// ── 時段行動成本（引擎端；web/index.html 尚未接線，見 docs/design/slot-cost.md）──
// 每月行動上限，與 web/index.html 的 ACTION_LIMIT 相同（兩處須同步）。
export const ACTION_LIMIT = 2;
// 總開關：false 時所有時段選項成本為 0，行為等同舊版（僅為分頁捷徑）。
export const SLOT_COST_ENABLED = true;
// 每個時段選項的預設成本（整數行動數）。
const DEFAULT_SLOT_COST = 1;

// 回傳選擇某時段某選項所需的行動數（整數，≥0）。未知時段或選項視為 0。
export function slotCost(slotName, choiceKey) {
  if (!SLOT_COST_ENABLED) return 0;
  const s = SLOTS[slotName];
  if (!s || !s.opts.some((o) => o[0] === choiceKey)) return 0;
  return DEFAULT_SLOT_COST;
}

// 純函式：目前已用行動 usedActions 下，能否再選此時段（以首個選項的成本判定，
// 夜間與午後的預設成本相同）。state 僅用於排除已結束的局（state.alive === false）。
export function canTakeSlot(state, slotName, usedActions) {
  if (state && state.alive === false) return false;
  const s = SLOTS[slotName];
  if (!s) return false;
  const cost = slotCost(slotName, s.opts[0][0]);
  return usedActions + cost <= ACTION_LIMIT;
}

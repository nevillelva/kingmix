// 時段選項設定，並為引擎端的時段行動配額（每月 ACTION_LIMIT 次，依時段分配）。
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

// ── 時段行動配額（引擎端；web/ui/render-actions.js 經由此處讀寫，不另存一套）──
// 每月行動上限，與 web 的 ACTION_LIMIT 相同（兩處須同步）。朝政行動與時段選項共用此總額。
export const ACTION_LIMIT = 2;
// 總開關：false 時所有時段選項成本為 0，行為等同舊版（僅為分頁捷徑）。
export const SLOT_COST_ENABLED = true;
// 每個時段選項的預設成本（整數行動數）。
const DEFAULT_SLOT_COST = 1;
// 每月各時段可消耗的行動上限（依時段分配）。晨朝奏摺不耗行動。
// 午後與夜間各 1，合計恰為 ACTION_LIMIT：每月的兩次行動，午後一次、夜間一次。
export const PERIOD_QUOTA = Object.freeze({ afternoon: 1, night: 1 });

// 回傳選擇某時段某選項所需的行動數（整數，≥0）。未知時段或選項視為 0。
export function slotCost(slotName, choiceKey) {
  if (!SLOT_COST_ENABLED) return 0;
  const s = SLOTS[slotName];
  if (!s || !s.opts.some((o) => o[0] === choiceKey)) return 0;
  return DEFAULT_SLOT_COST;
}

const bucketKey = (state) => `${state.year}-${state.month}`;
const freshPeriods = () => Object.fromEntries(Object.keys(PERIOD_QUOTA).map((k) => [k, 0]));

// 確保本月的行動桶存在（state.agency，依年月分桶）。跨月時重建；桶內其他欄位（如派系施壓旗標）
// 隨月重置。不同月份的舊桶不會被沿用。回傳該桶（就地修改 state）。
export function ensureAgency(state) {
  const key = bucketKey(state);
  const a = state.agency;
  if (!a || a.key !== key) {
    state.agency = { key, used: 0, periods: freshPeriods() };
  } else if (!a.periods) {
    a.periods = freshPeriods();
  }
  return state.agency;
}

// 本月某時段已消耗的行動數（僅計當月桶；桶不屬本月則為 0）。
export function periodSpent(state, slotName) {
  if (!state) return 0;
  const a = state.agency;
  if (!a || a.key !== bucketKey(state)) return 0;
  return a.periods?.[slotName] || 0;
}

// 本月某時段尚可消耗的行動數（不含全月總額的限制）。
export function periodLeft(state, slotName) {
  return Math.max(0, (PERIOD_QUOTA[slotName] ?? 0) - periodSpent(state, slotName));
}

// 純函式：目前已用行動 usedActions 下，能否再選此時段（以首個選項的成本判定，
// 夜間與午後的預設成本相同）。同時受全月總額與該時段配額限制。
// state 用於排除已結束的局（state.alive === false）與讀取本月時段用量；不修改 state。
export function canTakeSlot(state, slotName, usedActions) {
  if (state && state.alive === false) return false;
  const s = SLOTS[slotName];
  if (!s) return false;
  const cost = slotCost(slotName, s.opts[0][0]);
  if (usedActions + cost > ACTION_LIMIT) return false;
  const quota = PERIOD_QUOTA[slotName];
  if (quota === undefined) return true;
  return periodSpent(state, slotName) + cost <= quota;
}

// 消耗行動選擇時段選項：通過 canTakeSlot 才記帳（總額與該時段用量同時增加）。
// 回傳 { ok, cost }；未知時段或選項一律不記帳。
export function spendSlot(state, slotName, choiceKey) {
  const s = SLOTS[slotName];
  if (!s || !s.opts.some((o) => o[0] === choiceKey)) return { ok: false, cost: 0 };
  const a = ensureAgency(state);
  if (!canTakeSlot(state, slotName, a.used)) return { ok: false, cost: 0 };
  const cost = slotCost(slotName, choiceKey);
  a.used += cost;
  a.periods[slotName] = (a.periods[slotName] || 0) + cost;
  return { ok: true, cost };
}

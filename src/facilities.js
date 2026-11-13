// 宮城內庫與設施：御花園、太醫院、翰林院，各三級。
// upgradeFacility 為純函式（不改動輸入）；facilityMonthlyEffects 只回傳效果，
// 由呼叫端決定何時套用（見 applyFacilityMonthly 與 docs 註記）。
// 設施等級存於 state.facilities（缺欄位視為全部 0 級），不影響既有欄位。

import { setStat } from './state.js';

export const FACILITY_IDS = Object.freeze(['garden', 'medical', 'academy']);
export const FACILITY_MAX_LEVEL = 3;

// 各設施定義：每級的建造成本（國庫）與累積之每月屬性加成（level 1..3）。
export const FACILITIES = Object.freeze({
  garden: Object.freeze({
    id: 'garden', name: '御花園', stat: 'charm',
    levels: Object.freeze([
      Object.freeze({ cost: 80, monthly: 1 }),
      Object.freeze({ cost: 160, monthly: 2 }),
      Object.freeze({ cost: 300, monthly: 3 }),
    ]),
  }),
  medical: Object.freeze({
    id: 'medical', name: '太醫院', stat: 'health',
    levels: Object.freeze([
      Object.freeze({ cost: 60, monthly: 0.2 }),
      Object.freeze({ cost: 120, monthly: 0.4 }),
      Object.freeze({ cost: 200, monthly: 0.6 }),
    ]),
  }),
  academy: Object.freeze({
    id: 'academy', name: '翰林院', stat: 'literature',
    levels: Object.freeze([
      Object.freeze({ cost: 100, monthly: 0.5 }),
      Object.freeze({ cost: 180, monthly: 1 }),
      Object.freeze({ cost: 280, monthly: 1.5 }),
    ]),
  }),
});

const levelOf = (state, id) => {
  const v = state.facilities?.[id];
  return Number.isInteger(v) && v >= 0 ? Math.min(v, FACILITY_MAX_LEVEL) : 0;
};

// 目前各設施等級（回傳新物件）。
export function facilityLevels(state) {
  return Object.fromEntries(FACILITY_IDS.map((id) => [id, levelOf(state, id)]));
}

// 升級：回傳新狀態；失敗時回傳 { error, ... } 物件，且絕不改動輸入。
export function upgradeFacility(state, id) {
  const def = FACILITIES[id];
  if (!def) return { error: 'unknown_facility', id };
  const level = levelOf(state, id);
  if (level >= FACILITY_MAX_LEVEL) return { error: 'max_level', id, level };
  const cost = def.levels[level].cost;
  const treasury = state.stats.treasury;
  if (treasury < cost) return { error: 'insufficient_treasury', id, cost, treasury };

  const next = structuredClone(state);
  setStat(next, 'treasury', treasury - cost);
  next.facilities = { ...facilityLevels(state), [id]: level + 1 };
  return next;
}

// 每月效果清單：依目前等級回傳 [{ facility, stat, amount }]，等級 0 不產生效果。
export function facilityMonthlyEffects(state) {
  const out = [];
  for (const id of FACILITY_IDS) {
    const level = levelOf(state, id);
    if (level === 0) continue;
    const def = FACILITIES[id];
    out.push({ facility: id, stat: def.stat, amount: def.levels[level - 1].monthly });
  }
  return out;
}

// 便利函式（選用）：將 facilityMonthlyEffects 套入狀態（就地修改，與 monthlyTick 相同風格）。
export function applyFacilityMonthly(state) {
  for (const e of facilityMonthlyEffects(state)) {
    setStat(state, e.stat, state.stats[e.stat] + e.amount, { silent: true });
  }
  return state;
}

// 宮城內庫與設施：御花園、太醫院、武庫、翻書院、翰林院，各三級。
// upgradeFacility 為即時升級（純函式，不改動輸入，保留既有行為）；
// buildFacility 則以興建工期進行（支付銀兩後，工期以月計，由 advanceConstruction 每月推進）。
// facilityMonthlyEffects 只回傳效果，由呼叫端決定何時套用（見 applyFacilityMonthly）。
// 設施等級存於 state.facilities（缺欄位視為全部 0 級）；興建中資料存於 state.construction。

import { setStat } from './state.js';

// 既有 id 維持不變：翰林院的 id 為 'academy'；'hanlin' 為別名，會正規化為 'academy'。
export const FACILITY_IDS = Object.freeze(['garden', 'medical', 'armory', 'library', 'academy']);
export const FACILITY_ALIASES = Object.freeze({ hanlin: 'academy' });
export const FACILITY_MAX_LEVEL = 3;

// 各設施定義：每級的建造成本（國庫，即銀兩）、累積之每月屬性加成、興建工期（月）。
export const FACILITIES = Object.freeze({
  garden: Object.freeze({
    id: 'garden', name: '御花園', stat: 'charm',
    levels: Object.freeze([
      Object.freeze({ cost: 80, monthly: 1, months: 2 }),
      Object.freeze({ cost: 160, monthly: 2, months: 3 }),
      Object.freeze({ cost: 300, monthly: 3, months: 4 }),
    ]),
  }),
  medical: Object.freeze({
    id: 'medical', name: '太醫院', stat: 'health',
    levels: Object.freeze([
      Object.freeze({ cost: 60, monthly: 0.2, months: 2 }),
      Object.freeze({ cost: 120, monthly: 0.4, months: 2 }),
      Object.freeze({ cost: 200, monthly: 0.6, months: 3 }),
    ]),
  }),
  armory: Object.freeze({
    id: 'armory', name: '武庫', stat: 'military',
    levels: Object.freeze([
      Object.freeze({ cost: 90, monthly: 0.8, months: 2 }),
      Object.freeze({ cost: 170, monthly: 1.6, months: 3 }),
      Object.freeze({ cost: 260, monthly: 2.5, months: 4 }),
    ]),
  }),
  library: Object.freeze({
    id: 'library', name: '翻書院', stat: 'literature',
    levels: Object.freeze([
      Object.freeze({ cost: 100, monthly: 0.6, months: 3 }),
      Object.freeze({ cost: 190, monthly: 1.2, months: 3 }),
      Object.freeze({ cost: 300, monthly: 2, months: 4 }),
    ]),
  }),
  academy: Object.freeze({
    id: 'academy', name: '翰林院', stat: 'literature',
    levels: Object.freeze([
      Object.freeze({ cost: 100, monthly: 0.5, months: 3 }),
      Object.freeze({ cost: 180, monthly: 1, months: 3 }),
      Object.freeze({ cost: 280, monthly: 1.5, months: 4 }),
    ]),
  }),
});

// 將別名正規化為正式 id；未知 id 原樣回傳（由各函式回報 unknown_facility）。
export const resolveFacilityId = (id) => FACILITY_ALIASES[id] ?? id;

const levelOf = (state, id) => {
  const v = state.facilities?.[resolveFacilityId(id)];
  return Number.isInteger(v) && v >= 0 ? Math.min(v, FACILITY_MAX_LEVEL) : 0;
};

// 目前各設施等級（回傳新物件）。
export function facilityLevels(state) {
  return Object.fromEntries(FACILITY_IDS.map((id) => [id, levelOf(state, id)]));
}

// 興建中的設施：{ [id]: { target, monthsLeft } }（回傳新物件）。
export function constructionOf(state) {
  return structuredClone(state.construction ?? {});
}

// 升級（即時）：回傳新狀態；失敗時回傳 { error, ... } 物件，且絕不改動輸入。
export function upgradeFacility(state, id) {
  const fid = resolveFacilityId(id);
  const def = FACILITIES[fid];
  if (!def) return { error: 'unknown_facility', id };
  const level = levelOf(state, fid);
  if (level >= FACILITY_MAX_LEVEL) return { error: 'max_level', id: fid, level };
  const cost = def.levels[level].cost;
  const treasury = state.stats.treasury;
  if (treasury < cost) return { error: 'insufficient_treasury', id: fid, cost, treasury };

  const next = structuredClone(state);
  setStat(next, 'treasury', treasury - cost);
  next.facilities = { ...facilityLevels(state), [fid]: level + 1 };
  return next;
}

// 興建（有工期）：支付下一級成本並開工，回傳 { state, ok, reason }。
// 失敗時 state 為原輸入（未改動），reason 為 unknown_facility / in_progress / max_level / insufficient_treasury。
export function buildFacility(state, id) {
  const fid = resolveFacilityId(id);
  const def = FACILITIES[fid];
  const fail = (reason) => ({ state, ok: false, reason });
  if (!def) return fail('unknown_facility');
  if (constructionOf(state)[fid]) return fail('in_progress');
  const level = levelOf(state, fid);
  if (level >= FACILITY_MAX_LEVEL) return fail('max_level');
  const { cost, months } = def.levels[level];
  const treasury = state.stats.treasury;
  if (treasury < cost) return fail('insufficient_treasury');

  const next = structuredClone(state);
  setStat(next, 'treasury', treasury - cost);
  next.construction = { ...constructionOf(state), [fid]: { target: level + 1, monthsLeft: months } };
  return { state: next, ok: true, reason: null };
}

// 每月推進興建工期（就地修改，與 monthlyTick 相同風格）。工期滿則設為新等級，
// 記錄 state.facilityDone[id]（供紅點）與 state.flags[`facility_${id}_${level}`]（供事件條件）。
export function advanceConstruction(state) {
  if (!state.construction) return state;
  for (const id of Object.keys(state.construction)) {
    const job = state.construction[id];
    job.monthsLeft -= 1;
    if (job.monthsLeft > 0) continue;
    state.facilities = { ...facilityLevels(state), [id]: job.target };
    state.flags = state.flags ?? {};
    state.flags[`facility_${id}_${job.target}`] = true;
    state.facilityDone = { ...(state.facilityDone ?? {}), [id]: true };
    delete state.construction[id];
  }
  return state;
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

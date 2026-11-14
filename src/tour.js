// 全國輿圖與巡幸：皇帝可巡幸六府（府）。每府有城防（city.js 的 defense）與民心（morale，本模組新增）。
// 巡幸耗費國庫並需時間：抵達後數月內不得再行巡幸。地方事件（data/events-tour.json）以 at_prefecture 條件限定所在府。
//
// 新增的存檔欄位（皆懶初始化，舊存檔相容；save.js 直接序列化整個 state，無須修改）：
//   state.location              所在府 id，未設定時為京兆府
//   state.tour.busyUntil        巡幸抵達的月索引（(year-1)*12+(month-1)），未設定時為 -1
//   state.prefectures[].morale  府民心（0–100），未設定時為 MORALE_INIT
//   state.prefectures[].visited 是否曾巡幸過

import { PREFECTURE_DEFS } from './economy.js';
import { ensureCity } from './city.js';
import { setStat } from './state.js';
import { CAPITAL_PREFECTURE } from './events.js';

// 六府的地圖座標（0–100，左上為原點）。
const MAP_POINTS = Object.freeze({
  jingzhao: { x: 38, y: 42 },
  hedong: { x: 46, y: 34 },
  yizhou: { x: 18, y: 62 },
  jiangning: { x: 78, y: 62 },
  yangzhou: { x: 72, y: 48 },
  denglai: { x: 84, y: 30 },
});

export const PREFECTURES = Object.freeze(
  PREFECTURE_DEFS.map((d) => Object.freeze({ id: d.id, name: d.name, x: MAP_POINTS[d.id].x, y: MAP_POINTS[d.id].y })),
);

// 各府的地方事件 id（與 data/events-tour.json 的 at_prefecture 條件一致，測試會檢查）。
export const PREFECTURE_EVENTS = Object.freeze({
  jingzhao: Object.freeze(['E547', 'E548', 'E549']),
  hedong: Object.freeze(['E550', 'E551', 'E552']),
  yizhou: Object.freeze(['E553', 'E554', 'E555']),
  jiangning: Object.freeze(['E556', 'E557', 'E558']),
  yangzhou: Object.freeze(['E559', 'E560', 'E561']),
  denglai: Object.freeze(['E562', 'E563', 'E564']),
});

export const TOUR_COST = 5; // 國庫：每次巡幸的沿途費用
export const TOUR_BUSY_MONTHS = 3; // 抵達前（與抵達後的整頓）不得再行巡幸的月數
export const TOUR_MORALE_GAIN = 8; // 所至府民心增益
export const TOUR_DEFENSE_GAIN = 2; // 所至府城防增益（巡視修葺）
export const TOUR_PEOPLE_GAIN = 1; // 全國民心增益（天子親臨）
export const MORALE_INIT = 50;
export const MORALE_MAX = 100;

const monthIndex = (state) => (state.year - 1) * 12 + (state.month - 1);

// 懶初始化：補上所在府、巡幸紀錄、各府民心與巡訪紀錄。回傳州府陣列（含城防）。
export function ensureTour(state) {
  if (state.location === undefined) state.location = CAPITAL_PREFECTURE;
  if (!state.tour) state.tour = { busyUntil: -1 };
  for (const pref of ensureCity(state)) {
    if (pref.morale === undefined) pref.morale = MORALE_INIT;
    if (pref.visited === undefined) pref.visited = false;
  }
  return state.prefectures;
}

export function currentLocation(state) {
  return state.location ?? CAPITAL_PREFECTURE;
}

// 巡幸至某府。回傳 { state, ok, reason }；reason 為 unknown / here / busy / treasury 時 ok 為 false。
export function tourTo(state, prefectureId) {
  ensureTour(state);
  if (!PREFECTURES.some((p) => p.id === prefectureId)) return { state, ok: false, reason: 'unknown' };
  if (prefectureId === currentLocation(state)) return { state, ok: false, reason: 'here' };
  if (state.tour.busyUntil > monthIndex(state)) return { state, ok: false, reason: 'busy' };
  if (state.stats.treasury < TOUR_COST) return { state, ok: false, reason: 'treasury' };

  setStat(state, 'treasury', state.stats.treasury - TOUR_COST);
  setStat(state, 'people', state.stats.people + TOUR_PEOPLE_GAIN);
  const pref = ensureCity(state).find((p) => p.id === prefectureId);
  pref.morale = Math.min(MORALE_MAX, pref.morale + TOUR_MORALE_GAIN);
  pref.defense = Math.min(100, pref.defense + TOUR_DEFENSE_GAIN);
  pref.visited = true;
  state.location = prefectureId;
  state.tour.busyUntil = monthIndex(state) + TOUR_BUSY_MONTHS;
  return { state, ok: true, reason: null };
}

// 所在府可能發生的地方事件 id（僅依所在府篩選；條件判斷仍由 events.js 的 isEligible 負責）。
export function tourEvents(state) {
  return [...(PREFECTURE_EVENTS[currentLocation(state)] ?? [])];
}

// 各府狀態：城防、民心、是否曾巡幸。
export function prefectureStatus(state) {
  ensureTour(state);
  return ensureCity(state).map((p) => ({
    id: p.id,
    name: p.name,
    defense: Math.round(p.defense),
    morale: Math.round(p.morale),
    visited: p.visited,
  }));
}

// 城池與工匠：六州府各有城防（defense，0–100）。工部匠作（工部尚書的智）修繕城池，
// 耗國庫、提升該府城防與民心；城防每月自然風化。城防影響征戰中的「堅守」戰力。
// 州府本身（知府、產業性質、稅制）定義於 economy.js，此處只新增城防欄位，懶初始化。

import { setStat } from './state.js';
import { ensureEconomy } from './economy.js';
import { officeHolder } from './offices.js';

export const CITY_DEFENSE_INIT = 50;
export const CITY_DEFENSE_MAX = 100;
export const CITY_DECAY = 0.3; // 每月風化
export const REPAIR_COST = 30; // 國庫
export const REPAIR_BASE = 12; // 無工部尚書時的基礎修繕量
export const REPAIR_PEOPLE = 1; // 民心
export const DEFENSE_HOLD_SCALE = 500; // 堅守戰力倍率 = 1 + (平均城防 − 50) / 500，範圍 0.9–1.1

// 懶初始化：為每府補上城防欄位（不改動 createInitialState）。回傳州府陣列。
export function ensureCity(state) {
  ensureEconomy(state);
  for (const pref of state.prefectures) {
    if (pref.defense === undefined) {
      pref.defense = CITY_DEFENSE_INIT;
      pref.repairedYear = null;
    }
  }
  return state.prefectures;
}

export function cityOf(state, prefId) {
  return ensureCity(state).find((p) => p.id === prefId) ?? null;
}

// 修繕一府城池：每府每年限一次；耗國庫，城防提升（工部尚書智越高越多），民心 +1。
export function repairCity(state, prefId) {
  const pref = cityOf(state, prefId);
  if (!pref) return { ok: false, reason: 'unknown' };
  if (pref.repairedYear === state.year) return { ok: false, reason: 'cooldown' };
  if (state.stats.treasury < REPAIR_COST) return { ok: false, reason: 'treasury' };

  const works = officeHolder(state, 'works');
  const gain = REPAIR_BASE + (works ? works.abilities.intellect / 10 : 0);
  setStat(state, 'treasury', state.stats.treasury - REPAIR_COST);
  pref.defense = Math.min(CITY_DEFENSE_MAX, pref.defense + gain);
  pref.repairedYear = state.year;
  setStat(state, 'people', state.stats.people + REPAIR_PEOPLE);
  return { ok: true, gain: Math.round(gain * 10) / 10, defense: Math.round(pref.defense) };
}

// 月結：全府城防風化（下限 0）。
export function tickCity(state) {
  for (const pref of ensureCity(state)) {
    pref.defense = Math.max(0, pref.defense - CITY_DECAY);
  }
  return state;
}

export function averageDefense(state) {
  const prefs = ensureCity(state);
  return prefs.reduce((sum, p) => sum + p.defense, 0) / prefs.length;
}

// 堅守戰力倍率：全國平均城防高於 50 則加成，低於則減弱；預設城防下恰為 1。
export function defenseHoldMultiplier(state) {
  return 1 + (averageDefense(state) - CITY_DEFENSE_INIT) / DEFENSE_HOLD_SCALE;
}

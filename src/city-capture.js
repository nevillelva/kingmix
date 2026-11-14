// 攻城與佔點：玩家於輿圖上主動發兵攻打「可攻」的州府，成敗由軍備與兵力推算的機率決定。
// 只能由玩家操作觸發（attackCity），自動模擬不會呼叫本模組，故不影響 runSimulation 的輸出。
//
// 可攻條件：州府處於叛亂（rebel）或敵方佔領（occupied）狀態。
// - 叛亂：府民心連續 REBEL_MONTHS 個月低於 REBEL_MORALE，於月結（tickRebellion）進入叛亂；攻城成功後解除。
// - 敵方佔領：戰敗且戰事明確屬於某府（war.js 的 resolveWar，spec.prefecture），於戰敗當下標記（markOccupied）；攻回後恢復。
// 民心每月自然衰減（MORALE_DECAY），使民心低落的府能於長局中自然走向叛亂。
//
// 新增的存檔欄位（懶初始化，舊存檔相容；預設值見 city.js ensureCity、tour.js ensureTour）：
//   state.prefectures[].morale       府民心（tour.js）
//   state.prefectures[].rebelMonths  民心低於門檻的連續月數
//   state.prefectures[].rebel        是否叛亂
//   state.prefectures[].occupied     是否遭敵方佔領
//   state.prefectures[].captureYear  本府最近一次攻城的年份（每府每年限攻一次）
//   state.prefectures[].siegeYear    攻城失利後，圍城中的年份（同年於輿圖標示）
//   state.chronicle 中 kind 為 'city_capture' / 'rebellion' / 'occupation' 的史冊紀錄
//
// 叛亂與佔領皆無隨機擲骰（純門檻與戰敗事件）；攻城擲骰仍為 makeRng([seed, year, month, 'city-capture', 府 id])。

import { makeRng } from './rng.js';
import { setStat } from './state.js';
import { ensureCity } from './city.js';
import { nominalStrength } from './war.js';
import { PREFECTURE_DEFS } from './economy.js';
import { MORALE_INIT } from './tour.js';

export const REBEL_MORALE = 30; // 府民心低於此值計為民心不安
export const REBEL_MONTHS = 6; // 連續低於 REBEL_MORALE 的月數，達到即進入叛亂
export const MORALE_DECAY = 0.4; // 府民心每月自然衰減
export const CAPTURE_MIN = 0.15; // 成功機率下限
export const CAPTURE_MAX = 0.85; // 成功機率上限
export const GARRISON_PER_DEFENSE = 3; // 守軍戰力 = 城防 × 此係數
export const CAPTURE_TREASURY = 60; // 佔領成功：國庫收入
export const CAPTURE_MORALE_GAIN = 8; // 佔領成功：該府民心增益（至少回到 REBEL_MORALE）
export const FAIL_ARMAMENT_LOSS = 40; // 攻城失利：軍備損耗
export const FAIL_MILITARY_LOSS = 6; // 攻城失利：兵力折損

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 懶初始化：為每府補上攻城紀錄欄位。回傳州府陣列。
export function ensureCapture(state) {
  for (const pref of ensureCity(state)) {
    if (pref.morale === undefined) pref.morale = MORALE_INIT;
    if (pref.captureYear === undefined) pref.captureYear = null;
    if (pref.siegeYear === undefined) pref.siegeYear = null;
  }
  return state.prefectures;
}

// 州府是否處於叛亂或敵方佔領（可攻）。
export function isRebel(state, prefId) {
  const pref = ensureCapture(state).find((p) => p.id === prefId);
  return !!pref && (pref.rebel === true || pref.occupied === true);
}

// 月結：民心自然衰減；連續低於 REBEL_MORALE 達 REBEL_MONTHS 月者進入叛亂並寫入史冊。
// 每月僅由 monthlyTick 呼叫一次。已叛亂者維持叛亂，直到攻城成功。
export function tickRebellion(state) {
  for (const pref of ensureCapture(state)) {
    pref.morale = Math.max(0, pref.morale - MORALE_DECAY);
    pref.rebelMonths = pref.morale < REBEL_MORALE ? pref.rebelMonths + 1 : 0;
    if (!pref.rebel && pref.rebelMonths >= REBEL_MONTHS) {
      pref.rebel = true;
      const name = PREFECTURE_DEFS.find((d) => d.id === pref.id).name;
      state.chronicle.push({ kind: 'rebellion', prefecture: pref.id, prefectureName: name, year: state.year, month: state.month, text: rebellionText(name) });
    }
  }
  return state;
}

// 本年是否已攻過此府。
export function attackedThisYear(state, prefId) {
  const pref = ensureCapture(state).find((p) => p.id === prefId);
  return !!pref && pref.captureYear === state.year;
}

// 攻城中：本年攻城失利、尚在圍城（輿圖以虛線框標示）。
export function isBesieged(state, prefId) {
  const pref = ensureCapture(state).find((p) => p.id === prefId);
  return !!pref && pref.siegeYear === state.year;
}

// 成功機率：己方名目戰力 ÷（己方名目戰力 + 守軍戰力），夾在 CAPTURE_MIN–CAPTURE_MAX。
// 純函式，不擲骰。
export function captureChance(state, prefId) {
  const pref = ensureCapture(state).find((p) => p.id === prefId);
  const attack = nominalStrength(state);
  const garrison = (pref ? pref.defense : 0) * GARRISON_PER_DEFENSE;
  const raw = attack + garrison > 0 ? attack / (attack + garrison) : CAPTURE_MIN;
  return clamp(raw, CAPTURE_MIN, CAPTURE_MAX);
}

// 可否攻城：回傳 { ok, reason }。reason 為 unknown / not_rebel / cooldown 時 ok 為 false。
export function canAttackCity(state, prefId) {
  ensureCapture(state);
  const def = PREFECTURE_DEFS.find((d) => d.id === prefId);
  if (!def) return { ok: false, reason: 'unknown' };
  if (!isRebel(state, prefId)) return { ok: false, reason: 'not_rebel' };
  if (attackedThisYear(state, prefId)) return { ok: false, reason: 'cooldown' };
  return { ok: true, reason: null };
}

// 攻城。回傳 { ok, reason, won, chance, prefecture, text }。
// 失敗（不可攻）時狀態不變；可攻時一律記下本年攻城紀錄，成敗依確定性擲骰決定。
export function attackCity(state, prefId) {
  const check = canAttackCity(state, prefId);
  if (!check.ok) return { ok: false, reason: check.reason, won: false, chance: null, prefecture: prefId, text: null };

  const pref = ensureCapture(state).find((p) => p.id === prefId);
  const name = PREFECTURE_DEFS.find((d) => d.id === prefId).name;
  const chance = captureChance(state, prefId);
  const rng = makeRng([state.seed, state.year, state.month, 'city-capture', prefId]);
  const won = rng() < chance;

  pref.captureYear = state.year;
  if (won) {
    setStat(state, 'treasury', state.stats.treasury + CAPTURE_TREASURY);
    pref.morale = Math.min(100, Math.max(REBEL_MORALE, pref.morale + CAPTURE_MORALE_GAIN));
    pref.siegeYear = null;
    pref.rebel = false; // 攻城成功：叛亂或佔領皆解除
    pref.occupied = false;
    pref.rebelMonths = 0;
    state.chronicle.push({ kind: 'city_capture', prefecture: prefId, prefectureName: name, year: state.year, month: state.month });
    return { ok: true, reason: null, won: true, chance: Math.round(chance * 1000) / 1000, prefecture: prefId, text: captureText(name, true) };
  }
  setStat(state, 'armament', Math.max(0, state.stats.armament - FAIL_ARMAMENT_LOSS));
  setStat(state, 'military', Math.max(0, state.stats.military - FAIL_MILITARY_LOSS));
  pref.siegeYear = state.year;
  return { ok: true, reason: null, won: false, chance: Math.round(chance * 1000) / 1000, prefecture: prefId, text: captureText(name, false) };
}

// 叛亂進入時的史冊文字（40–80 字）。
export function rebellionText(name) {
  return `${name}民心渙散，連月不安，終至聚眾據城而起，成為叛亂之府。朝廷若欲收復，須遣兵攻城，方可平定此地。`;
}

// 單條說明文字（40–80 字）。
export function captureText(name, won) {
  if (won) {
    return `${name}守軍開城投降，皇帝親率王師入城，此府重歸掌握。國庫入帳一筆收入，該府民心稍安，事蹟已載入史冊。`;
  }
  return `${name}守軍固守城池，攻城未克。我軍折損軍備與兵力，此府狀態不變，本年圍城中，不得再攻。`;
}

// 輿圖用的攻城狀況：可攻與否、原因、機率與圍城標示。
export function captureStatus(state, prefId) {
  const pref = ensureCapture(state).find((p) => p.id === prefId);
  const check = canAttackCity(state, prefId);
  return {
    attackable: check.ok,
    reason: check.reason,
    besieged: isBesieged(state, prefId),
    rebel: !!pref && pref.rebel === true,
    occupied: !!pref && pref.occupied === true,
    chance: check.ok ? Math.round(captureChance(state, prefId) * 1000) / 1000 : null,
  };
}

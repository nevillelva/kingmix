// 後期壓力：知府割據、權臣坐大、天災連鎖。每月由 turn.js 的 monthlyTick 呼叫一次（tickLatePressure）。
//
// 設計原則：
// - 叛亂不減產（economy.js REBEL_YIELD_MULT = 1.0，依使用者決定）。叛亂的壓力改由下列機制呈現。
// - 全部為確定性規則（門檻與連續月數，天災以 makeRng([seed, 年, 月, 'late-disaster', 府 id]) 擲骰）。
// - 每條壓力都有出口：割據期滿知府歸順、權臣可由既有的派系打壓失勢、天災為短期衝擊，不會在一般玩法下必然失敗。
//
// 新增的存檔欄位（懶初始化，舊存檔相容）：
//   state.latePressure               { minister, ministerMonths, disasters }
//   state.prefectures[].defiantMonths 知府忠誠低於 DEFIANT_LOYALTY 的連續月數
//   state.prefectures[].autonomous    是否割據（知府離心，州府稅入只解送一半，見 economy.js AUTONOMY_REMIT）
//   state.prefectures[].autonomyMonths 割據已持續之月數（滿 AUTONOMY_MONTHS 即歸順）
//   state.chronicle 中 kind 為 'autonomy' / 'minister' / 'disaster' 的史冊紀錄

import { setStat } from './state.js';
import { makeRng } from './rng.js';
import { PREFECTURE_DEFS, governorOf } from './economy.js';
import { ensureCapture } from './city-capture.js';
import { isCourtOfficial } from './officials.js';
import { pushCapped } from './caps.js';

// --- 知府割據 ---
export const DEFIANT_LOYALTY = 10; // 知府忠誠低於此值計為離心
export const DEFIANT_MONTHS = 18; // 連續離心的月數，達到即割據
export const AUTONOMY_MONTHS = 24; // 割據持續月數，期滿知府歸順
export const AUTONOMY_SUBMIT_LOYALTY = 35; // 歸順時知府忠誠至少回到此值

// --- 權臣坐大 ---
export const MINISTER_FACTION = 55; // 派系勢力高於此值，視為權臣可能坐大
export const MINISTER_MONTHS = 12; // 連續高於門檻的月數，達到即出現權臣
export const MINISTER_LOYALTY = 40; // 權臣人選：忠誠低於此值
export const MINISTER_AMBITION = 50; // 權臣人選：野心不低於此值（取其中最高者）
export const MINISTER_END = 45; // 所屬派系勢力低於此值，權臣失勢
export const MINISTER_POWER_DRAIN = 0.15; // 權臣在朝，皇權每月流失
export const MINISTER_PEAK = 80; // 權臣增勢之上限（所屬派系不因權臣而超過此值）
export const MINISTER_FACTION_GAIN = 0.5; // 權臣在朝，所屬派系每月增勢（至 MINISTER_PEAK 為止）

// --- 天災連鎖 ---
export const DISASTER_BASE = 0.0005; // 每府每月基礎天災機率
export const DISASTER_WEAK_BONUS = 0.001; // 城防或民心低落時加成
export const DISASTER_DEFENSE_BELOW = 40;
export const DISASTER_MORALE_BELOW = 30;
export const DISASTER_UNREST_BONUS = 0.001; // 叛亂或割據之府加成
export const DISASTER_CHAIN_WINDOW = 3; // 連鎖回看的月數
export const DISASTER_CHAIN_GAIN = 0.5; // 回看期間每起天災，機率增 +50%
export const DISASTER_CHAIN_CAP = 2; // 連鎖計數上限（最多使機率倍增 +100%，避免自我加速）
export const DISASTER_MAX = 0.03; // 單府單月機率上限
export const DISASTER_DEFENSE_LOSS = 4; // 城防損失
export const DISASTER_MORALE_LOSS = 5; // 民心損失
export const DISASTER_LOG_CAP = 50; // latePressure.disasters 只保留最近 50 筆

const maxEntry = (obj) => Object.entries(obj).reduce((best, e) => (!best || e[1] > best[1] ? e : best), null);

// 懶初始化。回傳 latePressure 物件。
export function ensureLatePressure(state) {
  if (!state.latePressure) state.latePressure = { minister: null, ministerMonths: 0, disasters: [] };
  const lp = state.latePressure;
  if (lp.minister === undefined) lp.minister = null;
  if (lp.ministerMonths === undefined) lp.ministerMonths = 0;
  if (!Array.isArray(lp.disasters)) lp.disasters = [];
  for (const pref of ensureCapture(state)) {
    if (pref.defiantMonths === undefined) pref.defiantMonths = 0;
    if (pref.autonomous === undefined) pref.autonomous = false;
    if (pref.autonomyMonths === undefined) pref.autonomyMonths = 0;
  }
  return lp;
}

// 知府割據：知府離心達 DEFIANT_MONTHS 月即割據，持續 AUTONOMY_MONTHS 月後歸順（忠誠至少回到 AUTONOMY_SUBMIT_LOYALTY）。
// 割據期間不另外流失忠誠，以免割據成為永久狀態。州府無知府（缺位）時不計離心，亦不割據。
export function tickAutonomy(state) {
  ensureLatePressure(state);
  for (const pref of ensureCapture(state)) {
    const gov = governorOf(state, pref);
    if (!gov) { pref.defiantMonths = 0; pref.autonomous = false; pref.autonomyMonths = 0; continue; }
    if (pref.autonomous) {
      pref.autonomyMonths += 1;
      if (pref.autonomyMonths >= AUTONOMY_MONTHS) {
        pref.autonomous = false;
        pref.autonomyMonths = 0;
        pref.defiantMonths = 0;
        gov.loyalty = Math.max(gov.loyalty, AUTONOMY_SUBMIT_LOYALTY);
      }
      continue;
    }
    pref.defiantMonths = gov.loyalty < DEFIANT_LOYALTY ? pref.defiantMonths + 1 : 0;
    if (pref.defiantMonths >= DEFIANT_MONTHS) {
      pref.autonomous = true;
      pref.autonomyMonths = 0;
      const name = PREFECTURE_DEFS.find((d) => d.id === pref.id).name;
      state.chronicle.push({ kind: 'autonomy', prefecture: pref.id, prefectureName: name, governor: gov.name, year: state.year, month: state.month });
    }
  }
  return state;
}

// 權臣坐大：派系勢力連續高於 MINISTER_FACTION 達 MINISTER_MONTHS 月，且該派有低忠誠、高野心之朝臣，則出現權臣。
// 同時僅一人；權臣在朝期間皇權流失、所屬派系增勢；派系勢力跌破 MINISTER_END 或權臣離朝即失勢。
export function tickMinister(state) {
  const lp = ensureLatePressure(state);
  if (lp.minister) {
    const m = lp.minister;
    const official = state.officials.find((o) => o.id === m.id);
    if (!official || state.factions[m.faction] < MINISTER_END) { lp.minister = null; return state; }
    setStat(state, 'power', state.stats.power - MINISTER_POWER_DRAIN, { silent: true });
    if (state.factions[m.faction] < MINISTER_PEAK) state.factions[m.faction] = Math.min(MINISTER_PEAK, state.factions[m.faction] + MINISTER_FACTION_GAIN);
    return state;
  }
  const top = maxEntry(state.factions);
  lp.ministerMonths = top && top[1] > MINISTER_FACTION ? lp.ministerMonths + 1 : 0;
  if (lp.ministerMonths < MINISTER_MONTHS) return state;
  const candidate = state.officials
    .filter((o) => isCourtOfficial(o) && o.faction === top[0] && o.loyalty < MINISTER_LOYALTY && o.ambition >= MINISTER_AMBITION)
    .sort((a, b) => b.ambition - a.ambition)[0];
  if (!candidate) return state;
  lp.minister = { id: candidate.id, name: candidate.name, faction: top[0], year: state.year, month: state.month };
  state.chronicle.push({ kind: 'minister', name: candidate.name, faction: top[0], year: state.year, month: state.month });
  return state;
}

// 單府本月的天災機率：基礎值，加上城防或民心低落與叛亂／割據之加成，再依近期天災數倍增（連鎖），設上限。
export function disasterChance(state, pref, recent) {
  let risk = DISASTER_BASE;
  if (pref.defense < DISASTER_DEFENSE_BELOW) risk += DISASTER_WEAK_BONUS;
  if (pref.morale < DISASTER_MORALE_BELOW) risk += DISASTER_WEAK_BONUS;
  if (pref.rebel || pref.autonomous) risk += DISASTER_UNREST_BONUS;
  return Math.min(DISASTER_MAX, risk * (1 + DISASTER_CHAIN_GAIN * Math.min(recent, DISASTER_CHAIN_CAP)));
}

// 天災連鎖：各府依機率擲骰；天災損及所在府的城防與民心。不直接扣全國產業：產業損失為永久性，會逐年壓低國庫（試驗顯示中斷率因此明顯上升）。
// 近期天災數於月初一次取定，同月內的天災不互相連鎖。
export function tickDisasters(state) {
  const lp = ensureLatePressure(state);
  const recent = lp.disasters.filter((d) => d.turn > state.turn - DISASTER_CHAIN_WINDOW).length;
  for (const pref of ensureCapture(state)) {
    const rng = makeRng([state.seed, state.year, state.month, 'late-disaster', pref.id]);
    if (rng() >= disasterChance(state, pref, recent)) continue;

    const name = PREFECTURE_DEFS.find((d) => d.id === pref.id).name;
    pref.defense = Math.max(0, pref.defense - DISASTER_DEFENSE_LOSS);
    pref.morale = Math.max(0, pref.morale - DISASTER_MORALE_LOSS);
    pushCapped(lp.disasters, { turn: state.turn, year: state.year, month: state.month, prefecture: pref.id }, DISASTER_LOG_CAP);
    state.chronicle.push({ kind: 'disaster', prefecture: pref.id, prefectureName: name, year: state.year, month: state.month });
  }
  return state;
}

// 月結入口（turn.js monthlyTick 呼叫）：割據 → 權臣 → 天災。
export function tickLatePressure(state) {
  tickAutonomy(state);
  tickMinister(state);
  tickDisasters(state);
  return state;
}

// 側線玩法（提案 7）：微服私訪（巡幸途中的隨機奇遇）與煉丹（每月至多一次的風險報酬）。
//
// 設計原則：
//   - 選用：state.sideEvents.enabled 為 false 時，tourWithEncounter 與 tourTo 行為完全相同，煉丹直接回傳 disabled。
//   - 不參與 sim.js 主線：sim.js 仍只呼叫 tourTo，主線抽選與平衡不因本模組改變。
//   - 小幅效果：奇遇與煉丹只以既有屬性與府民心（morale）呈現，數值皆為小幅。
//   - 確定性：亂數以 state.seed 加上月份與地點（或煉丹的月份）雜湊取得，同種子同結果。
//
// 新增的存檔欄位（懶初始化，舊存檔相容；不列入 schema.js，save.js 直接序列化整個 state）：
//   state.sideEvents.enabled         是否啟用，未設定時視為啟用
//   state.sideEvents.encounterMonth  上次擲奇遇的月索引，未設定時為 -1
//   state.sideEvents.alchemyMonth    上次煉丹的月索引，未設定時為 -1
//   state.sideEvents.alchemy         丹毒與方士狀態 { toxicity, doses, fangshi }，見 alchemy.js（首次煉丹時懶建立）
//   state.sideEvents.pending         待決的二選一奇遇 { encounterId, prefectureId, year, month }，未決時不存在或為 null

import { makeRng } from './rng.js';
import { setStat } from './state.js';
import { ensureTour, tourTo, currentLocation, MORALE_MAX } from './tour.js';
import { ensureCapture } from './city-capture.js';
import { governorOf } from './economy.js';
import {
  ENCOUNTERS, CHOICE_ENCOUNTERS,
  PUNISH_MORALE, PUNISH_LOYALTY, DEFIANT_PUSH, SOOTHE_MORALE, SOOTHE_COST,
} from './encounter-data.js';

export const ENCOUNTER_CHANCE = 0.5; // 每次巡幸抵達後觸發奇遇的機率

// 奇遇資料（二選一奇遇與舊版奇遇表）見 encounter-data.js。舊名仍由此匯出，供既有引用。
export { ENCOUNTERS };

// 煉丹（含丹毒、方士）已移至 alchemy.js；此處 re-export 以維持既有 import 路徑。
export {
  ALCHEMY_COST, ALCHEMY_SUCCESS_CHANCE, ALCHEMY_REWARD, ALCHEMY_BACKFIRE,
  alchemyStatus, attemptAlchemy, tickAlchemy, tickFangshiCoup, alchemyState, ensureAlchemy,
} from './alchemy.js';

const monthIndex = (state) => (state.year - 1) * 12 + (state.month - 1);

// 懶初始化側線欄位（僅於需要寫入時呼叫）。
export function ensureSideEvents(state) {
  if (!state.sideEvents) state.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1 };
  return state.sideEvents;
}

// 側線是否啟用（唯讀，不建立欄位）。
export function sideEventsEnabled(state) {
  return state.sideEvents?.enabled !== false;
}

export function setSideEventsEnabled(state, on) {
  ensureSideEvents(state).enabled = !!on;
  return state;
}

// 本月若尚未擲過奇遇，依種子擲一次；命中則於所至府設為待決（二選一，見 resolveEncounter），回傳該奇遇，否則回傳 null。
// 同一個月只會擲一次（即使未命中亦不重擲），避免以重複巡幸刷奇遇；已有待決奇遇時不再擲。
export function rollEncounter(state) {
  const se = ensureSideEvents(state);
  if (!se.enabled) return null;
  if (se.pending) return null;
  const m = monthIndex(state);
  if (se.encounterMonth === m) return null;
  se.encounterMonth = m;
  const loc = currentLocation(state);
  const rng = makeRng([state.seed, 'encounter', m, loc]);
  if (!(rng() < ENCOUNTER_CHANCE)) return null;
  const pick = CHOICE_ENCOUNTERS[Math.floor(rng() * CHOICE_ENCOUNTERS.length)];
  se.pending = { encounterId: pick.id, prefectureId: loc, year: state.year, month: state.month };
  return { ...pick, prefectureId: loc };
}

// 目前待決的二選一奇遇（唯讀）：回傳同 rollEncounter 的形狀，無則 null。
export function pendingEncounter(state) {
  const p = state.sideEvents?.pending;
  if (!p) return null;
  const enc = CHOICE_ENCOUNTERS.find((e) => e.id === p.encounterId);
  return enc ? { ...enc, prefectureId: p.prefectureId } : null;
}

// 裁決待決奇遇。choice 為 'punish'（嚴懲）或 'soothe'（安撫）。
// 嚴懲：所至府民心上升，知府忠誠下降，並推進其離心月數（可能割據）。
// 安撫：耗國庫，民心小升，知府忠誠不變。失敗（無待決、無此選項、國庫不足）時狀態不變。
export function resolveEncounter(state, choice) {
  const se = state.sideEvents;
  const enc = pendingEncounter(state);
  if (!enc) return { ok: false, reason: 'none' };
  const c = enc.choices[choice];
  if (!c) return { ok: false, reason: 'no_choice' };
  if (choice === 'soothe' && state.stats.treasury < SOOTHE_COST) return { ok: false, reason: 'treasury' };
  ensureTour(state);
  const pref = ensureCapture(state).find((p) => p.id === enc.prefectureId);
  if (!pref) return { ok: false, reason: 'no_prefecture' };
  if (choice === 'soothe') {
    setStat(state, 'treasury', state.stats.treasury - SOOTHE_COST, { silent: true });
    pref.morale = Math.max(0, Math.min(MORALE_MAX, pref.morale + SOOTHE_MORALE));
  } else {
    pref.morale = Math.max(0, Math.min(MORALE_MAX, pref.morale + PUNISH_MORALE));
    const gov = governorOf(state, pref);
    if (gov) gov.loyalty = Math.max(0, gov.loyalty + PUNISH_LOYALTY);
    pref.defiantMonths = (pref.defiantMonths ?? 0) + DEFIANT_PUSH;
  }
  se.pending = null;
  return { ok: true, choice, title: enc.title, text: c.text };
}

// 巡幸並於抵達後擲奇遇。巡幸失敗時狀態不變，encounter 為 null。
// 側線停用時結果與 tourTo 相同（encounter 恆為 null）。
export function tourWithEncounter(state, prefectureId) {
  const r = tourTo(state, prefectureId);
  if (!r.ok) return { ...r, encounter: null };
  return { ...r, encounter: rollEncounter(state) };
}

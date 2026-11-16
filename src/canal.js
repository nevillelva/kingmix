// 漕運：府的稅入在解送途中的損耗（貪腐、劫掠），以及東廠巡漕的緩解。
//
// 設計原則（見「玩法深度擴充」文件階段 4）：
//   - 途耗只打在忠誠低的知府（貪腐）與叛亂或民心低落之府（劫掠）；忠誠府無損耗。
//   - 東廠巡漕是玩家主動的緩解：巡漕期間該府免於貪腐與劫掠，並小幅增收，使「巡漕」淨值接近持平。
//   - 巡漕不佔東廠處置上限（DC_ACTION_CAP），另設每月派遣上限。
//   - 系統參與與否由 state.canal.enabled 決定（同 partisan）：模擬未指定 canal 策略時為 false，
//     預設稽核數字與未加入本系統時完全相同。
//
// 狀態：
//   state.canal            { enabled, monthKey, monthPatrols }（懶建立；僅模擬與開關使用）
//   state.prefectures[].canal.patrolUntil  巡漕到期的回合數（turn）
//   state.canalLog         損耗紀錄（上限 CANAL_LOG_CAP）
//
// 亂數：劫掠擲骰以 makeRng([seed, year, month, 'canal', 府 id]) 進行，不消耗既有亂數流。

import { makeRng } from './rng.js';
import { pushCapped } from './caps.js';
import { setStat } from './state.js';

export const CANAL_DISLOYAL = 40; // 知府忠誠低於此值，計為貪腐
export const CANAL_LOSS_MAX = 0.1; // 忠誠為 0 時的貪腐損耗率（線性遞增）
export const CANAL_MORALE_LOW = 30; // 民心低於此值，視為劫掠風險
export const CANAL_RAID_CHANCE = 0.15; // 叛亂或民心低落之府，每月劫掠機率
export const CANAL_RAID_LOSS = 0.08; // 劫掠時的額外損耗率
export const CANAL_LOSS_CAP = 0.35; // 單府單月損耗率上限
export const CANAL_PATROL_MONTHS = 6; // 一次巡漕的持續月數
export const CANAL_PATROL_PER_MONTH = 1; // 每月巡漕派遣上限（不佔東廠處置上限）
export const CANAL_PATROL_BONUS = 0.05; // 巡漕期間稅入小幅增收
export const CANAL_PATROL_COST = 15; // 每次派遣的國庫耗費（巡漕有成本，不得白送增收）
export const CANAL_LOG_CAP = 50;

export function canalOn(state) {
  return state.canal?.enabled !== false;
}

export function patrolled(pref, turn) {
  return (pref.canal?.patrolUntil ?? -1) >= turn;
}

// 單府本月的損耗率（0..CANAL_LOSS_CAP）與成因；gov 為知府（可為 null，缺位時不計貪腐）。
// 巡漕中的府不計任何損耗。劫掠擲骰僅在風險成立時進行。
export function canalRate(state, pref, gov, rng) {
  if (!canalOn(state) || patrolled(pref, state.turn)) return { rate: 0, causes: [] };
  let rate = 0;
  const causes = [];
  if (gov && gov.loyalty < CANAL_DISLOYAL) {
    rate += CANAL_LOSS_MAX * (CANAL_DISLOYAL - gov.loyalty) / CANAL_DISLOYAL;
    causes.push('corruption');
  }
  const morale = pref.morale ?? 0;
  if ((pref.rebel === true || morale < CANAL_MORALE_LOW) && rng() < CANAL_RAID_CHANCE) {
    rate += CANAL_RAID_LOSS;
    causes.push('raid');
  }
  return { rate: Math.min(CANAL_LOSS_CAP, rate), causes };
}

// 巡漕期間的增收係數（1 為無增收）。
export function canalPatrolMult(state, pref) {
  return canalOn(state) && patrolled(pref, state.turn) ? 1 + CANAL_PATROL_BONUS : 1;
}

// 記入損耗紀錄（僅有損耗時）。
export function logCanalLoss(state, pref, lost, causes) {
  if (!(lost > 0)) return;
  if (state.canal) state.canal.lostTotal = (state.canal.lostTotal || 0) + lost; // 整局總損耗（模擬統計用，不受紀錄上限影響）
  state.canalLog = state.canalLog ?? [];
  pushCapped(state.canalLog, {
    turn: state.turn, year: state.year, month: state.month,
    prefecture: pref.id, lost: Math.round(lost * 100) / 100, causes,
  }, CANAL_LOG_CAP);
}

// 派遣東廠巡漕：每月至多 CANAL_PATROL_PER_MONTH 次；回傳 { ok, reason }。
// reason：disabled | unknown | limit | treasury；成功時該府 patrolUntil 設為 turn + CANAL_PATROL_MONTHS（已巡漕者續期）。
export function dispatchCanalPatrol(state, prefId) {
  if (!canalOn(state)) return { ok: false, reason: 'disabled' };
  const pref = (state.prefectures || []).find((p) => p.id === prefId);
  if (!pref) return { ok: false, reason: 'unknown' };
  state.canal = state.canal ?? { enabled: true };
  const key = `${state.year}-${state.month}`;
  if (state.canal.monthKey !== key) {
    state.canal.monthKey = key;
    state.canal.monthPatrols = 0;
  }
  if ((state.canal.monthPatrols || 0) >= CANAL_PATROL_PER_MONTH) return { ok: false, reason: 'limit' };
  if (state.stats.treasury < CANAL_PATROL_COST) return { ok: false, reason: 'treasury' };
  setStat(state, 'treasury', state.stats.treasury - CANAL_PATROL_COST, { silent: true });
  state.canal.monthPatrols = (state.canal.monthPatrols || 0) + 1;
  pref.canal = { patrolUntil: state.turn + CANAL_PATROL_MONTHS - 1 }; // 含當月共 CANAL_PATROL_MONTHS 個月
  return { ok: true, reason: null };
}

// 唯讀：各府巡漕狀態，供介面顯示。
export function canalStatus(state) {
  return (state.prefectures || []).map((p) => ({
    id: p.id,
    patrolling: patrolled(p, state.turn),
    patrolLeft: Math.max(0, (p.canal?.patrolUntil ?? -1) - state.turn),
  }));
}

// 模擬用的巡漕策略：'patrol' 每月派遣一次，對象為未巡漕府中知府忠誠最低者（同分取 id 較小者）；'none' 不派遣。
// govOf 由呼叫端傳入（同 economy.js 的 governorOf，避免循環匯入）。
export function autoCanalPatrol(state, strategy, govOf) {
  if (strategy !== 'patrol' || !canalOn(state)) return null;
  const cands = (state.prefectures || []).filter((p) => !patrolled(p, state.turn));
  if (!cands.length) return null;
  const loy = (p) => govOf(state, p)?.loyalty ?? 100;
  const target = [...cands].sort((a, b) => (loy(a) - loy(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  return dispatchCanalPatrol(state, target.id);
}

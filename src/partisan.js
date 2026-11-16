// 黨爭：一派勢力達 STANDOFF_LEAD 且另一派達 STANDOFF_RIVAL，持續 STANDOFF_MONTHS 月即進入「對峙」。
// 對峙期間，進逼之派每隔 DEMAND_INTERVAL 月以「聯名彈劾」訴求指名罷免敵對派系一名朝臣（沿用 demand-queue）。
// 玩家於訴求上裁決三種回應：
//   balance（平衡各方）：駁回，耗皇權；之後 BALANCE_HOLD_MONTHS 月內，勢力過高之派每月回落，對峙暫停。
//   rally（扶植）：拉攏進逼之派（rallyFaction），無代價；但不直接設權臣，權臣只能由 tickMinister 達成。
//   purge（血腥清洗）：走東廠處置（punish），暴政上升，全體朝臣忠誠下滑。
//   未回應：未了訴求達 DEMAND_OPEN_LIMIT 筆時，下一則到期即觸發「黨錮之禍」：被彈劾者除名，清流好感下滑。
//
// 與權臣：權臣在朝時對峙暫停（不再產生訴求；既有訴求保留）。
// 與暴政：清洗累積暴政，既有 applyTyrannyDrift 會使清流好感下滑，本模組不另行重複扣減。
//
// 預設模擬不參與：state.partisan.enabled 為 false（sim.js 未指定 partisan 策略時）時，tickPartisan 直接返回，
// 不建立任何欄位、不擲骰、不改動 state，故稽核數字與未加入本系統時完全相同。網頁局未設此旗標（視為啟用）。
//
// 存檔欄位（懶初始化，見 ensurePartisan）：
//   state.partisan { enabled, stage: 'calm'|'standoff', standoffMonths, petitioner, rival, lastDemandTurn,
//                    balanceMonths, bans, demands[], nextDemandId }
//   state.partisan.demands 項目：{ id, official, officialName, petitioner, rival, turn, status }
//   state.chronicle 中 kind 為 'standoff' / 'partisan_ban' 的紀錄。
//
// 所有擲骰皆以 makeRng([seed, year, month, 'partisan']) 進行，不消耗既有亂數流。

import { setStat } from './state.js';
import { makeRng } from './rng.js';
import { isCourtOfficial } from './officials.js';
import { standoffPair, rallyFaction, BALANCE } from './factions.js';
import { openInvestigation, applyDongchangAction } from './dongchang.js';
import { queueView, enqueue, openItems, resolve, cap } from './demand-queue.js';
import { pushCapped } from './caps.js';

export const STANDOFF_MONTHS = 6; // 對峙條件持續月數，達到即進入對峙
export const DEMAND_INTERVAL = 3; // 對峙期間每隔幾月提出一則聯名彈劾
export const DEMAND_OPEN_LIMIT = 3; // 未了訴求達此數，下一則到期即觸發黨錮
export const DEMAND_LOG_CAP = 12; // 訴求佇列只保留最近 12 筆
export const BALANCE_POWER_COST = 3; // 平衡各方：駁回所耗皇權
export const BALANCE_HOLD_MONTHS = 12; // 平衡各方後的均衡期（月）
export const BALANCE_HOLD_DRAIN = 1; // 均衡期間，勢力高於 BALANCE.max 之派每月回落
export const PURGE_LOYALTY_DRAIN = 3; // 血腥清洗：全體朝臣忠誠下滑
export const BAN_QINGLIU_DROP = 5; // 黨錮之禍：清流好感下滑
export const PARTISAN_RESPONSES = Object.freeze(['balance', 'rally', 'purge']);
const LOG_CAP = 50;

// 系統是否參與：僅明確設為 false 時關閉（sim.js 預設即為 false）。
export function partisanOn(state) {
  return state.partisan?.enabled !== false;
}

// 懶初始化。只補缺漏欄位，不覆寫既有值；enabled 保留原樣（undefined 視為啟用）。
export function ensurePartisan(state) {
  if (!state.partisan || typeof state.partisan !== 'object') state.partisan = {};
  const p = state.partisan;
  if (p.stage === undefined) p.stage = 'calm';
  if (p.standoffMonths === undefined) p.standoffMonths = 0;
  if (p.petitioner === undefined) p.petitioner = null;
  if (p.rival === undefined) p.rival = null;
  if (p.lastDemandTurn === undefined) p.lastDemandTurn = null;
  if (p.balanceMonths === undefined) p.balanceMonths = 0;
  if (p.bans === undefined) p.bans = 0;
  if (!Array.isArray(p.demands)) p.demands = [];
  if (p.nextDemandId === undefined) p.nextDemandId = 1;
  return p;
}

const demandQueue = (p) => queueView(p, 'demands', 'nextDemandId');

// 派系對峙中的訴求：以 status 'lapsed' 結束（對峙解除或訴求目標已不在朝）。
function lapseOpen(state, p) {
  for (const d of openItems(demandQueue(p))) resolve(demandQueue(p), d.id, 'lapsed', { resolvedTurn: state.turn });
}

// 黨錮之禍：未了訴求之被彈劾者除名（由呼叫端以 dismiss 回呼執行，避免與 turn.js 循環匯入），清流好感下滑。
function partisanBan(state, p, dismiss) {
  const q = demandQueue(p);
  for (const d of openItems(q)) {
    const o = state.officials.find((x) => x.id === d.official);
    if (o && isCourtOfficial(o) && dismiss) dismiss(o);
    resolve(q, d.id, 'banned', { resolvedTurn: state.turn });
  }
  state.factions.qingliu = Math.max(0, state.factions.qingliu - BAN_QINGLIU_DROP);
  p.bans += 1;
  p.stage = 'calm';
  p.standoffMonths = 0;
  pushCapped(state.chronicle, { kind: 'partisan_ban', year: state.year, month: state.month }, LOG_CAP);
}

// 每月結算（turn.js monthlyTick 呼叫）。opts.dismiss：黨錮時罷免官員的回呼（turn.js 傳入 removeOfficial）。
export function tickPartisan(state, opts = {}) {
  if (!partisanOn(state)) return state;
  const p = ensurePartisan(state);
  const q = demandQueue(p);

  // 均衡期：勢力過高之派回落，對峙與訴求暫停。
  if (p.balanceMonths > 0) {
    p.balanceMonths -= 1;
    for (const [k, v] of Object.entries(state.factions)) {
      if (v > BALANCE.max) state.factions[k] = Math.max(BALANCE.max, v - BALANCE_HOLD_DRAIN);
    }
    return state;
  }

  const pair = standoffPair(state.factions);
  if (!pair) {
    if (p.stage === 'standoff') lapseOpen(state, p);
    p.stage = 'calm';
    p.standoffMonths = 0;
    return state;
  }

  if (p.stage !== 'standoff') {
    p.standoffMonths += 1;
    if (p.standoffMonths >= STANDOFF_MONTHS) {
      p.stage = 'standoff';
      p.petitioner = pair.petitioner;
      p.rival = pair.rival;
      p.lastDemandTurn = state.turn - DEMAND_INTERVAL; // 進入對峙即可提出第一則訴求
      pushCapped(state.chronicle, { kind: 'standoff', petitioner: pair.petitioner, rival: pair.rival, year: state.year, month: state.month }, LOG_CAP);
    }
    return state;
  }

  p.petitioner = pair.petitioner;
  p.rival = pair.rival;

  // 權臣在朝：對峙暫停，不再提出新訴求（既有訴求保留，待玩家裁決）。
  if (state.latePressure?.minister) return state;
  if (state.turn - p.lastDemandTurn < DEMAND_INTERVAL) return state;
  p.lastDemandTurn = state.turn;

  if (openItems(q).length >= DEMAND_OPEN_LIMIT) {
    partisanBan(state, p, opts.dismiss);
    return state;
  }

  const named = new Set(openItems(q).map((d) => d.official));
  const candidates = state.officials
    .filter((o) => isCourtOfficial(o) && o.faction === pair.rival && !named.has(o.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return state;
  const rng = makeRng([state.seed, state.year, state.month, 'partisan']);
  const target = candidates[Math.floor(rng() * candidates.length)];
  enqueue(q, {
    official: target.id,
    officialName: target.personName ?? target.name,
    petitioner: pair.petitioner,
    rival: pair.rival,
    turn: state.turn,
  });
  cap(q, DEMAND_LOG_CAP);
  return state;
}

// 玩家裁決一則聯名彈劾。回傳 { ok, outcome } 或 { ok:false, reason }。
// 僅對 open 訴求生效；清洗遇東廠案件已滿或同人已在查，回傳 dc_busy 且訴求保持 open。
export function respondPartisanDemand(state, demandId, response) {
  if (!PARTISAN_RESPONSES.includes(response)) throw new Error(`unknown partisan response: ${response}`);
  const p = ensurePartisan(state);
  const q = demandQueue(p);
  const d = openItems(q).find((x) => x.id === demandId);
  if (!d) return { ok: false, reason: 'no_demand' };

  if (response === 'balance') {
    setStat(state, 'power', state.stats.power - BALANCE_POWER_COST);
    p.balanceMonths = BALANCE_HOLD_MONTHS;
    resolve(q, d.id, 'balanced', { resolvedTurn: state.turn });
    lapseOpen(state, p);
    p.stage = 'calm';
    p.standoffMonths = 0;
    return { ok: true, outcome: 'balanced' };
  }

  if (response === 'rally') {
    rallyFaction(state, d.petitioner);
    resolve(q, d.id, 'rallied', { resolvedTurn: state.turn });
    return { ok: true, outcome: 'rallied' };
  }

  // purge：走東廠既有處置路徑（punish），暴政與官員忠誠依此計入。
  const official = state.officials.find((o) => o.id === d.official);
  if (!official || !isCourtOfficial(official)) {
    resolve(q, d.id, 'lapsed', { resolvedTurn: state.turn });
    return { ok: true, outcome: 'lapsed' };
  }
  const c = openInvestigation(state, official.id);
  if (!c) return { ok: false, reason: 'dc_busy' };
  c.status = 'leverage';
  c.level = 1;
  const applied = applyDongchangAction(state, c.id, 'punish');
  for (const o of state.officials) {
    o.loyalty = Math.max(0, o.loyalty - PURGE_LOYALTY_DRAIN);
  }
  resolve(q, d.id, 'purged', { resolvedTurn: state.turn, capped: applied.cappedFrom !== undefined });
  return { ok: true, outcome: applied.cappedFrom !== undefined ? 'warned' : 'purged' };
}

// 模擬用：依固定策略裁決全部未了訴求。'ignore' 不裁決（用於測量黨錮）。回傳裁決筆數。
export const SIM_PARTISAN_STRATEGIES = Object.freeze({
  balance: 'balance',
  rally: 'rally',
  purge: 'purge',
  ignore: null,
});

export function autoRespondPartisan(state, strategy) {
  if (!(strategy in SIM_PARTISAN_STRATEGIES)) throw new Error(`unknown partisan strategy: ${strategy}`);
  const response = SIM_PARTISAN_STRATEGIES[strategy];
  if (!response) return 0;
  let n = 0;
  for (const d of openItems(demandQueue(ensurePartisan(state)))) {
    const r = respondPartisanDemand(state, d.id, response);
    if (r.ok) n += 1;
  }
  return n;
}

// 讀取（供網頁顯示）：不修改 state。
export function partisanStatus(state) {
  const p = state.partisan || {};
  const open = Array.isArray(p.demands) ? p.demands.filter((d) => d.status === 'open') : [];
  const top = Object.entries(state.factions || {}).sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    enabled: partisanOn(state),
    stage: p.stage ?? 'calm',
    petitioner: p.petitioner ?? null,
    rival: p.rival ?? null,
    standoffMonths: p.standoffMonths ?? 0,
    standoffLimit: STANDOFF_MONTHS,
    balanceMonths: p.balanceMonths ?? 0,
    bans: p.bans ?? 0,
    openDemands: open,
    openLimit: DEMAND_OPEN_LIMIT,
    minister: Boolean(state.latePressure?.minister),
    strongestFaction: top ? { faction: top[0], power: Math.round(top[1]) } : null,
  };
}

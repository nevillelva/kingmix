// 外交：鄰國常數、好感度（attitude）狀態，以及四條外交路線：聯姻、朝貢、結盟、宣戰。
// 外交狀態採延遲建立（state.diplomacy），不改動 createInitialState。

import { makeRng } from './rng.js';

// 四個鄰國：strength 為基礎兵力（與 ourStrength 同尺度，初始己方約 196）。
export const NEIGHBORS = Object.freeze([
  { id: 'north', name: '北狄', strength: 290, attitude: 30 },
  { id: 'west', name: '西羌', strength: 200, attitude: 45 },
  { id: 'south', name: '南詔', strength: 185, attitude: 55 },
  { id: 'east', name: '東越', strength: 150, attitude: 65 },
]);

export const MARRIAGE_COST = 60; // 國庫
export const MARRIAGE_TRUCE_MONTHS = 24;
export const TRIBUTE_MIN_ATTITUDE = 40;
export const TRIBUTE_GAIN = 20; // 國庫
export const ALLIANCE_MIN_ATTITUDE = 60;
export const MAX_ALLIANCES = 2;

// 宣戰的獎懲數值（勝利獎勵 / 戰敗損失），預設與 web/index.html 的 WAR_SPEC 相同。
export const DECLARE_WAR_REWARD = Object.freeze({ treasury: 40, prestige: 3 }); // 國庫、聲望
export const DECLARE_WAR_LOSS = Object.freeze({ armament: -40, people: -4 }); // 軍備、民心

export function neighborById(id) {
  return NEIGHBORS.find((n) => n.id === id) ?? null;
}

// 延遲建立外交狀態；回傳 state.diplomacy（以鄰國 id 為鍵）。
export function diplomacyOf(state) {
  if (!state.diplomacy) {
    state.diplomacy = Object.fromEntries(
      NEIGHBORS.map((n) => [n.id, { attitude: n.attitude, allied: false, kin: 0 }]),
    );
  }
  return state.diplomacy;
}

export function alliedCount(state) {
  return Object.values(diplomacyOf(state)).filter((d) => d.allied).length;
}

// 結盟時己方戰力的加成倍率（每盟國 +10%）。
export function alliedReinforcement(state) {
  return 1 + 0.1 * alliedCount(state);
}

// 敵方實際強度：好感低則士氣高（略強），聯姻期間（kin > 0）略弱。
export function enemyStrengthOf(state, id) {
  const n = neighborById(id);
  if (!n) throw new Error(`unknown neighbor: ${id}`);
  const d = diplomacyOf(state)[id];
  const kin = d.kin > 0 ? 0.9 : 1;
  return n.strength * (1 + (50 - d.attitude) / 400) * kin;
}

function clampAttitude(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function changeAttitude(state, id, delta) {
  const d = diplomacyOf(state)[id];
  d.attitude = clampAttitude(d.attitude + delta);
  return d.attitude;
}

// 聯姻：花費國庫，好感 +15，並進入 kin 期間（期間不易開戰）。
export function arrangeMarriage(state, id) {
  if (!neighborById(id)) return { ok: false, reason: 'unknown' };
  if (state.stats.treasury < MARRIAGE_COST) return { ok: false, reason: 'treasury' };
  state.stats.treasury -= MARRIAGE_COST;
  const d = diplomacyOf(state)[id];
  d.kin = MARRIAGE_TRUCE_MONTHS;
  changeAttitude(state, id, 15);
  return { ok: true };
}

// 朝貢：好感足夠時鄰國進貢，國庫 +TRIBUTE_GAIN、聲望 +1、好感 +8。
export function acceptTribute(state, id) {
  if (!neighborById(id)) return { ok: false, reason: 'unknown' };
  const d = diplomacyOf(state)[id];
  if (d.attitude < TRIBUTE_MIN_ATTITUDE) return { ok: false, reason: 'attitude' };
  state.stats.treasury += TRIBUTE_GAIN;
  state.stats.prestige += 1;
  changeAttitude(state, id, 8);
  return { ok: true };
}

// 結盟：好感需達門檻，且盟國數有上限；結盟後好感 +5。
export function formAlliance(state, id) {
  if (!neighborById(id)) return { ok: false, reason: 'unknown' };
  const d = diplomacyOf(state)[id];
  if (d.allied) return { ok: false, reason: 'already' };
  if (d.attitude < ALLIANCE_MIN_ATTITUDE) return { ok: false, reason: 'attitude' };
  if (alliedCount(state) >= MAX_ALLIANCES) return { ok: false, reason: 'limit' };
  d.allied = true;
  changeAttitude(state, id, 5);
  return { ok: true };
}

// 宣戰：盟國不可宣戰。通過後好感歸零（敵對）、取消聯姻保護。
// 實際戰役由 campaign.js 的 startCampaign 進行，會呼叫此函式。
export function declareWar(state, id) {
  if (!neighborById(id)) return { ok: false, reason: 'unknown' };
  const d = diplomacyOf(state)[id];
  if (d.allied) return { ok: false, reason: 'allied' };
  d.kin = 0;
  d.attitude = 0;
  return { ok: true };
}

// 開戰壓力（0 至 1）：好感越低越容易起釁；盟國為 0；聯姻期間減半。
export function warPressure(state, id) {
  const d = diplomacyOf(state)[id];
  if (!d || d.allied) return 0;
  const base = (100 - d.attitude) / 100;
  return d.kin > 0 ? base * 0.5 : base;
}

// 事件觸發用：依各鄰國壓力擲骰，回傳第一個起釁的鄰國 id，否則 null。
// 每國機率 = 壓力 * 0.1，確定性來自 rng。
export function pickWarTarget(state, rng) {
  for (const n of NEIGHBORS) {
    const p = warPressure(state, n.id) * 0.1;
    if (rng() < p) return n.id;
  }
  return null;
}

// ---- 可達性：事件選項可直接觸發四條路線與刺探（以 state.diplomacyLog 記錄） ----

export const SCOUT_COST = 10; // 國庫：遣使刺探的花費
export const SCOUT_TTL = 12; // 刺探情報的有效月數（以 state.turn 計）

export function scoutedFresh(state, id) {
  const d = diplomacyOf(state)[id];
  return !!d && (d.scoutedUntil ?? -1) > state.turn;
}

// 刺探：花費國庫，於 SCOUT_TTL 個月內，該國下一場戰役自動取得偵察情報（見 campaign.js）。
export function scoutNeighbor(state, id) {
  if (!neighborById(id)) return { ok: false, reason: 'unknown' };
  if (scoutedFresh(state, id)) return { ok: false, reason: 'already' };
  if (state.stats.treasury < SCOUT_COST) return { ok: false, reason: 'treasury' };
  state.stats.treasury -= SCOUT_COST;
  diplomacyOf(state)[id].scoutedUntil = state.turn + SCOUT_TTL;
  return { ok: true };
}

// 前置條件（不改動狀態）：選項是否可選。war 需無進行中的戰役，且非盟國。
export function canDiplomacy(state, action, id) {
  if (!neighborById(id)) return false;
  const d = diplomacyOf(state)[id];
  switch (action) {
    case 'marriage': return state.stats.treasury >= MARRIAGE_COST;
    case 'tribute': return d.attitude >= TRIBUTE_MIN_ATTITUDE;
    case 'ally': return !d.allied && d.attitude >= ALLIANCE_MIN_ATTITUDE && alliedCount(state) < MAX_ALLIANCES;
    case 'scout': return !scoutedFresh(state, id) && state.stats.treasury >= SCOUT_COST;
    case 'war': return !d.allied && !(state.campaign && state.campaign.status === 'active');
    default: return false;
  }
}

// 非戰爭路線的統一入口（war 由 turn.js 交給 campaign.js 的 startCampaign）。
export function diplomacyAction(state, action, id) {
  switch (action) {
    case 'marriage': return arrangeMarriage(state, id);
    case 'tribute': return acceptTribute(state, id);
    case 'ally': return formAlliance(state, id);
    case 'scout': return scoutNeighbor(state, id);
    default: return { ok: false, reason: 'unknown' };
  }
}

export function recordDiplomacy(state, action, id, ok) {
  state.diplomacyLog = state.diplomacyLog || [];
  state.diplomacyLog.push({ turn: state.turn, action, neighbor: id, ok });
  return state.diplomacyLog.at(-1);
}

// 每月好感漂移：朝 50 回歸 1 點，並以確定性小幅抖動；聯姻期間倒數。
// 尚未接入 turn.js 的月結算（該檔不在本階段範圍），由後續整合呼叫。
export function monthlyDrift(state, year, month) {
  const rng = makeRng([state.seed, year, month, 'diplomacy']);
  for (const n of NEIGHBORS) {
    const d = diplomacyOf(state)[n.id];
    const jitter = rng() < 0.5 ? -1 : 1;
    d.attitude = clampAttitude(d.attitude + Math.sign(50 - d.attitude) + jitter * (rng() < 0.3 ? 1 : 0));
    if (d.kin > 0) d.kin -= 1;
  }
  return diplomacyOf(state);
}

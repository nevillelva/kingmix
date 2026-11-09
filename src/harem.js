// 後宮與外戚：每位妃嬪背後是一個家族（派系）。家族每隔一段時間提出請求；
// 未了的請求累積成家族勢力，勢力達門檻即「外戚坐大」，並對應到一位妃嬪。
// 太后為另一個權力中心：外戚坐大時太后勢力上升，太后勢力高時反對皇嗣或後宮決策。
// 數值為 Phase 10 暫定值。

import { makeRng } from './rng.js';

export const DEMAND_KINDS = ['爵位', '田產', '科舉名額'];
export const DEMAND_CHANCE = 1 / 24; // 每位妃嬪每月提出請求的機率
export const WAIJIA_THRESHOLD = 60; // 外戚坐大門檻
export const WAIJIA_FAMILY_GROWTH = 0.5; // 每位未了請求每月增加的家族勢力
export const WAIJIA_DECAY = 0.2;
export const TAIHOU_OPPOSE = 40; // 太后勢力達此值即反對
export const TAIHOU_GAIN = 0.2;
export const TAIHOU_DECAY = 0.1;
const MAX_DEMANDS = 30;

// 寵愛值（favor，0–100）：每位妃嬪一個數值，入宮時約 40–60（見 people.js generateConsort）。
// 未了請求滿 DEMAND_TERM 個月後由皇帝裁決：達成則寵愛 +FAVOR_STEP，拒絕則 -FAVOR_STEP。
// 裁決機率隨寵愛而定：0.3 + 0.4 × favor/100（寵愛高者較易獲准）。
export const FAVOR_INITIAL = 50;
export const FAVOR_STEP = 4;
export const DEMAND_TERM = 24;

// 外戚坐大回寫派系勢力（耦合）：僅在某家族 外戚坐大期間，該家族派系勢力每月 +0.02，並止於上限。
// 上限低於 FACTION_FORCE_THRESHOLD（50），確保耦合本身不會單獨逼迫國策。
export const WAIJIA_FACTION_COUPLING = 0.02;
export const WAIJIA_FACTION_CAP = 40;

// 太后反對時的月度懲罰（只作用於皇帝權勢），且僅在有外戚坐大時生效。
export const TAIHOU_PENALTY = -0.3;

export function consortFavor(consort) {
  return consort?.favor ?? FAVOR_INITIAL;
}

// 寫入一則請求的裁決（達成或拒絕），並調整該妃嬪寵愛值。僅對 open 狀態的請求生效。
export function setDemandOutcome(state, demandId, grant) {
  const h = ensureHarem(state);
  const d = h.demands.find((x) => x.id === demandId);
  if (!d || d.status !== 'open') return null;
  d.status = grant ? 'granted' : 'denied';
  d.resolvedTurn = state.turn;
  const c = state.consorts.find((x) => x.id === d.consortId);
  if (c) c.favor = Math.min(100, Math.max(0, consortFavor(c) + (grant ? FAVOR_STEP : -FAVOR_STEP)));
  return d;
}

// 每月：逾期未了的請求由皇帝裁決（確定性隨機，機率受寵愛影響）。
function resolveDueDemands(state, h) {
  for (const d of h.demands) {
    if (d.status !== 'open' || state.turn - d.turn < DEMAND_TERM) continue;
    const c = state.consorts.find((x) => x.id === d.consortId);
    const p = 0.3 + (0.4 * consortFavor(c)) / 100;
    setDemandOutcome(state, d.id, makeRng([state.seed, 'demand', d.id])() < p);
  }
}

function ensureHarem(state) {
  if (!state.harem) {
    state.harem = { demands: [], nextDemandId: 1, waijia: {}, dominant: null, taihou: { power: 0 } };
  }
  return state.harem;
}

// 外戚對應的妃嬪：同家族中最早入宮者（id 最小）為家族代表。
export function familyHead(state, family) {
  return state.consorts.find((c) => c.family === family) ?? null;
}

// 每月：妃嬪家族提出請求（確定性隨機）
function proposeDemands(state, h) {
  for (const c of state.consorts) {
    const rng = makeRng([state.seed, 'harem', state.year, state.month, c.id]);
    if (rng() < DEMAND_CHANCE) {
      const kind = DEMAND_KINDS[Math.floor(rng() * DEMAND_KINDS.length)];
      h.demands.push({ id: h.nextDemandId, consortId: c.id, family: c.family, kind, turn: state.turn, status: 'open' });
      h.nextDemandId += 1;
    }
  }
  if (h.demands.length > MAX_DEMANDS) h.demands = h.demands.slice(-MAX_DEMANDS);
}

// 家族勢力：每位妃嬪 +0.5 並隨未了請求累積，每月衰減。
function updateWaijia(state, h) {
  const families = new Set(state.consorts.map((c) => c.family));
  for (const fam of families) {
    const open = h.demands.filter((d) => d.family === fam && d.status === 'open').length;
    const count = state.consorts.filter((c) => c.family === fam).length;
    const prev = h.waijia[fam] ?? 0;
    const next = prev + count * 0.1 + open * WAIJIA_FAMILY_GROWTH - WAIJIA_DECAY;
    h.waijia[fam] = Math.min(100, Math.max(0, next));
  }
}

// 外戚坐大：取勢力最高且過門檻的家族，對應其代表妃嬪。（暫不回寫派系勢力，見 harem.test 與 PR 說明）
function resolveDominant(state, h) {
  let best = null;
  for (const [fam, v] of Object.entries(h.waijia)) {
    if (v >= WAIJIA_THRESHOLD && (!best || v > h.waijia[best])) best = fam;
  }
  if (!best) {
    h.dominant = null;
    return;
  }
  const head = familyHead(state, best);
  h.dominant = head ? { family: best, consortId: head.id } : null;
}

// 太后：外戚坐大時勢力上升（太后護持母族）；否則緩慢消退。
function updateTaihou(h) {
  const p = h.taihou.power;
  h.taihou.power = h.dominant ? Math.min(100, p + TAIHOU_GAIN) : Math.max(0, p - TAIHOU_DECAY);
}

// 太后是否反對某項決策（kind: 'heir' 皇嗣、'harem' 後宮）。
export function taihouOpposes(state, kind) {
  if (!['heir', 'harem'].includes(kind)) throw new Error(`unknown decision kind: ${kind}`);
  return (state.harem?.taihou.power ?? 0) >= TAIHOU_OPPOSE;
}

// 外戚坐大時，其家族派系勢力微升（上限 WAIJIA_FACTION_CAP）。無外戚坐大時不改動任何數值。
export function applyWaijiaCoupling(state) {
  const dom = state.harem?.dominant;
  if (!dom || !(dom.family in state.factions)) return state;
  const cur = state.factions[dom.family];
  if (cur >= WAIJIA_FACTION_CAP) return state;
  state.factions[dom.family] = Math.min(WAIJIA_FACTION_CAP, cur + WAIJIA_FACTION_COUPLING);
  return state;
}

// 太后月度懲罰（負值表示權勢減少）。只有外戚坐大且太后反對時才非零；預設狀態恆為 0。
export function taihouPenalty(state) {
  if (!state.harem?.dominant) return 0;
  return taihouOpposes(state, 'harem') ? TAIHOU_PENALTY : 0;
}

// 每月結算：無妃嬪時不做任何事，主線行為不變。
export function tickHarem(state) {
  if (state.consorts.length === 0 && !state.harem) return state;
  const h = ensureHarem(state);
  proposeDemands(state, h);
  resolveDueDemands(state, h);
  updateWaijia(state, h);
  resolveDominant(state, h);
  updateTaihou(h);
  return state;
}

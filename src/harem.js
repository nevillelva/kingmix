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

// 每月結算：無妃嬪時不做任何事，主線行為不變。
export function tickHarem(state) {
  if (state.consorts.length === 0 && !state.harem) return state;
  const h = ensureHarem(state);
  proposeDemands(state, h);
  updateWaijia(state, h);
  resolveDominant(state, h);
  updateTaihou(h);
  return state;
}

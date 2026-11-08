// 多回合戰役狀態機：出征（startCampaign）→ 戰前偵察（reconnoiter）→ 每回合選戰術（pickTactic）
// → 中途議和（offerPeace）。結束時以 recordWar 寫入 state.wars，格式與單擲路徑一致。
// 所有隨機皆來自 makeRng([seed, year, month, 'campaign', ...])，同存檔同結果。

import { makeRng } from './rng.js';
import { ourStrength, resolveRound, recordWar, TACTICS, SPREAD_SCOUTED, SPREAD_UNSCOUTED } from './war.js';
import { declareWar, enemyStrengthOf, alliedReinforcement, neighborById, diplomacyOf } from './diplomacy.js';

export const MAX_ROUNDS = 3;
export const WINS_NEEDED = 2;
export const GRAIN_RATIO = 0.4; // 粮草 = 農業 * GRAIN_RATIO，於出征時一次定下
export const GRAIN_SHORT_MULT = 0.75; // 粮草不足時己方戰力倍率
export const RECON_GRAIN_COST = 10;
export const PEACE_THRESHOLD = 60;

function defaultApply(state, effects) {
  for (const [k, v] of Object.entries(effects || {})) {
    if (k in state.stats) state.stats[k] += v;
  }
}

function rngFor(state, campaign, salt) {
  return makeRng([state.seed, state.year, state.month, 'campaign', campaign.id, campaign.round, salt]);
}

// spec: { strength, reward, loss }，與 resolveWar 相同。neighborId 可省略（事件型戰爭）。
// 有 neighborId 時，敵方強度改由外交狀態決定，且盟國不可攻打。
export function startCampaign(state, spec, { neighborId = null } = {}) {
  if (state.campaign && state.campaign.status === 'active') {
    return { ok: false, reason: 'busy' };
  }
  let enemyStrength = spec.strength;
  if (neighborId) {
    if (!neighborById(neighborId)) return { ok: false, reason: 'unknown' };
    const decl = declareWar(state, neighborId);
    if (!decl.ok) return decl;
    enemyStrength = enemyStrengthOf(state, neighborId);
  }
  const campaign = {
    id: `${state.turn}`,
    status: 'active',
    neighborId,
    baseStrength: spec.strength,
    enemyStrength,
    reward: spec.reward || {},
    loss: spec.loss || {},
    grain: Math.floor(state.stats.agriculture * GRAIN_RATIO),
    intel: 'none',
    estimate: null,
    ourWins: 0,
    enemyWins: 0,
    round: 0,
    rounds: [],
  };
  state.campaign = campaign;
  return { ok: true, campaign };
}

// 戰前偵察：只能在第 0 回合前使用一次，消耗粮草，之後的回合敵方強度不確定幅度縮小。
export function reconnoiter(state) {
  const c = state.campaign;
  if (!c || c.status !== 'active') return { ok: false, reason: 'inactive' };
  if (c.round !== 0 || c.intel !== 'none') return { ok: false, reason: 'timing' };
  c.grain = Math.max(0, c.grain - RECON_GRAIN_COST);
  c.intel = 'scouted';
  c.estimate = Math.round(c.enemyStrength);
  return { ok: true, estimate: c.estimate, grain: c.grain };
}

// 選戰術並結算一回合。戰術可為 assault / hold / ambush（強攻 / 堅守 / 奇襲）。
export function pickTactic(state, tactic, applyEffects = defaultApply) {
  const c = state.campaign;
  if (!c || c.status !== 'active') return { ok: false, reason: 'inactive' };
  const t = TACTICS[tactic];
  if (!t) return { ok: false, reason: 'tactic' };

  const rng = rngFor(state, c, 'round');
  const short = c.grain < t.grain;
  c.grain = Math.max(0, c.grain - t.grain);
  const ourBase = ourStrength(state, rng) * alliedReinforcement(state);
  const res = resolveRound({
    ourPower: ourBase,
    enemyStrength: c.enemyStrength,
    tactic,
    spread: c.intel === 'scouted' ? SPREAD_SCOUTED : SPREAD_UNSCOUTED,
    rng,
    multiplier: short ? GRAIN_SHORT_MULT : 1,
  });

  if (res.won) c.ourWins += 1;
  else c.enemyWins += 1;
  c.rounds.push({ round: c.round + 1, tactic, won: res.won, ours: res.ours, enemy: res.enemy, grain: c.grain, starved: short });
  c.round += 1;

  let finished = null;
  if (c.ourWins >= WINS_NEEDED || c.enemyWins >= WINS_NEEDED || c.round >= MAX_ROUNDS) {
    finished = finishCampaign(state, 'decided', applyEffects);
  }
  return { ok: true, round: c.rounds.at(-1), finished };
}

// 中途議和：至少打完一回合才能提議。結果確定（不擲骰）：好感 + 勝負差 * 15 + 粮草充足 5 分，達門檻即和談成功。
export function offerPeace(state, applyEffects = defaultApply) {
  const c = state.campaign;
  if (!c || c.status !== 'active') return { ok: false, reason: 'inactive' };
  if (c.round < 1) return { ok: false, reason: 'timing' };
  const attitude = c.neighborId ? diplomacyOf(state)[c.neighborId].attitude : 50;
  const score = attitude + 15 * (c.ourWins - c.enemyWins) + (c.grain >= 40 ? 5 : 0);
  const accepted = score >= PEACE_THRESHOLD;
  return { ok: true, accepted, finished: finishCampaign(state, accepted ? 'peace' : 'talks_failed', applyEffects) };
}

// 結算：寫入 state.wars、套用獎懲、更新好感，並清除 state.campaign。
export function finishCampaign(state, outcome, applyEffects = defaultApply) {
  const c = state.campaign;
  const won = c.ourWins > c.enemyWins;
  c.status = 'finished';
  c.outcome = outcome;

  let effects;
  if (won) effects = outcome === 'peace' ? scaleEffects(c.reward, 0.5) : c.reward;
  else effects = c.loss;
  applyEffects(state, effects);
  if (!won && outcome !== 'peace') applyEffects(state, { prestige: -3 });

  if (c.neighborId) {
    const d = diplomacyOf(state)[c.neighborId];
    const delta = outcome === 'peace' ? 10 : won ? -15 : -5;
    if (d) d.attitude = Math.max(0, Math.min(100, d.attitude + delta));
  }

  const powers = c.rounds.map((r) => r.ours);
  const avg = powers.length ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : 0;
  const record = recordWar(state, {
    strength: c.baseStrength,
    power: avg,
    won,
    mode: 'campaign',
    outcome,
    rounds: c.rounds.length,
    neighborId: c.neighborId,
  });
  state.campaign = null;
  return { won, outcome, record, campaign: c };
}

function scaleEffects(effects, k) {
  const out = {};
  for (const [key, v] of Object.entries(effects || {})) out[key] = typeof v === 'number' ? v * k : v;
  return out;
}

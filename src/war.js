// 戰爭決策制：比較己方戰力與敵方強度，加上隨機浮動。不做操作性玩法。
// 公式為 Phase 3 暫定，待模擬校準。

import { officeHolder } from './offices.js';
import { POLICIES } from './policy.js';

export function ourStrength(state, rng) {
  const commander = officeHolder(state, 'war');
  const martial = commander ? commander.abilities.martial : 0;
  const policy = POLICIES[state.policy];
  const base = state.stats.armament / 4 + state.stats.military * 1.5 + martial * 2.5;
  const roll = 0.8 + rng() * 0.4; // 0.8 – 1.2
  return base * roll * (policy ? policy.warStrength : 1);
}

// spec: { strength, reward, loss }；reward/loss 為 effects 物件
export function resolveWar(state, spec, rng, applyEffects) {
  const power = ourStrength(state, rng);
  const won = power >= spec.strength;
  const effects = won ? spec.reward : spec.loss;
  applyEffects(state, effects || {});
  if (!won) applyEffects(state, { prestige: -3 });
  state.wars.push({ turn: state.turn, strength: spec.strength, power: Math.round(power), won });
  return won;
}

// ---- Phase 9：多回合戰役的戰術與單回合結算（單擲路徑維持不變）----

// 三種戰術：power 為己方戰力倍率，enemy 為敵方強度倍率，grain 為每回合粮草消耗。
// ambush 為賭博型：gambleChance 機率大勝（gambleHit），否則失手（gambleMiss）。
export const TACTICS = Object.freeze({
  assault: { label: '強攻', power: 1.1, enemy: 1.0, grain: 45 },
  hold: { label: '堅守', power: 0.95, enemy: 0.93, grain: 20 },
  ambush: { label: '奇襲', power: 1.0, enemy: 1.0, grain: 30, gambleChance: 0.4, gambleHit: 1.6, gambleMiss: 0.9 },
});

// 敵方強度的不確定幅度：未偵察 ±20%，偵察後 ±8%。
export const SPREAD_UNSCOUTED = 0.2;
export const SPREAD_SCOUTED = 0.08;

// 單一回合結算。ourPower 由呼叫端先以 ourStrength 取得；rng 須為同一條確定性序列。
// multiplier 用於糧草不足等外部修正。回傳 { won, ours, enemy }（四捨五入後的戰力）。
export function resolveRound({ ourPower, enemyStrength, tactic, spread = SPREAD_UNSCOUTED, rng, multiplier = 1 }) {
  const t = TACTICS[tactic];
  if (!t) throw new Error(`unknown tactic: ${tactic}`);
  const mod = t.gambleChance !== undefined ? (rng() < t.gambleChance ? t.gambleHit : t.gambleMiss) : t.power;
  const ours = ourPower * mod * multiplier;
  const enemy = enemyStrength * t.enemy * (1 + (rng() * 2 - 1) * spread);
  return { won: ours >= enemy, ours: Math.round(ours), enemy: Math.round(enemy) };
}

// 寫入 state.wars，格式與單擲路徑相同（turn / strength / power / won），額外欄位可選。
export function recordWar(state, entry) {
  state.wars.push({ turn: state.turn, ...entry });
  return state.wars.at(-1);
}

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

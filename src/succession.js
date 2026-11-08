// 傳承：皇帝駕崩或禪讓後，由成年皇子繼位；國家狀態延續，皇帝個人狀態重置。
// 數值為 Phase 4 暫定，見 docs/specs/phase4-dynasty.md。

import { setStat } from './state.js';
import { makeRng } from './rng.js';

export const ADULT_AGE = 15;
const LEGACY_KEYS = ['literature', 'military', 'power', 'benevolence', 'prestige'];

export function heirStrength(heir) {
  return Object.values(heir.abilities).reduce((a, b) => a + b, 0);
}

export function createHeir(state, rng, { gender, mother }) {
  const roll = () => Math.round(40 + rng() * 20);
  const id = `h${state.dynasty.nextHeirId}`;
  state.dynasty.nextHeirId += 1;
  const heir = {
    id,
    name: `${gender === 'male' ? '皇子' : '皇女'}${id}`,
    gender,
    mother,
    age: 0,
    abilities: { intellect: roll(), politics: roll(), martial: roll(), command: roll(), virtue: roll() },
  };
  state.heirs.push(heir);
  return heir;
}

export function tryAccession(state) {
  if (state.alive) return false;
  state.chronicle.push({
    generation: state.dynasty.generation,
    endedInYear: state.year,
    age: state.age,
    endReason: state.endReason,
    wars: state.wars.filter((w) => w.won).length,
  });

  // 只有男性皇子可繼位
  const candidates = state.heirs.filter((h) => h.gender === 'male' && h.age >= ADULT_AGE);
  if (candidates.length === 0) {
    state.dynasty.ended = true;
    return false;
  }
  candidates.sort((a, b) => heirStrength(b) - heirStrength(a) || a.id.localeCompare(b.id));
  const heir = candidates[0];

  state.heirs = state.heirs.filter((h) => h !== heir);
  state.dynasty.generation += 1;
  state.alive = true;
  state.endReason = null;
  state.age = heir.age;
  state.emperor = { name: heir.name, abilities: heir.abilities };
  setStat(state, 'health', 70);
  setStat(state, 'charm', 120);
  for (const key of LEGACY_KEYS) setStat(state, key, state.stats[key] * 0.6);
  return true;
}

export function advanceHeirs(state) {
  for (const h of state.heirs) h.age += 1;
}

export function heirRng(seed, generation, nonce) {
  return makeRng([seed, 'heir', generation, nonce]);
}

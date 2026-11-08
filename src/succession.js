// 傳承：皇帝駕崩或禪讓後，由成年皇子繼位；國家狀態延續，皇帝個人狀態重置。
// 數值為 Phase 4 暫定，見 docs/specs/phase4-dynasty.md。

import { setStat } from './state.js';
import { makeRng } from './rng.js';

export const ADULT_AGE = 15;
const LEGACY_KEYS = ['literature', 'military', 'power', 'benevolence', 'prestige'];

// 幼子月死亡率（依年齡，0–4 歲；5 歲以上不受此項影響）。暫定值，見模擬校準。
export const CHILD_MORTALITY = [0.035, 0.014, 0.007, 0.0035, 0.0018];
// 奪嫡期間，最弱的成年皇子每月遭除名（薨逝或被貶）的機率。
export const RIVALRY_LOSS = 0.02;

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

  // 只有男性皇子可繼位；無合格皇子即為斷嗣，國祚終結
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

export function childMortalityRate(age) {
  return age >= 0 && age < CHILD_MORTALITY.length ? CHILD_MORTALITY[age] : 0;
}

function removeHeir(state, heir, cause) {
  state.heirs = state.heirs.filter((h) => h !== heir);
  state.chronicle.push({
    kind: 'heir_death',
    generation: state.dynasty.generation,
    year: state.year,
    month: state.month,
    heirId: heir.id,
    name: heir.name,
    age: heir.age,
    cause,
  });
}

// 每月皇嗣結算：幼子夭折，以及成年皇子 2 人以上時的奪嫡壓力。
// 所有隨機數皆由 (seed, 年, 月, 皇嗣 id) 決定，同一局永遠同樣結果。
export function tickHeirs(state) {
  const base = [state.seed, 'heirs', state.year, state.month];
  for (const h of [...state.heirs]) {
    const p = childMortalityRate(h.age);
    if (p > 0 && makeRng([...base, 'child', h.id])() < p) removeHeir(state, h, 'child_mortality');
  }

  const adults = state.heirs.filter((h) => h.gender === 'male' && h.age >= ADULT_AGE);
  state.dynasty.rivalry = adults.length >= 2;
  if (state.dynasty.rivalry) {
    const weakest = [...adults].sort((a, b) => heirStrength(a) - heirStrength(b) || a.id.localeCompare(b.id))[0];
    if (makeRng([...base, 'rivalry'])() < RIVALRY_LOSS) removeHeir(state, weakest, 'rivalry');
  }
}

export function heirRng(seed, generation, nonce) {
  return makeRng([seed, 'heir', generation, nonce]);
}

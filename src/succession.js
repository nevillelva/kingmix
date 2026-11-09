// 傳承：皇帝駕崩或禪讓後，由成年皇子繼位；國家狀態延續，皇帝個人狀態重置。
// 數值為 Phase 4 暫定，見 docs/specs/phase4-dynasty.md。

import { setStat } from './state.js';
import { makeRng } from './rng.js';
import { PERSONALITIES } from './people.js';

export const ADULT_AGE = 15;
const LEGACY_KEYS = ['literature', 'military', 'power', 'benevolence', 'prestige'];

// 幼子月死亡率（依年齡，0–4 歲；5 歲以上不受此項影響）。暫定值，見模擬校準。
export const CHILD_MORTALITY = [0.0175, 0.007, 0.0035, 0.00175, 0.0009];
// 幼兒疾病：0–4 歲皇子每月有機率患病，病中數月內夭折率加倍（倍數見下）。暫定值，見模擬校準。
export const CHILD_ILLNESS_CHANCE = 0.02;
export const CHILD_ILLNESS_MONTHS = 6;
export const CHILD_ILLNESS_MORTALITY_MULT = 2;
// 奪嫡期間，最弱的成年皇子每月遭除名（薨逝或被貶）的機率。
export const RIVALRY_LOSS = 0.02;
// 立太子：清流支持（勢力加成）；其餘派系官員警覺（忠誠下降）。暫定值。
export const CROWN_PRINCE_FACTION_BOOST = 3;
export const CROWN_PRINCE_ALARM = 2;

export function heirStrength(heir) {
  return Object.values(heir.abilities).reduce((a, b) => a + b, 0);
}

// 皇子個性：以獨立的 rng 路徑抽取（不消耗 createHeir 呼叫端的 rng），既有出生序列不受影響。
export function heirPersonality(seed, id) {
  const rng = makeRng([seed, 'heirPersonality', id]);
  return PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)].id;
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
    personality: heirPersonality(state.seed, id),
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
  // 已立太子者優先繼位，否則取最強者
  const heir = candidates.find((h) => h.id === state.dynasty.crownPrince) ?? candidates[0];

  state.heirs = state.heirs.filter((h) => h !== heir);
  state.dynasty.generation += 1;
  state.alive = true;
  state.endReason = null;
  state.age = heir.age;
  state.emperor = { name: heir.name, abilities: heir.abilities, traits: [...(heir.traits ?? [])] }; // 特質承自皇子（抓周所得）
  state.dynasty.crownPrince = null;
  state.dynasty.rivalrySince = null;
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
  if (state.dynasty.crownPrince === heir.id) state.dynasty.crownPrince = null;
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
    const p0 = childMortalityRate(h.age);
    if (p0 === 0) {
      delete h.ill;
      continue;
    }
    // 患病：獨立的 rng 路徑，不影響既有夭折序列；病況以剩餘月數記於 h.ill。
    if (!h.ill && makeRng([...base, 'illness', h.id])() < CHILD_ILLNESS_CHANCE) {
      h.ill = CHILD_ILLNESS_MONTHS;
      state.chronicle.push({
        kind: 'heir_illness', generation: state.dynasty.generation, year: state.year, month: state.month,
        heirId: h.id, name: h.name, age: h.age,
      });
    }
    const p = h.ill ? p0 * CHILD_ILLNESS_MORTALITY_MULT : p0;
    if (h.ill && --h.ill <= 0) delete h.ill;
    if (p > 0 && makeRng([...base, 'child', h.id])() < p) removeHeir(state, h, 'child_mortality');
  }

  const adults = state.heirs.filter((h) => h.gender === 'male' && h.age >= ADULT_AGE);
  const wasRival = state.dynasty.rivalry;
  state.dynasty.rivalry = adults.length >= 2;
  if (state.dynasty.rivalry && !wasRival) state.dynasty.rivalrySince = { year: state.year, month: state.month };
  if (!state.dynasty.rivalry) state.dynasty.rivalrySince = null;
  if (state.dynasty.rivalry) {
    // 太子不在奪嫡除名之列：除名對象為其餘成年皇子中最弱者
    const rivals = adults.filter((h) => h.id !== state.dynasty.crownPrince);
    const weakest = [...rivals].sort((a, b) => heirStrength(a) - heirStrength(b) || a.id.localeCompare(b.id))[0];
    if (weakest && makeRng([...base, 'rivalry'])() < RIVALRY_LOSS) removeHeir(state, weakest, 'rivalry');
  }
}

// 立太子：僅成年男性皇子可立。回傳是否成功。
export function designateCrownPrince(state, heirId) {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir || heir.gender !== 'male' || heir.age < ADULT_AGE) return false;
  state.dynasty.crownPrince = heir.id;
  state.factions.qingliu = Math.min(100, state.factions.qingliu + CROWN_PRINCE_FACTION_BOOST);
  for (const o of state.officials) {
    if (o.faction !== 'qingliu') o.loyalty = Math.max(0, o.loyalty - CROWN_PRINCE_ALARM);
  }
  return true;
}

// E125 選項 A 設定 flags.crown_choice_pending，由玩家於立儲面板自行選定（見 heirs-choice.js）。
// 本函式不再自動指定太子；僅在太子已選定後清除殘留旗標。待選旗標保留至選定為止。
export function tickCrownPrince(state) {
  if (state.dynasty.crownPrince) {
    delete state.flags.crown_choice_pending;
    delete state.flags.crown_prince_pending; // 舊版旗標
  }
  return state;
}

export function heirRng(seed, generation, nonce) {
  return makeRng([seed, 'heir', generation, nonce]);
}

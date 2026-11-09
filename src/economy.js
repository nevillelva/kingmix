// 稅制與州府：三級稅制影響國庫與民心（中為中性）；六州府各有知府與產業性質。
// 稅制增減量乘上行政效率（三派均衡時為 0.9）。數值為 Phase 10 暫定值。
// 知府即官員：六位知府列入 state.officials，各以 prefect:<州府 id> 官職任用（見 offices.js），可任免。

import { setStat } from './state.js';
import { makeRng } from './rng.js';
import { factionsBalanced, BALANCED_EFFICIENCY } from './factions.js';
import { FACTIONS } from './officials.js';
import { attachPerson } from './people.js';

export const TAX_TIERS = ['低', '中', '高'];
export const TAX_EFFECTS = {
  低: { people: 0.3, treasury: -3 },
  中: {},
  高: { treasury: 3, people: -0.3 },
};

export const PREFECTURE_DEFS = [
  { id: 'jingzhao', name: '京兆府', character: 'farming' },
  { id: 'hedong', name: '河東府', character: 'farming' },
  { id: 'yizhou', name: '益州府', character: 'farming' },
  { id: 'jiangning', name: '江寧府', character: 'trade' },
  { id: 'yangzhou', name: '揚州府', character: 'trade' },
  { id: 'denglai', name: '登萊府', character: 'trade' },
];

// 州府產出：每月依 yield（知府政績）換算入庫與民生。yield 1.0 為中性（政治 40）。
export const YIELD_TREASURY = 0.05; // 每單位 yield 每月入庫
export const YIELD_PEOPLE = 0.01; // 每單位 yield 高於 1 的部分，每月民心
export const VACANT_YIELD = 0.5; // 知府缺位時的產出倍率（比照戶部空缺的行政損失）

const SURNAMES = ['周', '吳', '鄭', '王', '李', '趙', '沈', '陸', '顧', '魏'];
const GIVEN = ['文昭', '景明', '守仁', '敬之', '元禮', '子安', '允中', '茂才', '廷芳', '彥博'];

export const prefectOfficeKey = (prefId) => `prefect:${prefId}`;
export const governorId = (prefId) => `gov_${prefId}`;

// 知府（官員記錄）：依 (seed, 州府 id) 決定，同一局永遠同一人。
export function createGovernorOfficial(seed, def) {
  const rng = makeRng([seed, 'governor', def.id]);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const name = pick(SURNAMES) + pick(GIVEN);
  const roll = () => Math.round(40 + rng() * 40);
  const abilities = { intellect: roll(), politics: roll(), martial: roll(), command: roll(), virtue: roll() };
  const loyalty = Math.round(40 + rng() * 50);
  const ambition = Math.round(5 + rng() * 65);
  const faction = FACTIONS[Math.floor(rng() * FACTIONS.length)];
  const gov = {
    id: governorId(def.id),
    name,
    abilities,
    loyalty,
    ambition,
    faction,
    office: prefectOfficeKey(def.id),
    prefecture: def.id,
  };
  attachPerson(seed, gov); // 年齡、特質（決定性，以 id 為準）
  gov.personName = name; // 知府姓名即州府紀錄上的姓名
  return gov;
}

export function createPrefectures(seed) {
  return PREFECTURE_DEFS.map((def) => {
    const gov = createGovernorOfficial(seed, def);
    return {
      ...def,
      governor: { id: gov.id, name: gov.name, abilities: { intellect: gov.abilities.intellect, politics: gov.abilities.politics, virtue: gov.abilities.virtue } },
      output: def.character === 'farming' ? 'agriculture' : 'commerce',
      yield: 0,
    };
  });
}

// 將知府併入官員名單（已存在者略過）；新局與舊存檔皆適用。
export function attachGovernors(state) {
  for (const def of PREFECTURE_DEFS) {
    const id = governorId(def.id);
    if (state.officials.some((o) => o.id === id)) continue;
    state.officials.push(createGovernorOfficial(state.seed, def));
  }
  return state.officials;
}

// 懶初始化：不改動稅制預設（中）；州府建立時一併把知府併入官員名單。
export function ensureEconomy(state) {
  if (!state.economy) state.economy = { tax: '中', efficiency: 1 };
  if (!state.prefectures) state.prefectures = createPrefectures(state.seed);
  attachGovernors(state);
  return state.economy;
}

// 州府現任知府（官員記錄）；缺位時為 null。
export function governorOf(state, pref) {
  return state.officials.find((o) => o.office === prefectOfficeKey(pref.id)) ?? null;
}

export function setTaxTier(state, tier) {
  if (!TAX_TIERS.includes(tier)) throw new Error(`unknown tax tier: ${tier}`);
  ensureEconomy(state).tax = tier;
  return state;
}

export function administrativeEfficiency(state) {
  return factionsBalanced(state.factions) ? BALANCED_EFFICIENCY : 1;
}

// 每月結算：稅制增減（中為零）；州府產出依現任知府政績與產業性質計算，記入州府紀錄。
export function tickEconomy(state) {
  const econ = ensureEconomy(state);
  econ.efficiency = administrativeEfficiency(state);
  const scale = econ.tax === '中' ? 1 : econ.efficiency;
  for (const [key, delta] of Object.entries(TAX_EFFECTS[econ.tax])) {
    const next = state.stats[key] + delta * scale;
    setStat(state, key, next, { silent: true });
  }

  for (const pref of state.prefectures) {
    const gov = governorOf(state, pref);
    // governor 為 UI 用的快照；缺位時為 null。產出以現任知府的政治能力計。
    pref.governor = gov
      ? { id: gov.id, name: gov.name, abilities: { intellect: gov.abilities.intellect, politics: gov.abilities.politics, virtue: gov.abilities.virtue } }
      : null;
    pref.yield = gov ? Math.round((gov.abilities.politics / 40) * 100) / 100 : VACANT_YIELD;
  }
  return state;
}

// 州府產出結算（與 tickEconomy 分開，tickEconomy 本身不改動數值）。
export function applyPrefectureYield(state) {
  ensureEconomy(state);
  for (const pref of state.prefectures) {
    setStat(state, 'treasury', state.stats.treasury + pref.yield * YIELD_TREASURY, { silent: true });
    setStat(state, 'people', state.stats.people + (pref.yield - 1) * YIELD_PEOPLE, { silent: true });
  }
  return state;
}

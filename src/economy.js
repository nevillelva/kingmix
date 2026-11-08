// 稅制與州府：三級稅制影響國庫與民心（中為中性）；六州府各有知府與產業性質。
// 稅制增減量乘上行政效率（三派均衡時為 0.9）。數值為 Phase 10 暫定值。

import { setStat } from './state.js';
import { makeRng } from './rng.js';
import { factionsBalanced, BALANCED_EFFICIENCY } from './factions.js';

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

const SURNAMES = ['周', '吳', '鄭', '王', '李', '趙', '沈', '陸', '顧', '魏'];
const GIVEN = ['文昭', '景明', '守仁', '敬之', '元禮', '子安', '允中', '茂才', '廷芳', '彥博'];

// 知府：依 (seed, 州府 id) 決定，同一局永遠同一人。
export function createGovernor(seed, pref) {
  const rng = makeRng([seed, 'governor', pref.id]);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const roll = () => Math.round(40 + rng() * 40);
  return {
    name: pick(SURNAMES) + pick(GIVEN),
    abilities: { intellect: roll(), politics: roll(), virtue: roll() },
  };
}

export function createPrefectures(seed) {
  return PREFECTURE_DEFS.map((def) => ({
    ...def,
    governor: createGovernor(seed, def),
    output: def.character === 'farming' ? 'agriculture' : 'commerce',
    yield: 0,
  }));
}

// 懶初始化：不改動 createInitialState，預設狀態即為稅制中、行為與主線相同。
export function ensureEconomy(state) {
  if (!state.economy) state.economy = { tax: '中', efficiency: 1 };
  if (!state.prefectures) state.prefectures = createPrefectures(state.seed);
  return state.economy;
}

export function setTaxTier(state, tier) {
  if (!TAX_TIERS.includes(tier)) throw new Error(`unknown tax tier: ${tier}`);
  ensureEconomy(state).tax = tier;
  return state;
}

export function administrativeEfficiency(state) {
  return factionsBalanced(state.factions) ? BALANCED_EFFICIENCY : 1;
}

// 每月結算：稅制增減（中為零）；州府產出依知府政績與產業性質計算，記入州府紀錄。
export function tickEconomy(state) {
  const econ = ensureEconomy(state);
  econ.efficiency = administrativeEfficiency(state);
  const scale = econ.tax === '中' ? 1 : econ.efficiency;
  for (const [key, delta] of Object.entries(TAX_EFFECTS[econ.tax])) {
    const next = state.stats[key] + delta * scale;
    setStat(state, key, next, { silent: true });
  }

  for (const pref of state.prefectures) {
    pref.yield = Math.round((pref.governor.abilities.politics / 40) * 100) / 100;
  }
  return state;
}

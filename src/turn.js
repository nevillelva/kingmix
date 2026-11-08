// 套用選項效果、每月結算、推進時間。

import { setStat, FACTION_BASE } from './state.js';
import { makeRng } from './rng.js';
import { officeHolder } from './offices.js';
import { generateOfficial } from './officials.js';
import { openInvestigationOnLowest, tickDongchang } from './dongchang.js';
import { POLICIES } from './policy.js';
import { resolveWar } from './war.js';

const MAX_OFFICIALS = 12;

function lowestLoyaltyOfficial(officials) {
  let best = null;
  for (const o of officials) if (!best || o.loyalty < best.loyalty) best = o;
  return best;
}

// 移除官員：同時清除其官職、關閉其東廠案件、派系勢力微降。
export function removeOfficial(state, official) {
  const idx = state.officials.indexOf(official);
  if (idx === -1) return;
  state.officials.splice(idx, 1);
  official.office = null;
  state.factions[official.faction] = Math.max(0, state.factions[official.faction] - 2);
  for (const c of state.dongchang.cases) {
    if (c.officialId === official.id && c.status !== 'closed') {
      c.status = 'closed';
      c.outcome = 'removed';
    }
  }
}

export function applyOption(state, option, rng = makeRng(['option', state.turn])) {
  applyEffectsOnly(state, option.effects || {}, rng);
  return state;
}

function applyEffectsOnly(state, effects, rng) {
  for (const [key, val] of Object.entries(effects)) {
    if (key === 'removeOfficial') {
      if (val) {
        const target = lowestLoyaltyOfficial(state.officials);
        if (target) removeOfficial(state, target);
      }
    } else if (key === 'official_loyalty_add') {
      const target = lowestLoyaltyOfficial(state.officials);
      if (target) target.loyalty = Math.min(100, Math.max(0, target.loyalty + val));
    } else if (key === 'population_pct') {
      setStat(state, 'population', state.stats.population * (1 + val / 100));
    } else if (key === 'setFlag') {
      state.flags[val] = true;
    } else if (key === 'war') {
      resolveWar(state, val, rng, (st, eff) => applyEffectsOnly(st, eff, rng));
    } else if (key === 'investigate_lowest') {
      if (val) openInvestigationOnLowest(state);
    } else if (key === 'recruit') {
      for (let i = 0; i < val && state.officials.length < MAX_OFFICIALS; i++) {
        const id = `r${state.turn}_${i}`;
        const base = 30 + Math.round(state.stats.literature / 10);
        state.officials.push(
          generateOfficial(rng, id, { name: `進士${state.year}-${i + 1}`, base, span: 40 }),
        );
      }
    } else {
      setStat(state, key, state.stats[key] + val);
    }
  }
}

function applyPolicyEffects(state) {
  const policy = POLICIES[state.policy];
  if (!policy) return;
  for (const [key, val] of Object.entries(policy.monthly)) {
    setStat(state, key, state.stats[key] + val);
  }
}

function applyOfficeEffects(state) {
  const g = (k) => state.stats[k];
  const revenue = officeHolder(state, 'revenue');
  if (revenue) {
    setStat(state, 'treasury', g('treasury') + revenue.abilities.politics / 40);
  } else {
    setStat(state, 'treasury', g('treasury') - 3); // 戶部空缺：每月效率損失
  }
  const works = officeHolder(state, 'works');
  if (works) setStat(state, 'armament', g('armament') + works.abilities.intellect / 200);
}

// 每月結算（Phase 2 暫定公式，待無頭模擬校準）
export function monthlyTick(state, rng) {
  const r = rng ?? makeRng(['tick', state.turn]);
  const g = (k) => state.stats[k];

  setStat(state, 'treasury', g('treasury') + Math.round((g('agriculture') + g('commerce')) / 60) - 12);
  setStat(state, 'people', g('people') + (g('benevolence') - 150) / 300);
  setStat(state, 'agriculture', g('agriculture') + (g('people') > 50 ? 0.5 : -0.5));
  setStat(state, 'population', g('population') * (1 + 0.001 * (g('people') / 60 - 1)));
  setStat(state, 'health', g('health') - 0.1);
  setStat(state, 'charm', g('charm') + (g('health') >= 50 ? 1.5 : 0)); // 後宮成長（暫定）

  applyOfficeEffects(state);
  applyPolicyEffects(state);

  // 派系勢力影響官員忠誠：勢力高於中性則忠誠微升，低於則微降
  for (const o of state.officials) {
    const influence = state.factions[o.faction];
    o.loyalty = Math.min(100, Math.max(0, o.loyalty + (influence - FACTION_BASE) / 100));
  }

  tickDongchang(state, r);

  if (g('health') <= 0) {
    state.alive = false;
    state.endReason = 'death';
  }
  return state;
}

export function advanceMonth(state) {
  state.turn += 1;
  state.month += 1;
  if (state.month > 12) {
    state.month = 1;
    state.year += 1;
    state.age += 1;
  }
  if (state.alive && state.age >= 62) {
    state.alive = false;
    state.endReason = 'abdicated';
  }
  return state;
}

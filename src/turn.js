// 套用選項效果、每月結算、推進時間。

import { setStat } from './state.js';

function lowestLoyaltyOfficial(officials) {
  let best = null;
  for (const o of officials) if (!best || o.loyalty < best.loyalty) best = o;
  return best;
}

export function applyOption(state, option) {
  for (const [key, val] of Object.entries(option.effects || {})) {
    if (key === 'removeOfficial') {
      if (val) {
        const target = lowestLoyaltyOfficial(state.officials);
        if (target) state.officials.splice(state.officials.indexOf(target), 1);
      }
    } else if (key === 'official_loyalty_add') {
      const target = lowestLoyaltyOfficial(state.officials);
      if (target) target.loyalty = Math.min(100, Math.max(0, target.loyalty + val));
    } else if (key === 'population_pct') {
      setStat(state, 'population', state.stats.population * (1 + val / 100));
    } else if (key === 'setFlag') {
      state.flags[val] = true;
    } else {
      setStat(state, key, state.stats[key] + val);
    }
  }
  return state;
}

// 每月結算（Phase 1 暫定公式，待無頭模擬校準）
export function monthlyTick(state) {
  const g = (k) => state.stats[k];
  setStat(state, 'treasury', g('treasury') + Math.round((g('agriculture') + g('commerce')) / 60) - 12);
  setStat(state, 'people', g('people') + (g('benevolence') - 150) / 300);
  setStat(state, 'agriculture', g('agriculture') + (g('people') > 50 ? 0.5 : -0.5));
  setStat(state, 'population', g('population') * (1 + 0.001 * (g('people') / 60 - 1)));
  setStat(state, 'health', g('health') - 0.1);
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

// 派系壓力：勢力超過 50 的派系會逼迫朝廷採其國策；三派皆強則官員忠誠額外流失；
// 三派均衡則行政效率下降（效率只作用於稅制的增減量，見 economy.js）。
// 門檻為 Phase 10 暫定值，待模擬校準。

import { POLICIES } from './policy.js';

export const FACTION_FORCE_THRESHOLD = 50; // 勢力高於此值即逼迫國策
export const FORCE_MONTHS = 6; // 持續高於門檻的月數，才真正改變國策（避免一時波動）
export const FACTION_STRONG = 40; // 三派皆達此值，視為「三派並立」
export const BALANCE = { min: 25, max: 45, spread: 8 }; // 均衡：三派皆在區間內且差距不超過 spread
export const BALANCED_EFFICIENCY = 0.9;
export const THREE_STRONG_LOYALTY_DRAIN = 0.1;

// 派系所偏好的國策（逼迫時採用）
export const FACTION_POLICY = { qingliu: 'confucian', xunggui: 'commerce', hanmen: 'militarist' };

export function factionsBalanced(factions) {
  const vals = Object.values(factions);
  if (vals.length < 3) return false;
  const inBand = vals.every((v) => v >= BALANCE.min && v <= BALANCE.max);
  return inBand && Math.max(...vals) - Math.min(...vals) <= BALANCE.spread;
}

export function strongFactionCount(factions) {
  return Object.values(factions).filter((v) => v >= FACTION_STRONG).length;
}

// 回傳勢力最高且超過門檻的派系 id；無則 null
export function forcingFaction(factions) {
  let best = null;
  for (const [id, v] of Object.entries(factions)) {
    if (v > FACTION_FORCE_THRESHOLD && (!best || v > factions[best])) best = id;
  }
  return best;
}

function ensurePressure(state) {
  if (!state.factionPressure) state.factionPressure = { forcedFaction: null, forcedMonths: 0, forcedPolicies: [] };
  return state.factionPressure;
}

// 每月結算：逼迫國策（持續累計）與三派並立的忠誠流失。
export function applyFactionPressure(state) {
  const p = ensurePressure(state);
  const faction = forcingFaction(state.factions);
  p.forcedFaction = faction;
  if (faction) {
    p.forcedMonths += 1;
    const target = FACTION_POLICY[faction];
    if (p.forcedMonths >= FORCE_MONTHS && target && POLICIES[target] && state.policy !== target) {
      p.forcedPolicies.push({ turn: state.turn, faction, from: state.policy, to: target });
      state.policy = target;
      p.forcedMonths = 0;
    }
  } else {
    p.forcedMonths = 0;
  }

  if (strongFactionCount(state.factions) === 3) {
    for (const o of state.officials) {
      o.loyalty = Math.max(0, o.loyalty - THREE_STRONG_LOYALTY_DRAIN);
    }
  }
  return state;
}

// 派系打壓（與拉攏對稱）：所打壓之派 -10，其他兩派各 +5；勢力限制於 0–100。
export const SUPPRESS_TARGET_DELTA = -10;
export const SUPPRESS_OTHER_DELTA = 5;

export function suppressFaction(state, id) {
  if (!(id in state.factions)) throw new Error(`unknown faction: ${id}`);
  for (const k of Object.keys(state.factions)) {
    const delta = k === id ? SUPPRESS_TARGET_DELTA : SUPPRESS_OTHER_DELTA;
    state.factions[k] = Math.min(100, Math.max(0, state.factions[k] + delta));
  }
  return state;
}

// 拉攏（與打壓對稱）：所拉攏之派 +10，其他兩派各 -5；勢力限制於 0–100。
export const RALLY_TARGET_DELTA = 10;
export const RALLY_OTHER_DELTA = -5;

export function rallyFaction(state, id) {
  if (!(id in state.factions)) throw new Error(`unknown faction: ${id}`);
  for (const k of Object.keys(state.factions)) {
    const delta = k === id ? RALLY_TARGET_DELTA : RALLY_OTHER_DELTA;
    state.factions[k] = Math.min(100, Math.max(0, state.factions[k] + delta));
  }
  return state;
}

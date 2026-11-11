// 君臣羈絆：同一官員與皇帝共歷 2 件事件後，解鎖「君臣相得」。
// 相得的官員忠誠不再每月流失；進諫時仍有風險殞命。數值為暫定。
// 注意：事件本身不帶官員 ID，共歷事件須由呼叫端明確 recordSharedEvent。

import { BALANCE } from './balance.js';

export const BOND_NAME = '君臣相得';
export const BOND_THRESHOLD = BALANCE.BOND_THRESHOLD;
export const REMONSTRATE_DEATH_CHANCE = 0.25;

function ensureBonds(state) {
  state.bonds = state.bonds || { shared: {}, unlocked: {} };
  return state.bonds;
}

// 記錄一次共歷事件；回傳 true 表示此次剛好解鎖。
export function recordSharedEvent(state, officialId, eventId) {
  if (!state.officials.some((o) => o.id === officialId)) return false;
  const b = ensureBonds(state);
  b.shared[officialId] = b.shared[officialId] || [];
  b.shared[officialId].push(eventId);
  if (!b.unlocked[officialId] && b.shared[officialId].length >= BOND_THRESHOLD) {
    b.unlocked[officialId] = true;
    return true;
  }
  return false;
}

export function sharedCount(state, officialId) {
  return state.bonds?.shared[officialId]?.length ?? 0;
}

export function isBonded(state, officialId) {
  return state.bonds?.unlocked[officialId] === true;
}

// turn.js 月結時以此判斷是否跳過忠誠流失。
export function isLoyaltyFrozen(state, official) {
  return isBonded(state, official.id);
}

// 進諫：相得的官員有機率殞命（被貶除名）。未相得者回傳 null，不消耗 rng。
export function remonstrate(state, officialId, rng) {
  if (!isBonded(state, officialId)) return null;
  if (!(rng() < REMONSTRATE_DEATH_CHANCE)) return { died: false };
  const idx = state.officials.findIndex((o) => o.id === officialId);
  const [official] = state.officials.splice(idx, 1);
  official.office = null;
  state.factions[official.faction] = Math.max(0, state.factions[official.faction] - 2);
  for (const c of state.dongchang.cases) {
    if (c.officialId === officialId && c.status !== 'closed') {
      c.status = 'closed';
      c.outcome = 'removed';
    }
  }
  return { died: true };
}

// 玩家立儲：由朝政行動「立儲」選定太子。引擎規則沿用 succession.js（登基優先、死亡清空、奪嫡保護）。
// 首次立太子免費（同 E125 選項 A 的效果）；改立則耗威儀，並使新舊太子所屬派系支持互換。

import { setStat } from './state.js';
import { ADULT_AGE, designateCrownPrince } from './succession.js';

export const CHANGE_CROWN_PRINCE_PRESTIGE_COST = 1;
export const CROWN_PRINCE_SWAP_SHIFT = 3;

// 可被選為太子的皇子：存活、男性、成年。依年齡由長至幼排列，同齡依 id。
export function eligibleCrownHeirs(state) {
  return state.heirs
    .filter((h) => h.gender === 'male' && h.age >= ADULT_AGE)
    .sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));
}

// 皇子的所屬派系取自其生母（後妃）的家族派系；無生母者為 null。
export function heirFaction(state, heir) {
  if (!heir || !heir.mother) return null;
  return state.consorts.find((c) => c.id === heir.mother)?.family ?? null;
}

function shiftFaction(state, faction, delta) {
  if (!faction || !(faction in state.factions)) return;
  state.factions[faction] = Math.min(100, Math.max(0, state.factions[faction] + delta));
}

// 回傳 { ok, reason }；失敗時不改動任何狀態。
export function chooseCrownPrince(state, heirId) {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir || !eligibleCrownHeirs(state).includes(heir)) return { ok: false, reason: 'ineligible' };

  const current = state.dynasty.crownPrince;
  if (!current) {
    designateCrownPrince(state, heir.id);
    delete state.flags.crown_prince_pending;
    return { ok: true, changed: false };
  }
  if (current === heir.id) return { ok: false, reason: 'same' };
  if (state.stats.prestige < CHANGE_CROWN_PRINCE_PRESTIGE_COST) return { ok: false, reason: 'prestige' };

  const oldFaction = heirFaction(state, state.heirs.find((h) => h.id === current));
  const newFaction = heirFaction(state, heir);
  setStat(state, 'prestige', state.stats.prestige - CHANGE_CROWN_PRINCE_PRESTIGE_COST);
  shiftFaction(state, oldFaction, -CROWN_PRINCE_SWAP_SHIFT);
  shiftFaction(state, newFaction, CROWN_PRINCE_SWAP_SHIFT);
  state.dynasty.crownPrince = heir.id;
  delete state.flags.crown_prince_pending;
  return { ok: true, changed: true };
}

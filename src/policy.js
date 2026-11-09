import { setStat } from './state.js';

// 國策：開局選定一種施政流派，每月提供固定修正。流派為 Phase 3 暫定設計。

export const POLICIES = {
  agrarian: {
    name: '重農',
    monthly: { agriculture: 0.5, people: 0.1 },
    warStrength: 1.0,
  },
  commerce: {
    name: '重商',
    monthly: { commerce: 0.8, treasury: 5, people: -0.1 },
    warStrength: 1.0,
  },
  militarist: {
    name: '黷武',
    monthly: { armament: 1, people: -0.2 },
    warStrength: 1.1,
  },
  confucian: {
    name: '儒術',
    monthly: { benevolence: 0.5, heaven: 0.05 },
    warStrength: 0.9,
  },
};

export const POLICY_KEYS = Object.keys(POLICIES);

// 換策代價：每次換策扣威儀 1 點，換策後 12 個月內不可再換。
// 開局選定的國策不算「換策」，故免費（policyMeta.lastChangeTurn 仍為 null）。
// 派系逼迫造成的國策變更不經此函式，不受代價與鎖定限制（見 factions.js）。
export const POLICY_CHANGE_PRESTIGE_COST = 1;
export const POLICY_LOCK_TURNS = 12;

export function policyLockRemaining(state) {
  const last = state.policyMeta?.lastChangeTurn;
  if (last === null || last === undefined) return 0;
  return Math.max(0, POLICY_LOCK_TURNS - (state.turn - last));
}

// 回傳 { ok, reason }；失敗時不改動任何狀態。
export function changePolicy(state, key) {
  if (!POLICIES[key]) return { ok: false, reason: 'unknown' };
  if (key === state.policy) return { ok: false, reason: 'same' };
  const remaining = policyLockRemaining(state);
  if (remaining > 0) return { ok: false, reason: 'locked', remaining };
  if (state.stats.prestige < POLICY_CHANGE_PRESTIGE_COST) return { ok: false, reason: 'prestige' };
  setStat(state, 'prestige', state.stats.prestige - POLICY_CHANGE_PRESTIGE_COST);
  state.policy = key;
  const meta = state.policyMeta || { lastChangeTurn: null, changes: 0 };
  state.policyMeta = { lastChangeTurn: state.turn, changes: meta.changes + 1 };
  return { ok: true };
}

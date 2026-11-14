import { setStat } from './state.js';
import { cardMonthlyEffects } from './cards.js';

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

// 即位國策（方案：即位時選 1–2 條）。第一條為主策（state.policy，沿用既有換策與逼迫規則）；
// 第二條為輔策（state.policySecondary），其月修正以 SECONDARY_POLICY_WEIGHT 折算。
// 權重為暫定值，已以無頭模擬校準（見 docs 校準紀錄 / PR 說明）：
// 0.1 為校準集（big1..200）最佳，驗證集（hold1..200）與補充集（ext1..200）通過全部指標。
// 0.5 在驗證集與補充集皆使承續軸稱號跌破 15%、仁德軸超過 35%。僅選一條時與舊行為完全相同。
export const ACCESSION_POLICY_MAX = 2;
export const SECONDARY_POLICY_WEIGHT = 0.1;

// 開局設定國策；keys 須為 1–2 條不重複的既有國策。失敗時不改動狀態。
export function setAccessionPolicies(state, keys) {
  const list = [...new Set(keys)];
  if (list.length < 1 || list.length > ACCESSION_POLICY_MAX) return { ok: false, reason: 'count' };
  if (list.some((k) => !POLICIES[k])) return { ok: false, reason: 'unknown' };
  state.policy = list[0];
  state.policySecondary = list[1] ?? null;
  return { ok: true };
}

// 當月生效的國策修正（主策全額、輔策折算）。
export function activeMonthly(state) {
  const out = {};
  const add = (pol, w) => {
    for (const [k, v] of Object.entries(pol.monthly)) out[k] = (out[k] || 0) + v * w;
  };
  const main = POLICIES[state.policy];
  if (main) add(main, 1);
  const sec = state.policySecondary ? POLICIES[state.policySecondary] : null;
  if (sec && state.policySecondary !== state.policy) add(sec, SECONDARY_POLICY_WEIGHT);
  // 策卡槽與協同加成（無卡時為空，既有數值不變）
  for (const [k, v] of Object.entries(cardMonthlyEffects(state))) out[k] = (out[k] || 0) + v;
  return out;
}

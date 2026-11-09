import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { POLICIES, setAccessionPolicies, activeMonthly, SECONDARY_POLICY_WEIGHT, changePolicy } from '../src/policy.js';

test('即位國策：可選 1–2 條，超過或未知則拒絕且不改動狀態', () => {
  const st = createInitialState('pol-1');
  assert.deepEqual(setAccessionPolicies(st, []), { ok: false, reason: 'count' });
  assert.deepEqual(setAccessionPolicies(st, ['agrarian', 'commerce', 'confucian']), { ok: false, reason: 'count' });
  assert.deepEqual(setAccessionPolicies(st, ['nope']), { ok: false, reason: 'unknown' });
  assert.equal(st.policy, 'agrarian');
  assert.equal(st.policySecondary, undefined);
});

test('即位國策：第一條為主策，第二條為輔策；重複選項會去重', () => {
  const st = createInitialState('pol-2');
  assert.deepEqual(setAccessionPolicies(st, ['commerce', 'confucian']), { ok: true });
  assert.equal(st.policy, 'commerce');
  assert.equal(st.policySecondary, 'confucian');
  setAccessionPolicies(st, ['militarist', 'militarist']);
  assert.equal(st.policy, 'militarist');
  assert.equal(st.policySecondary, null);
});

test('國策修正：僅選一條時與原本主策修正完全相同（不影響既有模擬）', () => {
  const st = createInitialState('pol-3');
  assert.deepEqual(activeMonthly(st), { ...POLICIES.agrarian.monthly });
});

test('國策修正：輔策依權重折算並與主策相加', () => {
  const st = createInitialState('pol-4');
  setAccessionPolicies(st, ['commerce', 'militarist']);
  const m = activeMonthly(st);
  assert.equal(m.treasury, POLICIES.commerce.monthly.treasury);
  assert.equal(m.armament, POLICIES.militarist.monthly.armament * SECONDARY_POLICY_WEIGHT);
  assert.equal(m.people, POLICIES.commerce.monthly.people + POLICIES.militarist.monthly.people * SECONDARY_POLICY_WEIGHT);
});

test('國策：首次開局選定免費，之後換策依既有規則（扣威儀、鎖定）', () => {
  const st = createInitialState('pol-5');
  setAccessionPolicies(st, ['agrarian', 'confucian']);
  assert.equal(st.policyMeta.lastChangeTurn, null);
  const p0 = st.stats.prestige;
  assert.equal(changePolicy(st, 'commerce').ok, true);
  assert.equal(st.stats.prestige, p0 - 1);
  assert.equal(changePolicy(st, 'militarist').reason, 'locked');
});

test('第二國策比例：權重為校準後的 0.1，且輔策修正恰為主策同項目的 0.1 倍', () => {
  assert.equal(SECONDARY_POLICY_WEIGHT, 0.1);
  const st = createInitialState('pol-6');
  setAccessionPolicies(st, ['agrarian', 'commerce']);
  const m = activeMonthly(st);
  assert.ok(Math.abs(m.treasury - POLICIES.commerce.monthly.treasury * 0.1) < 1e-12);
  assert.ok(Math.abs(m.agriculture - POLICIES.agrarian.monthly.agriculture) < 1e-12);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import {
  openInvestigation, openInvestigationOnLowest, applyDongchangAction, applyTyrannyDrift, addTyranny,
  MAX_ACTIVE_CASES, TYRANNY_MAX, TYRANNY_QINGLIU_THRESHOLD,
} from '../src/dongchang.js';
import { changePolicy, policyLockRemaining, POLICY_LOCK_TURNS } from '../src/policy.js';
import { POLICIES, POLICY_KEYS } from '../src/policy.js';
import { suppressFaction, SUPPRESS_TARGET_DELTA, SUPPRESS_OTHER_DELTA } from '../src/factions.js';
import { isEligible } from '../src/events.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { runSimulation } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = (id) => events.find((e) => e.id === id);
const fixed = (v) => () => v;

// 建立一件已進入把柄階段的案件（DC1），對象為 o3
function leverageCase(seed = 'gap') {
  const s = createInitialState(seed);
  openInvestigation(s, 'o3');
  advanceMonth(s);
  // 讓 o3 的案件進入 leverage
  s.dongchang.cases[0].status = 'leverage';
  s.dongchang.cases[0].level = 2;
  return s;
}

// ---- 1. 東廠暴政累積 ----

test('punish accumulates tyranny', () => {
  const s = leverageCase();
  assert.equal(s.tyranny, 0);
  applyDongchangAction(s, 'DC1', 'punish');
  assert.equal(s.tyranny, 5);
});

test('prison accumulates tyranny', () => {
  const s = leverageCase();
  applyDongchangAction(s, 'DC1', 'prison');
  assert.equal(s.tyranny, 4);
});

test('warn does not accumulate tyranny', () => {
  const s = leverageCase();
  applyDongchangAction(s, 'DC1', 'warn');
  assert.equal(s.tyranny, 0);
});

test('tyranny is capped at TYRANNY_MAX', () => {
  const s = createInitialState('cap');
  addTyranny(s, TYRANNY_MAX + 50);
  assert.equal(s.tyranny, TYRANNY_MAX);
  addTyranny(s, -500);
  assert.equal(s.tyranny, 0);
});

test('tyranny below the threshold leaves qingliu unchanged', () => {
  const s = createInitialState('tyr');
  s.tyranny = TYRANNY_QINGLIU_THRESHOLD - 1;
  const before = s.factions.qingliu;
  applyTyrannyDrift(s);
  assert.equal(s.factions.qingliu, before);
});

test('tyranny at or above the threshold drains qingliu each month', () => {
  const s = createInitialState('tyr');
  s.tyranny = TYRANNY_QINGLIU_THRESHOLD;
  const before = s.factions.qingliu;
  applyTyrannyDrift(s);
  assert.equal(s.factions.qingliu, before - 1);
});

test('qingliu drift is floored at zero', () => {
  const s = createInitialState('tyr');
  s.tyranny = 100;
  s.factions.qingliu = 0;
  applyTyrannyDrift(s);
  assert.equal(s.factions.qingliu, 0);
});

test('monthlyTick applies the tyranny drift to qingliu', () => {
  const s = createInitialState('tick');
  s.tyranny = 80;
  s.factions.qingliu = 50;
  monthlyTick(s, makeRng(['t']));
  // 派系月結可能另有微調，但清流至少不會因高暴政而回升到 50 以上
  assert.ok(s.factions.qingliu < 50);
});

test('tyranny_gt and tyranny_lt conditions gate events', () => {
  const s = createInitialState('cond');
  const ev = { when: { tyranny_gt: 50 } };
  s.tyranny = 50;
  assert.equal(isEligible(s, ev, fixed(0)), false);
  s.tyranny = 51;
  assert.equal(isEligible(s, ev, fixed(0)), true);
  assert.equal(isEligible(s, { when: { tyranny_lt: 10 } }, fixed(0)), false);
});

test('assassination events E305 (>40) and E306 (>50) require high tyranny', () => {
  const s = createInitialState('assn');
  assert.equal(isEligible(s, byId('E305'), fixed(0)), false);
  assert.equal(isEligible(s, byId('E306'), fixed(0)), false);
  s.tyranny = 41;
  assert.equal(isEligible(s, byId('E305'), fixed(0)), true);
  assert.equal(isEligible(s, byId('E306'), fixed(0)), false);
  s.tyranny = 51;
  assert.equal(isEligible(s, byId('E306'), fixed(0)), true);
});

// ---- 2. 派系打壓 ----

test('suppressFaction lowers the target by 10 and raises the others by 5', () => {
  const s = createInitialState('sup');
  s.factions = { qingliu: 40, xunggui: 30, hanmen: 30 };
  suppressFaction(s, 'qingliu');
  assert.equal(s.factions.qingliu, 40 + SUPPRESS_TARGET_DELTA);
  assert.equal(s.factions.xunggui, 30 + SUPPRESS_OTHER_DELTA);
  assert.equal(s.factions.hanmen, 30 + SUPPRESS_OTHER_DELTA);
});

test('suppressFaction clamps within 0 to 100', () => {
  const s = createInitialState('sup');
  s.factions = { qingliu: 5, xunggui: 98, hanmen: 50 };
  suppressFaction(s, 'qingliu');
  assert.equal(s.factions.qingliu, 0);
  assert.equal(s.factions.xunggui, 100);
});

test('suppressFaction rejects unknown factions', () => {
  const s = createInitialState('sup');
  assert.throws(() => suppressFaction(s, 'nobody'));
});

// ---- 3. 國策換策代價 ----

test('the opening policy is free: no prestige cost and no lock', () => {
  const s = createInitialState('pol');
  assert.equal(s.policyMeta.lastChangeTurn, null);
  assert.equal(policyLockRemaining(s), 0);
});

test('a policy change costs one prestige and starts the one-year lock', () => {
  const s = createInitialState('pol');
  const before = s.stats.prestige;
  const r = changePolicy(s, 'commerce');
  assert.equal(r.ok, true);
  assert.equal(s.policy, 'commerce');
  assert.equal(s.stats.prestige, before - 1);
  assert.equal(policyLockRemaining(s), POLICY_LOCK_TURNS);
});

test('a second change within a year is refused and changes nothing', () => {
  const s = createInitialState('pol');
  changePolicy(s, 'commerce');
  const prestige = s.stats.prestige;
  for (let i = 0; i < 11; i++) advanceMonth(s);
  const r = changePolicy(s, 'confucian');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'locked');
  assert.equal(s.policy, 'commerce');
  assert.equal(s.stats.prestige, prestige);
});

test('a change is allowed again once twelve months have passed', () => {
  const s = createInitialState('pol');
  changePolicy(s, 'commerce');
  for (let i = 0; i < POLICY_LOCK_TURNS; i++) advanceMonth(s);
  assert.equal(policyLockRemaining(s), 0);
  assert.equal(changePolicy(s, 'confucian').ok, true);
});

test('a change is refused when prestige is below the cost', () => {
  const s = createInitialState('pol');
  s.stats.prestige = 0;
  const r = changePolicy(s, 'militarist');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'prestige');
  assert.equal(s.policy, 'agrarian');
});

test('choosing the current policy or an unknown key is refused', () => {
  const s = createInitialState('pol');
  assert.equal(changePolicy(s, 'agrarian').reason, 'same');
  assert.equal(changePolicy(s, 'nope').reason, 'unknown');
});

// ---- 4. 國策專屬事件 ----

test('every policy has at least one dedicated event keyed by when.policy', () => {
  for (const key of POLICY_KEYS) {
    assert.ok(events.some((e) => e.when && e.when.policy === key), `no event for ${key}`);
  }
});

test('policy-keyed events only fire under their own policy', () => {
  for (const key of POLICY_KEYS) {
    const ev = events.find((e) => e.when && e.when.policy === key);
    const s = createInitialState('pk');
    s.policy = key;
    // 條件以 chance 收尾，固定回傳 0 即必中
    assert.equal(isEligible(s, ev, fixed(0)), true, `${ev.id} should fire under ${key}`);
    const other = POLICY_KEYS.find((k) => k !== key);
    s.policy = other;
    assert.equal(isEligible(s, ev, fixed(0)), false, `${ev.id} should not fire under ${other}`);
  }
});

test('new policy and assassination events have valid ids and option effects', () => {
  const ids = ['E301', 'E302', 'E303', 'E304', 'E305', 'E306'];
  for (const id of ids) assert.ok(byId(id), `${id} missing`);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, 'duplicate event ids');
  for (const id of ids) {
    for (const opt of byId(id).options) {
      for (const key of Object.keys(opt.effects)) {
        assert.ok(['treasury', 'people', 'benevolence', 'prestige', 'charm', 'military', 'power',
          'agriculture', 'armament', 'heaven', 'commerce', 'health', 'literature'].includes(key), `${id} unknown effect ${key}`);
      }
    }
  }
});

test('a policy event can be applied through the existing option path', () => {
  const s = createInitialState('apply');
  s.policy = 'militarist';
  const ev = byId('E303');
  applyOption(s, ev.options[1]);
  assert.equal(s.stats.prestige, 60 + 3);
});

// ---- 5. 東廠同時最多 2 案 ----

test('no more than two active investigations at once', () => {
  const s = createInitialState('cap');
  assert.equal(MAX_ACTIVE_CASES, 2);
  assert.ok(openInvestigation(s, 'o1'));
  assert.ok(openInvestigation(s, 'o2'));
  assert.equal(openInvestigation(s, 'o3'), null);
  assert.equal(s.dongchang.cases.length, 2);
});

test('closing a case frees a slot', () => {
  const s = createInitialState('cap');
  openInvestigation(s, 'o1');
  openInvestigation(s, 'o2');
  s.dongchang.cases[0].status = 'closed';
  assert.ok(openInvestigation(s, 'o3'));
});

test('imprisoned cases still count toward the cap', () => {
  const s = createInitialState('cap');
  openInvestigation(s, 'o1');
  openInvestigation(s, 'o2');
  s.dongchang.cases[0].status = 'imprisoned';
  assert.equal(openInvestigation(s, 'o3'), null);
});

test('event-driven investigations on the lowest official respect the cap', () => {
  const s = createInitialState('cap');
  openInvestigation(s, 'o1');
  openInvestigation(s, 'o2');
  assert.equal(openInvestigationOnLowest(s), null);
  assert.equal(s.dongchang.cases.length, 2);
});

// ---- 整體：600 個月模擬不報錯 ----

test('a 600-month simulation runs without errors and reports tyranny', () => {
  const r = runSimulation({ seed: 'gap-600', months: 600, events });
  assert.equal(typeof r.tyranny, 'number');
  assert.ok(r.tyranny >= 0 && r.tyranny <= TYRANNY_MAX);
  assert.ok(Object.keys(r.factions).length === 3);
});

test('a 600-month simulation never exceeds two open dongchang cases', () => {
  for (const seed of ['gap-a', 'gap-b']) {
    const r = runSimulation({ seed, months: 600, events });
    assert.ok(r.dongchang.open <= MAX_ACTIVE_CASES, `${seed}: ${r.dongchang.open} open`);
  }
});

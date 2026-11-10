import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoDecideMemorial } from '../src/autodecide.js';
import { createInitialState } from '../src/state.js';

const open = (key) => ({ key, label: key });
const lockedPhase = (key) => ({ key, label: key, phase: 2 });
const lockedWhen = (key) => ({ key, label: key, when: { official_trait: '__no_such_trait__' } });

const event = (options) => ({ id: 'memo-test', options });

test('determinism: same inputs give the same option', () => {
  const state = createInitialState('ad-seed');
  const ev = event([open('a'), open('b'), open('c')]);
  const first = autoDecideMemorial(state, ev, 'ad-seed', 1, 3);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(autoDecideMemorial(state, ev, 'ad-seed', 1, 3), first);
  }
});

test('returns { option, key } where key matches option.key', () => {
  const state = createInitialState('ad-seed');
  const ev = event([open('a'), open('b')]);
  const r = autoDecideMemorial(state, ev, 'ad-seed', 1, 3);
  assert.ok(r);
  assert.equal(r.key, r.option.key);
  assert.ok(ev.options.includes(r.option));
});

test('returns null when no option is available', () => {
  const state = createInitialState('ad-seed');
  assert.equal(autoDecideMemorial(state, event([]), 'ad-seed', 1, 3), null);
  assert.equal(autoDecideMemorial(state, event([lockedPhase('x'), lockedWhen('y')]), 'ad-seed', 1, 3), null);
});

test('never returns a locked option', () => {
  const state = createInitialState('ad-seed');
  const ev = event([lockedPhase('p'), open('ok'), lockedWhen('w')]);
  for (let year = 1; year <= 30; year++) {
    for (let month = 1; month <= 12; month++) {
      const r = autoDecideMemorial(state, ev, `seed-${year}`, year, month);
      assert.equal(r.key, 'ok');
    }
  }
});

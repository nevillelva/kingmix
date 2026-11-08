import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyOption, monthlyTick } from '../src/turn.js';
import { recordSharedEvent, sharedCount, isBonded, remonstrate, BOND_THRESHOLD, BOND_NAME } from '../src/bonds.js';
import { makeRng } from '../src/rng.js';

test('five shared events unlock 君臣相得 exactly on the fifth', () => {
  const s = createInitialState('b');
  const results = [1, 2, 3, 4, 5].map((i) => recordSharedEvent(s, 'o1', `E${i}`));
  assert.deepEqual(results, [false, false, false, false, true]);
  assert.equal(sharedCount(s, 'o1'), BOND_THRESHOLD);
  assert.equal(isBonded(s, 'o1'), true);
  assert.equal(isBonded(s, 'o2'), false);
  assert.equal(BOND_NAME, '君臣相得');
});

test('unlock happens only once', () => {
  const s = createInitialState('b');
  for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o1', `E${i}`);
  assert.equal(recordSharedEvent(s, 'o1', 'E9'), false);
});

test('recording for an unknown official is ignored', () => {
  const s = createInitialState('b');
  assert.equal(recordSharedEvent(s, 'ghost', 'E1'), false);
  assert.equal(s.bonds, undefined);
});

test('bonded official loyalty no longer declines monthly', () => {
  const s = createInitialState('b');
  const o = s.officials.find((x) => x.id === 'o3'); // 野心高、忠誠低，月月流失
  for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o3', `E${i}`);
  const before = o.loyalty;
  monthlyTick(s, makeRng(['b', 1]));
  assert.equal(o.loyalty, before);
});

test('unbonded official still declines monthly (default behavior)', () => {
  const s = createInitialState('b');
  const o = s.officials.find((x) => x.id === 'o3');
  const before = o.loyalty;
  monthlyTick(s, makeRng(['b', 1]));
  assert.ok(o.loyalty < before);
});

test('remonstrate returns null for unbonded officials and does not consume rng', () => {
  const s = createInitialState('b');
  let calls = 0;
  const rng = () => { calls += 1; return 0; };
  assert.equal(remonstrate(s, 'o1', rng), null);
  assert.equal(calls, 0);
});

test('remonstrate is deterministic for a given seed', () => {
  const run = () => {
    const s = createInitialState('b');
    for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o1', `E${i}`);
    return remonstrate(s, 'o1', makeRng(['remon', 1]));
  };
  assert.deepEqual(run(), run());
});

test('a fatal remonstrance removes the official and closes their cases', () => {
  const s = createInitialState('b');
  for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o1', `E${i}`);
  s.dongchang.cases.push({ id: 'DC1', officialId: 'o1', status: 'investigating', outcome: null });
  const result = remonstrate(s, 'o1', () => 0); // 0 < 機率，必定殞命
  assert.deepEqual(result, { died: true });
  assert.ok(!s.officials.some((o) => o.id === 'o1'));
  assert.equal(s.dongchang.cases[0].status, 'closed');
});

test('a surviving remonstrance keeps the official', () => {
  const s = createInitialState('b');
  for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o1', `E${i}`);
  assert.deepEqual(remonstrate(s, 'o1', () => 0.99), { died: false });
  assert.ok(s.officials.some((o) => o.id === 'o1'));
});

test('applyOption path still works with bonds present', () => {
  const s = createInitialState('b');
  for (let i = 0; i < 5; i++) recordSharedEvent(s, 'o1', `E${i}`);
  applyOption(s, { effects: { benevolence: 5 } });
  assert.equal(s.stats.benevolence, 155);
});

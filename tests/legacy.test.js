import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordRun, summarizeLegacy, legacyFromState, LEGACY_CAP } from '../src/legacy.js';
import { createInitialState } from '../src/state.js';

const run = (i, extra = {}) => ({
  seed: i, mode: 'normal', endReason: 'death', years: 10, finalTitle: '承續基業之主',
  generations: 1, dynastyEnded: false, ...extra,
});

test('empty history is safe', () => {
  assert.deepEqual(summarizeLegacy([]), { runs: 0, avgYears: 0, endReasonCounts: {}, bestTitle: null });
  assert.deepEqual(summarizeLegacy(undefined), { runs: 0, avgYears: 0, endReasonCounts: {}, bestTitle: null });
  assert.deepEqual(recordRun([], run(1)), [run(1)]);
});

test('recordRun does not mutate and caps at 50 dropping oldest', () => {
  let h = [];
  for (let i = 0; i < LEGACY_CAP + 5; i++) h = recordRun(h, run(i));
  assert.equal(h.length, 50);
  assert.equal(h[0].seed, 5);
  assert.equal(h[49].seed, 54);
  const before = [run(1)];
  const after = recordRun(before, run(2));
  assert.equal(before.length, 1);
  assert.equal(after.length, 2);
});

test('endReason counts', () => {
  const h = [
    run(1, { endReason: 'death' }),
    run(2, { endReason: 'abdicated' }),
    run(3, { endReason: 'death' }),
    run(4, { endReason: 'assassinated', years: 20 }),
  ];
  const s = summarizeLegacy(h);
  assert.equal(s.runs, 4);
  assert.deepEqual(s.endReasonCounts, { death: 2, abdicated: 1, assassinated: 1 });
  assert.equal(s.avgYears, 12.5);
  assert.equal(s.bestTitle, '承續基業之主');
});

test('legacyFromState builds summary from createInitialState', () => {
  const state = createInitialState(42);
  state.endReason = 'death';
  state.year = 25;
  const s = legacyFromState(state);
  assert.equal(s.seed, 42);
  assert.equal(s.endReason, 'death');
  assert.equal(s.years, 25);
  assert.equal(s.generations, 1);
  assert.equal(s.dynastyEnded, false);
  assert.equal(typeof s.finalTitle, 'string');
  assert.ok(s.finalTitle.length > 0);
});

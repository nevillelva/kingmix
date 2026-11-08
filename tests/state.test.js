import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, setStat, BOUNDS } from '../src/state.js';

test('setStat clamps to floor and records a warning', () => {
  const s = createInitialState('t');
  setStat(s, 'people', -10);
  assert.equal(s.stats.people, 0);
  assert.equal(s.warnings.at(-1).reason, 'floor');
});

test('setStat clamps to ceiling and records a warning', () => {
  const s = createInitialState('t');
  setStat(s, 'health', 250);
  assert.equal(s.stats.health, 100);
  assert.equal(s.warnings.at(-1).reason, 'ceiling');
});

test('setStat rejects unknown stats and NaN', () => {
  const s = createInitialState('t');
  assert.throws(() => setStat(s, 'nope', 1));
  assert.throws(() => setStat(s, 'treasury', NaN));
});

test('initial state lies within bounds', () => {
  const s = createInitialState('t');
  for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
    assert.ok(s.stats[k] >= lo && s.stats[k] <= hi, `${k} out of bounds`);
  }
});

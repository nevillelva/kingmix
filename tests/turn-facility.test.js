import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTick } from '../src/turn.js';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';

const fresh = () => createInitialState(7);

test('monthlyTick without facilities matches a state that never had the field', () => {
  const a = fresh();
  const b = fresh();
  b.facilities = {};
  monthlyTick(a, makeRng(['t', 1]));
  monthlyTick(b, makeRng(['t', 1]));
  assert.deepEqual(a.stats, b.stats);
});

test('a garden at level 1 adds its monthly charm bonus on each tick', () => {
  const base = fresh();
  const withGarden = fresh();
  withGarden.facilities = { garden: 1 };
  monthlyTick(base, makeRng(['t', 2]));
  monthlyTick(withGarden, makeRng(['t', 2]));
  // 御花園 level 1 每月 +1 魅力（見 src/facilities.js）
  assert.ok(Math.abs(withGarden.stats.charm - base.stats.charm - 1) < 1e-9);
});

test('facility bonus is applied after the base drift and stays within stat bounds', () => {
  const s = fresh();
  s.facilities = { garden: 3, medical: 3, academy: 3 };
  s.stats.charm = 499.5;
  monthlyTick(s, makeRng(['t', 3]));
  assert.ok(s.stats.charm <= 500, `charm ${s.stats.charm} exceeds bound`);
  assert.ok(Number.isFinite(s.stats.literature));
});

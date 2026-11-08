import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';
import { BOUNDS } from '../src/state.js';
import { isAvailable } from '../src/events.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const activeIds = events.filter(isAvailable).map((e) => e.id);
const TEN_YEARS = 120;

test('the same seed produces an identical run (deterministic, anti-SL)', () => {
  const a = runSimulation({ seed: 'determinism', months: TEN_YEARS, events });
  const b = runSimulation({ seed: 'determinism', months: TEN_YEARS, events });
  assert.deepEqual(a, b);
});

test('different seeds produce different runs', () => {
  const a = runSimulation({ seed: 'alpha', months: TEN_YEARS, events });
  const b = runSimulation({ seed: 'beta', months: TEN_YEARS, events });
  assert.notDeepEqual(a.log, b.log);
});

test('10-year runs keep every stat finite and within bounds', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const r = runSimulation({ seed: String(seed), months: TEN_YEARS, events });
    for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
      const v = r.stats[k];
      assert.ok(Number.isFinite(v), `seed ${seed}: ${k} is not finite`);
      assert.ok(v >= lo && v <= hi, `seed ${seed}: ${k}=${v} out of [${lo},${hi}]`);
    }
  }
});

test('every active event fires at least once across seeds 1-20 over 10 years', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const r = runSimulation({ seed: String(seed), months: TEN_YEARS, events });
    Object.keys(r.triggered).forEach((id) => seen.add(id));
  }
  const missing = activeIds.filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], `events never triggered: ${missing.join(', ')}`);
});

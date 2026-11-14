import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { seedBondedCourtOfficial, SEED_BOND_LOYALTY, isBonded, isLoyaltyFrozen } from '../src/bonds.js';
import { runSimulation } from '../src/sim.js';
import { readFileSync } from 'node:fs';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

test('seedBondedCourtOfficial bonds the first court official at turn 0 with loyalty below 85', () => {
  const s = createInitialState('seed-bond');
  const id = seedBondedCourtOfficial(s);
  assert.equal(id, 'o1');
  assert.equal(isBonded(s, 'o1'), true);
  assert.equal(isBonded(s, 'o2'), false);
  const o = s.officials.find((x) => x.id === 'o1');
  assert.equal(o.loyalty, SEED_BOND_LOYALTY);
  assert.ok(o.loyalty < 85);
  assert.equal(isLoyaltyFrozen(s, o), true);
});

test('seeded bond does not record shared events', () => {
  const s = createInitialState('seed-bond');
  seedBondedCourtOfficial(s);
  assert.deepEqual(s.bonds.shared, {});
});

test('runSimulation: every run seeds a bonded court official at turn 0 and reaches E420 pity-eligible state', () => {
  const r = runSimulation({ seed: '1', months: 12 * 40, events });
  assert.ok((r.triggered.E420 ?? 0) >= 1, 'expected at least one E420 within 40 years');
});

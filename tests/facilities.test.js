import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeFacility, facilityMonthlyEffects, facilityLevels, applyFacilityMonthly, FACILITIES, FACILITY_IDS, FACILITY_MAX_LEVEL } from '../src/facilities.js';
import { createInitialState } from '../src/state.js';

const base = (treasury = 500) => {
  const s = createInitialState(11);
  s.stats.treasury = treasury;
  return s;
};

test('facility names and ids are fixed', () => {
  assert.deepEqual(FACILITY_IDS, ['garden', 'medical', 'academy']);
  assert.equal(FACILITIES.garden.name, '御花園');
  assert.equal(FACILITIES.medical.name, '太醫院');
  assert.equal(FACILITIES.academy.name, '翰林院');
  for (const id of FACILITY_IDS) assert.equal(FACILITIES[id].levels.length, FACILITY_MAX_LEVEL);
});

test('upgrade charges the level cost and raises the level', () => {
  const s = base(500);
  const next = upgradeFacility(s, 'garden');
  assert.ok(!next.error);
  assert.equal(next.stats.treasury, 500 - FACILITIES.garden.levels[0].cost);
  assert.equal(facilityLevels(next).garden, 1);
  assert.equal(next.facilities.medical, 0);
});

test('costs follow each level, and the three-level cap is enforced', () => {
  let s = base(10000);
  const spent = [];
  for (let i = 0; i < FACILITY_MAX_LEVEL; i++) {
    const before = s.stats.treasury;
    s = upgradeFacility(s, 'academy');
    spent.push(before - s.stats.treasury);
  }
  assert.deepEqual(spent, FACILITIES.academy.levels.map((l) => l.cost));
  assert.deepEqual(upgradeFacility(s, 'academy'), { error: 'max_level', id: 'academy', level: 3 });
});

test('insufficient treasury returns an error and leaves state alone', () => {
  const s = base(79);
  const snapshot = structuredClone(s);
  const r = upgradeFacility(s, 'garden');
  assert.equal(r.error, 'insufficient_treasury');
  assert.equal(r.cost, 80);
  assert.equal(r.treasury, 79);
  assert.deepEqual(s, snapshot);
});

test('exact treasury is enough', () => {
  const r = upgradeFacility(base(60), 'medical');
  assert.ok(!r.error);
  assert.equal(r.stats.treasury, 0);
});

test('unknown facility is rejected', () => {
  assert.deepEqual(upgradeFacility(base(), 'nope'), { error: 'unknown_facility', id: 'nope' });
});

test('upgradeFacility never mutates its input', () => {
  const s = base(1000);
  s.facilities = { garden: 1, medical: 0, academy: 0 };
  const snapshot = structuredClone(s);
  const next = upgradeFacility(s, 'medical');
  assert.notEqual(next, s);
  assert.deepEqual(s, snapshot);
  assert.equal(next.facilities.garden, 1);
  assert.equal(next.facilities.medical, 1);
});

test('missing facilities field is treated as all level 0', () => {
  const s = base(500);
  assert.equal(s.facilities, undefined);
  assert.equal(upgradeFacility(s, 'academy').facilities.academy, 1);
});

test('monthly effects: none at level 0, cumulative stat bonus by level', () => {
  const s = base();
  assert.deepEqual(facilityMonthlyEffects(s), []);
  s.facilities = { garden: 2, medical: 0, academy: 1 };
  assert.deepEqual(facilityMonthlyEffects(s), [
    { facility: 'garden', stat: 'charm', amount: 2 },
    { facility: 'academy', stat: 'literature', amount: 0.5 },
  ]);
});

test('facilityMonthlyEffects does not mutate state', () => {
  const s = base();
  s.facilities = { garden: 3, medical: 3, academy: 3 };
  const snapshot = structuredClone(s);
  facilityMonthlyEffects(s);
  assert.deepEqual(s, snapshot);
});

test('applyFacilityMonthly adds bonuses to stats within bounds', () => {
  const s = base();
  s.facilities = { garden: 1, medical: 1, academy: 0 };
  const charm = s.stats.charm;
  const health = s.stats.health;
  applyFacilityMonthly(s);
  assert.equal(s.stats.charm, charm + 1);
  assert.equal(s.stats.health, health + 0.2);
});

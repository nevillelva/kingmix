import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import {
  NEIGHBORS, diplomacyOf, arrangeMarriage, acceptTribute, formAlliance, declareWar,
  warPressure, pickWarTarget, enemyStrengthOf, alliedReinforcement, monthlyDrift,
  MARRIAGE_COST, ALLIANCE_MIN_ATTITUDE, MAX_ALLIANCES, DECLARE_WAR_REWARD, DECLARE_WAR_LOSS,
} from '../src/diplomacy.js';

test('declaration of war rewards and losses are exported with the UI defaults', () => {
  assert.deepEqual({ ...DECLARE_WAR_REWARD }, { treasury: 40, prestige: 3 });
  assert.deepEqual({ ...DECLARE_WAR_LOSS }, { armament: -40, people: -4 });
  assert.ok(Object.isFrozen(DECLARE_WAR_REWARD));
  assert.ok(Object.isFrozen(DECLARE_WAR_LOSS));
});

test('four neighbors with unique ids and valid attitudes', () => {
  assert.equal(NEIGHBORS.length, 4);
  assert.equal(new Set(NEIGHBORS.map((n) => n.id)).size, 4);
  for (const n of NEIGHBORS) {
    assert.ok(n.strength > 0);
    assert.ok(n.attitude >= 0 && n.attitude <= 100);
  }
});

test('diplomacy state is created lazily and matches the constants', () => {
  const s = createInitialState('d');
  assert.equal(s.diplomacy, undefined);
  const d = diplomacyOf(s);
  assert.equal(d.north.attitude, NEIGHBORS.find((n) => n.id === 'north').attitude);
  assert.equal(d.north.allied, false);
});

test('marriage costs treasury, improves attitude and starts a truce', () => {
  const s = createInitialState('d');
  const before = s.stats.treasury;
  const att = diplomacyOf(s).west.attitude;
  assert.deepEqual(arrangeMarriage(s, 'west'), { ok: true });
  assert.equal(s.stats.treasury, before - MARRIAGE_COST);
  assert.ok(diplomacyOf(s).west.attitude > att);
  assert.ok(diplomacyOf(s).west.kin > 0);
});

test('marriage fails without enough treasury', () => {
  const s = createInitialState('d');
  s.stats.treasury = MARRIAGE_COST - 1;
  assert.equal(arrangeMarriage(s, 'west').ok, false);
});

test('tribute needs attitude and pays out', () => {
  const s = createInitialState('d');
  diplomacyOf(s).north.attitude = 10;
  assert.equal(acceptTribute(s, 'north').reason, 'attitude');
  diplomacyOf(s).north.attitude = 50;
  const before = s.stats.treasury;
  assert.equal(acceptTribute(s, 'north').ok, true);
  assert.ok(s.stats.treasury > before);
});

test('alliance requires high attitude and is capped', () => {
  const s = createInitialState('d');
  assert.equal(formAlliance(s, 'west').reason, 'attitude');
  for (const n of NEIGHBORS) diplomacyOf(s)[n.id].attitude = ALLIANCE_MIN_ATTITUDE + 5;
  assert.equal(formAlliance(s, 'west').ok, true);
  assert.equal(formAlliance(s, 'south').ok, true);
  assert.equal(formAlliance(s, 'east').reason, 'limit');
  assert.equal(formAlliance(s, 'west').reason, 'already');
  assert.equal(MAX_ALLIANCES, 2);
  assert.ok(Math.abs(alliedReinforcement(s) - 1.2) < 1e-9);
});

test('allies cannot be attacked and carry no war pressure', () => {
  const s = createInitialState('d');
  diplomacyOf(s).west.attitude = 90;
  formAlliance(s, 'west');
  assert.equal(declareWar(s, 'west').reason, 'allied');
  assert.equal(warPressure(s, 'west'), 0);
});

test('declaring war turns hostile and marriage kin halves pressure', () => {
  const s = createInitialState('d');
  assert.equal(declareWar(s, 'east').ok, true);
  assert.equal(diplomacyOf(s).east.attitude, 0);
  assert.equal(warPressure(s, 'east'), 1);
  const south = diplomacyOf(s).south.attitude;
  const plain = (100 - south) / 100;
  diplomacyOf(s).south.kin = 5;
  assert.ok(Math.abs(warPressure(s, 'south') - plain * 0.5) < 1e-9);
});

test('enemy strength reflects attitude and marriage truce', () => {
  const s = createInitialState('d');
  const base = enemyStrengthOf(s, 'north');
  diplomacyOf(s).north.kin = 3;
  assert.ok(enemyStrengthOf(s, 'north') < base);
});

test('war target selection is deterministic and skips all-allied states', () => {
  const s = createInitialState('d');
  const a = pickWarTarget(s, makeRng(['t', 1]));
  const b = pickWarTarget(createInitialState('d'), makeRng(['t', 1]));
  assert.equal(a, b);
  for (const n of NEIGHBORS) {
    diplomacyOf(s)[n.id].attitude = 90;
    diplomacyOf(s)[n.id].allied = true;
  }
  assert.equal(pickWarTarget(s, () => 0), null);
});

test('monthly drift is deterministic and keeps attitudes in range', () => {
  const a = createInitialState('d');
  const b = createInitialState('d');
  for (let m = 1; m <= 24; m++) {
    monthlyDrift(a, 1, m);
    monthlyDrift(b, 1, m);
  }
  assert.deepEqual(a.diplomacy, b.diplomacy);
  for (const d of Object.values(a.diplomacy)) assert.ok(d.attitude >= 0 && d.attitude <= 100);
});

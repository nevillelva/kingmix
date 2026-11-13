import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { isEligible } from '../src/events.js';
import { afterOption } from '../src/turn.js';
import { recordSharedEvent, BOND_THRESHOLD } from '../src/bonds.js';
import { ensureCity } from '../src/city.js';

const always = () => 0; // chance 條件以 0 通過（rng() < val 恆真）
const ev = (when) => ({ id: 'TEST', when });

test('terrain_is: passes only when a prefecture of that terrain is under-defended', () => {
  const s = createInitialState('terrain-1');
  ensureCity(s).forEach((p) => { p.defense = 50; });
  assert.equal(isEligible(s, ev({ terrain_is: 'farming' }), always), false);
  s.prefectures.find((p) => p.character === 'farming').defense = 30;
  assert.equal(isEligible(s, ev({ terrain_is: 'farming' }), always), true);
  assert.equal(isEligible(s, ev({ terrain_is: 'trade' }), always), false);
});

test('terrain_is: rejects an unknown terrain loudly', () => {
  const s = createInitialState('terrain-2');
  assert.throws(() => isEligible(s, ev({ terrain_is: 'mountain' }), always), /unknown terrain/);
});

test('bond_with: sharing needs one shared event, bonded needs the threshold', () => {
  const s = createInitialState('bond-1');
  assert.equal(isEligible(s, ev({ bond_with: 'sharing' }), always), false);
  recordSharedEvent(s, 'o1', 'E001');
  assert.equal(isEligible(s, ev({ bond_with: 'sharing' }), always), true);
  assert.equal(isEligible(s, ev({ bond_with: 'bonded' }), always), false);
  for (let i = 1; i < BOND_THRESHOLD; i++) recordSharedEvent(s, 'o1', `E00${i + 1}`);
  assert.equal(isEligible(s, ev({ bond_with: 'bonded' }), always), true);
});

test('bond_with: rejects an unknown kind loudly', () => {
  const s = createInitialState('bond-2');
  assert.throws(() => isEligible(s, ev({ bond_with: 'friends' }), always), /unknown bond_with/);
});

test('prior_choice: afterOption records the chosen key, and matches by event and option', () => {
  const s = createInitialState('prior-1');
  const event = { id: 'E001', options: [] };
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E001' } }), always), false);
  afterOption(s, event, { key: 'B', effects: {} });
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E001' } }), always), true);
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E001', option: 'B' } }), always), true);
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E001', option: 'A' } }), always), false);
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E002' } }), always), false);
});

test('prior_choice keeps only the most recent choice per event', () => {
  const s = createInitialState('prior-2');
  const event = { id: 'E003', options: [] };
  afterOption(s, event, { key: 'A', effects: {} });
  afterOption(s, event, { key: 'C', effects: {} });
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E003', option: 'C' } }), always), true);
  assert.equal(isEligible(s, ev({ prior_choice: { event: 'E003', option: 'A' } }), always), false);
});

test('has_item rejects an unknown collection item loudly', () => {
  const s = createInitialState('item-1');
  assert.throws(() => isEligible(s, ev({ has_item: 'jade' }), always), /unknown collection item/);
});

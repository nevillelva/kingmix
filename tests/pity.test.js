import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { recordSharedEvent, BOND_THRESHOLD } from '../src/bonds.js';
import { pickEvent, pickWeight, pityMultiplier, PITY_AFTER_MONTHS, PITY_FACTOR } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const E420 = events.find((e) => e.id === 'E420');

// 讓 o1 君臣相得，且忠誠低於死諫門檻。
function bondedLow(seed) {
  const s = createInitialState(seed);
  for (let i = 0; i < BOND_THRESHOLD; i++) recordSharedEvent(s, 'o1', `S${i}`);
  s.officials.find((o) => o.id === 'o1').loyalty = 40;
  return s;
}

const now = (s) => (s.year - 1) * 12 + (s.month - 1);

test('pity is off until E420 has been eligible for PITY_AFTER_MONTHS consecutive months', () => {
  const s = bondedLow('pity-window');
  s.flags.remon_eligible_since = now(s) - (PITY_AFTER_MONTHS - 1);
  assert.equal(pityMultiplier(E420, s), 1);
  s.flags.remon_eligible_since = now(s) - PITY_AFTER_MONTHS;
  assert.equal(pityMultiplier(E420, s), PITY_FACTOR);
});

test('pity only touches E420 and multiplies its weight', () => {
  const s = bondedLow('pity-weight');
  s.flags.remon_eligible_since = now(s) - PITY_AFTER_MONTHS;
  const other = events.find((e) => e.id !== 'E420');
  assert.equal(pityMultiplier(other, s), 1);
  const before = pickWeight(E420, { ...s, flags: {} });
  assert.ok(Math.abs(pickWeight(E420, s) / before - PITY_FACTOR) < 1e-9);
});

test('pity switches off once E420 has fired in the run', () => {
  const s = bondedLow('pity-fired');
  s.flags.remon_eligible_since = now(s) - 24;
  s.eventHistory = { counts: { E420: 1 }, last: {} };
  assert.equal(pityMultiplier(E420, s), 1);
});

test('pity switches off once a remonstrance is in the chronicle', () => {
  const s = bondedLow('pity-chron');
  s.flags.remon_eligible_since = now(s) - 24;
  s.chronicle.push({ kind: 'remonstrance', outcome: 'accepted', name: 'x', year: 1, month: 1 });
  assert.equal(pityMultiplier(E420, s), 1);
});

test('pickEvent records the start of eligibility and clears it when the condition lapses', () => {
  const s = bondedLow('pity-track');
  pickEvent(s, events, makeRng(['pity-track-1']));
  assert.equal(s.flags.remon_eligible_since, now(s));

  // 先前設定的起點不得被後續月份覆寫（連續期間從第一次成立算起）。
  s.month = s.month === 12 ? 11 : s.month + 1;
  pickEvent(s, events, makeRng(['pity-track-2']));
  assert.equal(s.flags.remon_eligible_since, now(s) - 1);

  s.officials.find((o) => o.id === 'o1').loyalty = 90;
  pickEvent(s, events, makeRng(['pity-track-3']));
  assert.equal(s.flags.remon_eligible_since, undefined);
});

test('the early-morning second memorial exclusion does not reset the eligibility streak', () => {
  const s = bondedLow('pity-exclude');
  pickEvent(s, events, makeRng(['pity-ex-1']), 'E420');
  assert.equal(s.flags.remon_eligible_since, now(s));
});

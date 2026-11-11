import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { eventWeight } from '../src/sim.js';
import { SITUATION_BOOST, SITUATION_THRESHOLDS, situationMultiplier, raisesStat } from '../src/events.js';

const ev = (effects, when = {}) => ({ id: 't', when, options: [{ key: 'a', effects }] });

test('constants are exported with the specified thresholds and max boost', () => {
  assert.deepEqual(SITUATION_THRESHOLDS, { treasury: 60, people: 50, power: 40 });
  assert.equal(SITUATION_BOOST, 1.25);
});

test('raisesStat detects positive effects on any option only', () => {
  assert.equal(raisesStat(ev({ treasury: 50 }), 'treasury'), true);
  assert.equal(raisesStat(ev({ treasury: -50 }), 'treasury'), false);
  assert.equal(raisesStat(ev({ people: 10 }), 'treasury'), false);
});

test('no boost when stats are at or above thresholds', () => {
  const s = createInitialState('sit-a');
  s.stats.treasury = 60; s.stats.people = 50; s.stats.power = 40;
  assert.equal(situationMultiplier(s, ev({ treasury: 50 })), 1);
});

test('low treasury boosts only events that raise treasury', () => {
  const s = createInitialState('sit-b');
  s.stats.treasury = 59;
  assert.equal(situationMultiplier(s, ev({ treasury: 50 })), SITUATION_BOOST);
  assert.equal(situationMultiplier(s, ev({ people: 50 })), 1);
  assert.equal(situationMultiplier(s, ev({ treasury: -50 })), 1);
});

test('low people and low power each boost their own positive events', () => {
  const s = createInitialState('sit-c');
  s.stats.people = 49;
  s.stats.power = 39;
  assert.equal(situationMultiplier(s, ev({ people: 5 })), SITUATION_BOOST);
  assert.equal(situationMultiplier(s, ev({ power: 5 })), SITUATION_BOOST);
});

test('boost is capped at SITUATION_BOOST even when several stats are low', () => {
  const s = createInitialState('sit-d');
  s.stats.treasury = 0; s.stats.people = 0; s.stats.power = 0;
  const e = { id: 't', options: [{ key: 'a', effects: { treasury: 1, people: 1, power: 1 } }] };
  assert.equal(situationMultiplier(s, e), SITUATION_BOOST);
});

test('eventWeight without state keeps the original weights', () => {
  assert.equal(eventWeight(ev({ treasury: 5 })), 1);
  assert.equal(eventWeight(ev({ treasury: 5 }, { every_years: 2 })), 3);
});

test('eventWeight with state applies the situational multiplier deterministically', () => {
  const s = createInitialState('sit-e');
  s.stats.treasury = 10;
  assert.equal(eventWeight(ev({ treasury: 5 }), s), SITUATION_BOOST);
  assert.equal(eventWeight(ev({ treasury: 5 }), s), SITUATION_BOOST);
  assert.equal(eventWeight(ev({ treasury: 5 }, { months: [1] }), s), 3 * SITUATION_BOOST);
});

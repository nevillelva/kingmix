import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import {
  factionsBalanced, strongFactionCount, forcingFaction, applyFactionPressure,
  FORCE_MONTHS, FACTION_FORCE_THRESHOLD, THREE_STRONG_LOYALTY_DRAIN,
} from '../src/factions.js';

test('default factions (34/33/33) count as balanced and not forcing', () => {
  const s = createInitialState('t');
  assert.equal(factionsBalanced(s.factions), true);
  assert.equal(forcingFaction(s.factions), null);
  assert.equal(strongFactionCount(s.factions), 0);
});

test('a skewed faction spread is not balanced', () => {
  assert.equal(factionsBalanced({ qingliu: 45, xunggui: 30, hanmen: 25 }), false);
  assert.equal(factionsBalanced({ qingliu: 10, xunggui: 33, hanmen: 33 }), false);
});

test('a faction above 50 is the forcing faction', () => {
  assert.equal(forcingFaction({ qingliu: 51, xunggui: 30, hanmen: 20 }), 'qingliu');
  assert.equal(forcingFaction({ qingliu: 50, xunggui: 30, hanmen: 20 }), null);
  assert.equal(FACTION_FORCE_THRESHOLD, 50);
});

test('a forcing faction changes policy only after it persists for FORCE_MONTHS', () => {
  const s = createInitialState('t');
  s.factions = { qingliu: 60, xunggui: 20, hanmen: 20 };
  for (let i = 0; i < FORCE_MONTHS - 1; i++) applyFactionPressure(s);
  assert.equal(s.policy, 'agrarian', 'not forced yet');
  applyFactionPressure(s);
  assert.equal(s.policy, 'confucian');
  assert.equal(s.factionPressure.forcedPolicies.length, 1);
});

test('a brief spike above 50 resets the forcing counter', () => {
  const s = createInitialState('t');
  s.factions = { qingliu: 60, xunggui: 20, hanmen: 20 };
  for (let i = 0; i < FORCE_MONTHS - 1; i++) applyFactionPressure(s);
  s.factions = { qingliu: 40, xunggui: 30, hanmen: 30 };
  applyFactionPressure(s);
  assert.equal(s.factionPressure.forcedMonths, 0);
  assert.equal(s.policy, 'agrarian');
});

test('three strong factions drain official loyalty', () => {
  const s = createInitialState('t');
  s.factions = { qingliu: 45, xunggui: 42, hanmen: 41 };
  const before = s.officials.map((o) => o.loyalty);
  applyFactionPressure(s);
  s.officials.forEach((o, i) => {
    assert.ok(Math.abs(before[i] - THREE_STRONG_LOYALTY_DRAIN - o.loyalty) < 1e-9);
  });
});

test('two strong factions do not drain loyalty', () => {
  const s = createInitialState('t');
  s.factions = { qingliu: 45, xunggui: 42, hanmen: 10 };
  const before = s.officials.map((o) => o.loyalty);
  applyFactionPressure(s);
  assert.deepEqual(s.officials.map((o) => o.loyalty), before);
});

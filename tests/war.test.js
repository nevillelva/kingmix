import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import { ourStrength, resolveWar } from '../src/war.js';
import { POLICIES, POLICY_KEYS } from '../src/policy.js';

const winSpec = { strength: 1, reward: { treasury: 10 }, loss: { armament: -50 } };
const loseSpec = { strength: 1e9, reward: { treasury: 10 }, loss: { armament: -50 } };

test('a winning war applies the reward and records a win', () => {
  const s = createInitialState('t');
  const before = s.stats.treasury;
  applyOption(s, { effects: { war: winSpec } }, makeRng(['w']));
  assert.equal(s.stats.treasury, before + 10);
  assert.equal(s.wars.at(-1).won, true);
});

test('a losing war applies the loss, a prestige penalty and records a loss', () => {
  const s = createInitialState('t');
  const armament = s.stats.armament;
  const prestige = s.stats.prestige;
  applyOption(s, { effects: { war: loseSpec } }, makeRng(['w']));
  assert.equal(s.stats.armament, armament - 50);
  assert.equal(s.stats.prestige, prestige - 3);
  assert.equal(s.wars.at(-1).won, false);
});

test('war outcomes are deterministic for the same rng seed', () => {
  const a = createInitialState('t');
  const b = createInitialState('t');
  const spec = { strength: 280, reward: { prestige: 1 }, loss: { prestige: -1 } };
  applyOption(a, { effects: { war: spec } }, makeRng(['same']));
  applyOption(b, { effects: { war: spec } }, makeRng(['same']));
  assert.deepEqual(a.wars, b.wars);
  assert.deepEqual(a.stats, b.stats);
});

test('a stronger commander raises our strength', () => {
  const s = createInitialState('t');
  const base = ourStrength(s, () => 0.5);
  s.officials.find((o) => o.id === 'o3').office = 'war';
  s.officials.find((o) => o.id === 'o3').abilities.martial = 95;
  assert.ok(ourStrength(s, () => 0.5) > base);
});

test('policy monthly effects apply each month', () => {
  for (const key of POLICY_KEYS) {
    const s = createInitialState('p', { policy: key });
    const before = { ...s.stats };
    monthlyTick(s, makeRng(['p']));
    for (const [stat, delta] of Object.entries(POLICIES[key].monthly)) {
      if (stat === 'treasury' || stat === 'armament' || stat === 'commerce' || stat === 'agriculture') {
        assert.ok(s.stats[stat] !== before[stat], `${key} should change ${stat}`);
      }
    }
  }
});

test('the chosen policy is recorded on the state', () => {
  assert.equal(createInitialState('p', { policy: 'confucian' }).policy, 'confucian');
  assert.equal(createInitialState('p').policy, 'agrarian');
});

test('resolveWar is pure with respect to the rng it is given', () => {
  const s = createInitialState('t');
  const r1 = resolveWar(s, { strength: 300, reward: {}, loss: {} }, makeRng(['z']), () => {});
  const s2 = createInitialState('t');
  const r2 = resolveWar(s2, { strength: 300, reward: {}, loss: {} }, makeRng(['z']), () => {});
  assert.equal(r1, r2);
  advanceMonth(s);
});

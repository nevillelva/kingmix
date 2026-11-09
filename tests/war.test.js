import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import { ourStrength, resolveWar, nominalStrength, ROLL_AMPLITUDE, ROLL_BIAS } from '../src/war.js';
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

// 強敵驗收：名目強度比 r = 敵方強度 / 名目己方強度（不含擲骰）。
// 擲骰後勝率 P(r) = P(己方戰力 >= r * 名目)。r >= 1.3 時須 < 40%，且 r = 1.3 時須 > 0（不得恆為 0）。
// 理論值 P(1.3) = (ROLL_BIAS + ROLL_AMPLITUDE - 0.3) / (2 * ROLL_AMPLITUDE)，即 0.025 / 0.6 ≈ 4.2%；此處以蒙地卡羅量測。
const winRateAt = (state, ratio, n = 20000) => {
  const rng = makeRng(['strong-acceptance', ratio]);
  const target = ratio * nominalStrength(state);
  let wins = 0;
  for (let i = 0; i < n; i++) if (ourStrength(state, rng) >= target) wins++;
  return wins / n;
};

test('強敵驗收：名目強度比 1.3 以上時勝率低於 40%', () => {
  const s = createInitialState('strong');
  for (const r of [1.3, 1.4, 1.6, 2]) assert.ok(winRateAt(s, r) < 0.4, `ratio ${r}`);
});

test('強敵驗收：名目強度比 1.3 時仍有勝機（不得恆為 0）', () => {
  const s = createInitialState('strong');
  const p = winRateAt(s, 1.3);
  assert.ok(p > 0.02, `P(win | ratio 1.3) = ${p}`);
});

test('擲骰範圍不超過 ±30%（含中心偏移）', () => {
  assert.ok(ROLL_AMPLITUDE <= 0.3);
  const s = createInitialState('range');
  const nominal = nominalStrength(s);
  const lo = ourStrength(s, () => 0) / nominal;
  const hi = ourStrength(s, () => 1 - Number.EPSILON) / nominal;
  assert.ok(Math.abs(lo - (1 + ROLL_BIAS - ROLL_AMPLITUDE)) < 1e-9);
  assert.ok(Math.abs(hi - (1 + ROLL_BIAS + ROLL_AMPLITUDE)) < 1e-6);
});

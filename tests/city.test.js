import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { monthlyTick } from '../src/turn.js';
import {
  ensureCity, repairCity, tickCity, averageDefense, defenseHoldMultiplier,
  REPAIR_COST, REPAIR_BASE, CITY_DECAY, CITY_DEFENSE_INIT,
} from '../src/city.js';
import { startCampaign, pickTactic } from '../src/campaign.js';

const spec = { strength: 200, reward: { prestige: 2 }, loss: { armament: -20 } };

function withWorks(state, intellect) {
  state.officials.push({
    id: 'w1', name: '工部尚書', abilities: { intellect, politics: 0, martial: 0, command: 0, virtue: 0 },
    loyalty: 60, ambition: 0, faction: 'qingliu', office: 'works',
  });
  return state;
}

test('ensureCity gives each of the six prefectures a defense of 50 and no repair yet', () => {
  const s = createInitialState('city-init');
  const prefs = ensureCity(s);
  assert.equal(prefs.length, 6);
  for (const p of prefs) {
    assert.equal(p.defense, CITY_DEFENSE_INIT);
    assert.equal(p.repairedYear, null);
  }
});

test('default defense makes the hold multiplier exactly 1 (existing campaign results unchanged)', () => {
  const s = createInitialState('city-mult');
  assert.equal(averageDefense(s), CITY_DEFENSE_INIT);
  assert.equal(defenseHoldMultiplier(s), 1);
});

test('hold multiplier spans 0.9 to 1.1 across the defense range', () => {
  const hi = createInitialState('city-hi');
  for (const p of ensureCity(hi)) p.defense = 100;
  assert.ok(Math.abs(defenseHoldMultiplier(hi) - 1.1) < 1e-9);

  const lo = createInitialState('city-lo');
  for (const p of ensureCity(lo)) p.defense = 0;
  assert.ok(Math.abs(defenseHoldMultiplier(lo) - 0.9) < 1e-9);
});

test('repairing a city costs treasury, raises defense and people', () => {
  const s = createInitialState('city-repair');
  const treasury = s.stats.treasury;
  const people = s.stats.people;
  const r = repairCity(s, 'jingzhao');
  assert.equal(r.ok, true);
  assert.equal(s.stats.treasury, treasury - REPAIR_COST);
  assert.equal(s.stats.people, people + 1);
  const p = ensureCity(s).find((x) => x.id === 'jingzhao');
  assert.equal(p.defense, CITY_DEFENSE_INIT + REPAIR_BASE);
  assert.equal(p.repairedYear, s.year);
});

test('a prefecture can be repaired only once per year', () => {
  const s = createInitialState('city-cool');
  assert.equal(repairCity(s, 'yizhou').ok, true);
  assert.deepEqual(repairCity(s, 'yizhou'), { ok: false, reason: 'cooldown' });
  assert.equal(repairCity(s, 'hedong').ok, true, 'other prefectures are not affected');
  s.year += 1;
  assert.equal(repairCity(s, 'yizhou').ok, true, 'next year allows repair again');
});

test('repair fails without enough treasury and leaves state untouched', () => {
  const s = createInitialState('city-poor');
  s.stats.treasury = REPAIR_COST - 1;
  const before = JSON.stringify(ensureCity(s));
  assert.deepEqual(repairCity(s, 'denglai'), { ok: false, reason: 'treasury' });
  assert.equal(s.stats.treasury, REPAIR_COST - 1);
  assert.equal(JSON.stringify(ensureCity(s)), before);
});

test('unknown prefecture is rejected', () => {
  const s = createInitialState('city-unknown');
  assert.deepEqual(repairCity(s, 'nowhere'), { ok: false, reason: 'unknown' });
});

test('a works minister with high intellect repairs more than none', () => {
  const none = createInitialState('city-noworks');
  const skilled = withWorks(createInitialState('city-works'), 100);
  const a = repairCity(none, 'jiangning');
  const b = repairCity(skilled, 'jiangning');
  assert.ok(b.gain > a.gain);
  assert.equal(b.gain, REPAIR_BASE + 10);
});

test('defense is capped at the maximum after repeated repairs', () => {
  const s = withWorks(createInitialState('city-cap'), 100);
  const p = ensureCity(s).find((x) => x.id === 'yangzhou');
  p.defense = 95;
  repairCity(s, 'yangzhou');
  assert.equal(p.defense, 100);
});

test('defense weathers each month and never drops below zero', () => {
  const s = createInitialState('city-decay');
  tickCity(s);
  for (const p of ensureCity(s)) assert.ok(Math.abs(p.defense - (CITY_DEFENSE_INIT - CITY_DECAY)) < 1e-9);
  for (let i = 0; i < 400; i++) tickCity(s);
  for (const p of s.prefectures) assert.equal(p.defense, 0);
});

test('the monthly turn tick applies city weathering', () => {
  const s = createInitialState('city-turn');
  monthlyTick(s, makeRng(['city-turn', 1]));
  for (const p of ensureCity(s)) assert.ok(p.defense < CITY_DEFENSE_INIT);
});

test('high city defense raises hold tactic power in a campaign', () => {
  const low = createInitialState('city-camp');
  const high = createInitialState('city-camp');
  for (const p of ensureCity(high)) p.defense = 100;
  startCampaign(low, spec);
  startCampaign(high, spec);
  const a = pickTactic(low, 'hold').round.ours;
  const b = pickTactic(high, 'hold').round.ours;
  assert.ok(Math.abs(b / a - 1.1) < 0.01, `ratio ${b / a}`);
});

test('assault is unaffected by city defense', () => {
  const low = createInitialState('city-assault');
  const high = createInitialState('city-assault');
  for (const p of ensureCity(high)) p.defense = 100;
  startCampaign(low, spec);
  startCampaign(high, spec);
  assert.equal(pickTactic(low, 'assault').round.ours, pickTactic(high, 'assault').round.ours);
});

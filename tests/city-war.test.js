import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { runSimulation } from '../src/sim.js';
import { ensureCity, warDefenseMultiplier, autoRepairCities, WAR_DEFENSE_SCALE, AUTO_REPAIR_RESERVE, AUTO_REPAIR_BELOW, CITY_DEFENSE_INIT } from '../src/city.js';
import { resolveWar, nominalStrength } from '../src/war.js';
import { assignOffice, officeHolder } from '../src/offices.js';

const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const noop = () => {};
const fixedRng = () => 0.5; // 己方擲骰 ×1.0，敵方擲骰 ×1.0

function setDefense(state, prefId, value) {
  ensureCity(state).find((p) => p.id === prefId).defense = value;
}

test('default defense gives a war multiplier of exactly 1 (existing outcomes unchanged)', () => {
  const s = createInitialState('cw-default');
  assert.equal(warDefenseMultiplier(s, 'jingzhao'), 1);
  assert.equal(warDefenseMultiplier(s, undefined), 1);
});

test('war defense multiplier spans ±5% across the defense range of the prefecture', () => {
  const s = createInitialState('cw-range');
  setDefense(s, 'hedong', 100);
  setDefense(s, 'yizhou', 0);
  assert.ok(Math.abs(warDefenseMultiplier(s, 'hedong') - (1 + WAR_DEFENSE_SCALE)) < 1e-9);
  assert.ok(Math.abs(warDefenseMultiplier(s, 'yizhou') - (1 - WAR_DEFENSE_SCALE)) < 1e-9);
});

test('an event war fought in a prefecture is scaled by that prefecture defense and logged', () => {
  const s = createInitialState('cw-war');
  setDefense(s, 'denglai', 100);
  const nominal = nominalStrength(s);
  const spec = { strength: 1, reward: {}, loss: {}, prefecture: 'denglai' };
  resolveWar(s, spec, fixedRng, noop);
  const w = s.wars.at(-1);
  assert.equal(w.defense, 1.05);
  assert.equal(w.prefecture, 'denglai');
  assert.equal(w.power, Math.round(nominal * 1.05 * 1.0));
});

test('a war with no prefecture uses the national average defense', () => {
  const s = createInitialState('cw-avg');
  for (const p of ensureCity(s)) p.defense = 0;
  setDefense(s, 'jingzhao', 100);
  const avg = (100 + 0 * 5) / 6;
  const expected = 1 + WAR_DEFENSE_SCALE * (avg - CITY_DEFENSE_INIT) / CITY_DEFENSE_INIT;
  assert.ok(Math.abs(warDefenseMultiplier(s, null) - expected) < 1e-9);
});

test('weaker walls make the same event war harder to win (monotone)', () => {
  const strong = createInitialState('cw-mono');
  const weak = createInitialState('cw-mono');
  setDefense(strong, 'yangzhou', 100);
  setDefense(weak, 'yangzhou', 0);
  // 敵強與己方名目戰力接近，城防差異決定勝負
  const spec = { strength: nominalStrength(strong), reward: {}, loss: {}, prefecture: 'yangzhou' };
  resolveWar(strong, spec, fixedRng, noop);
  resolveWar(weak, spec, fixedRng, noop);
  assert.ok(strong.wars.at(-1).power > weak.wars.at(-1).power);
});

test('auto repair mends the weakest wall when treasury is above the reserve, at most once a month', () => {
  const s = createInitialState('cw-auto');
  s.stats.treasury = AUTO_REPAIR_RESERVE + 100;
  for (const p of ensureCity(s)) p.defense = 60;
  setDefense(s, 'hedong', 10);
  const id = autoRepairCities(s);
  assert.equal(id, 'hedong');
  assert.ok(ensureCity(s).find((p) => p.id === 'hedong').defense > 10);
  // 同年同府不重複修繕；其餘府仍可於同月之後的呼叫修繕
  assert.equal(ensureCity(s).find((p) => p.id === 'hedong').repairedYear, s.year);
  assert.notEqual(autoRepairCities(s), 'hedong');
});

test('auto repair does nothing without treasury headroom or when walls are sound', () => {
  const poor = createInitialState('cw-poor');
  poor.stats.treasury = AUTO_REPAIR_RESERVE - 1;
  setDefense(poor, 'hedong', 0);
  assert.equal(autoRepairCities(poor), null);

  const sound = createInitialState('cw-sound');
  sound.stats.treasury = 9999;
  for (const p of ensureCity(sound)) p.defense = AUTO_REPAIR_BELOW + 5;
  assert.equal(autoRepairCities(sound), null);
});

test('in a headless run, walls are actually repaired by the sim policy', () => {
  const r = runSimulation({ seed: 'cw-sim', months: 240, events });
  assert.ok(r.prefectures.some((p) => p.repairedYear !== null), 'at least one prefecture was repaired');
});

test('the works minister makes repairs stronger (repair gain depends on intellect)', () => {
  const s = createInitialState('cw-works');
  s.stats.treasury = AUTO_REPAIR_RESERVE + 100;
  setDefense(s, 'hedong', 10);
  autoRepairCities(s);
  const plain = ensureCity(s).find((p) => p.id === 'hedong').defense - 10;
  const t = createInitialState('cw-works');
  t.stats.treasury = AUTO_REPAIR_RESERVE + 100;
  setDefense(t, 'hedong', 10);
  assignOffice(t, 'o1', 'works');
  autoRepairCities(t);
  assert.equal(officeHolder(t, 'works').id, 'o1');
  assert.ok(ensureCity(t).find((p) => p.id === 'hedong').defense - 10 >= plain);
});

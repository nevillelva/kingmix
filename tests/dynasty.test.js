import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyOption, advanceMonth } from '../src/turn.js';
import { createHeir, tryAccession } from '../src/succession.js';
import { evaluateDynasty } from '../src/ending.js';
import { makeRng } from '../src/rng.js';

const rng = () => makeRng(['dyn']);

function withHeir(s, gender, age) {
  const h = createHeir(s, rng(), { gender, mother: 'c1' });
  h.age = age;
  return h;
}

test('add_consort respects the cap of 8', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { add_consort: 20 } }, rng());
  assert.equal(s.consorts.length, 8);
});

test('birth creates an heir with the requested gender', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { add_consort: 1 } }, rng());
  applyOption(s, { effects: { birth: 'male' } }, rng());
  assert.equal(s.heirs.length, 1);
  assert.equal(s.heirs[0].gender, 'male');
});

test('birth without a consort produces no heir', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { birth: 'male' } }, rng());
  assert.equal(s.heirs.length, 0);
});

test('tutor_teach raises every heir ability, capped at 100', () => {
  const s = createInitialState('t');
  const h = withHeir(s, 'male', 5);
  h.abilities.intellect = 99;
  applyOption(s, { effects: { tutor_teach: 2 } }, rng());
  assert.equal(h.abilities.intellect, 100);
});

test('the strongest adult male heir succeeds a dead emperor', () => {
  const s = createInitialState('t');
  const weak = withHeir(s, 'male', 16);
  const strong = withHeir(s, 'male', 17);
  for (const k of Object.keys(weak.abilities)) weak.abilities[k] = 10;
  for (const k of Object.keys(strong.abilities)) strong.abilities[k] = 90;
  s.alive = false;
  s.endReason = 'death';
  assert.equal(tryAccession(s), true);
  assert.equal(s.emperor.name, strong.name);
  assert.equal(s.dynasty.generation, 2);
  assert.ok(s.heirs.every((h) => h.id !== strong.id));
});

test('a successor resets personal health and keeps the country', () => {
  const s = createInitialState('t');
  withHeir(s, 'male', 20);
  const treasury = s.stats.treasury;
  const agriculture = s.stats.agriculture;
  s.alive = false;
  s.endReason = 'abdicated';
  s.stats.health = 3;
  tryAccession(s);
  assert.equal(s.stats.health, 70);
  assert.equal(s.stats.treasury, treasury);
  assert.equal(s.stats.agriculture, agriculture);
  assert.equal(s.alive, true);
});

test('legacy stats decay to 60% at succession', () => {
  const s = createInitialState('t');
  withHeir(s, 'male', 20);
  const prestige = s.stats.prestige;
  s.alive = false;
  tryAccession(s);
  assert.equal(s.stats.prestige, Math.round(prestige * 0.6 * 100) / 100);
});

test('the dynasty ends when no adult male heir exists', () => {
  const s = createInitialState('t');
  withHeir(s, 'female', 30);
  s.alive = false;
  assert.equal(tryAccession(s), false);
  assert.equal(s.dynasty.ended, true);
  assert.equal(s.chronicle.length, 1);
});

test('female heirs never succeed', () => {
  const s = createInitialState('t');
  withHeir(s, 'female', 30);
  s.alive = false;
  assert.equal(tryAccession(s), false);
});

test('a living emperor cannot be replaced', () => {
  const s = createInitialState('t');
  withHeir(s, 'male', 20);
  assert.equal(tryAccession(s), false);
});

test('advancing a year ages heirs', () => {
  const s = createInitialState('t');
  const h = withHeir(s, 'male', 4);
  s.month = 12;
  advanceMonth(s);
  assert.equal(h.age, 5);
});

test('evaluateDynasty returns four axes and a title for the strongest', () => {
  const s = createInitialState('t');
  s.wars.push({ won: true }, { won: true }, { won: true });
  const e = evaluateDynasty(s);
  assert.deepEqual(Object.keys(e.axes).sort(), ['benevolence', 'civil', 'legacy', 'military']);
  assert.equal(e.axes.military, 15); // 3 勝 × 5 − 0 敗（平衡第五輪）
  assert.ok(e.title.length > 0);
});

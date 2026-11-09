import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { assignOffice, officeHolder } from '../src/offices.js';
import { applyOption, monthlyTick, advanceMonth, MAX_OFFICIALS } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import { generateOfficial, unmetRequirements } from '../src/officials.js';

test('assigning an unfit official records an unfit_office warning but still succeeds', () => {
  const s = createInitialState('t');
  const gaps = assignOffice(s, 'o3', 'chancellor'); // o3 忠誠 55 < 80
  assert.equal(officeHolder(s, 'chancellor').id, 'o3');
  assert.ok(gaps.some((g) => g.key === 'loyalty'));
  assert.equal(s.warnings.at(-1).reason, 'unfit_office');
});

test('a fit official produces no warning', () => {
  const s = createInitialState('t');
  const before = s.warnings.length;
  assignOffice(s, 'o1', 'revenue'); // o1 智慧80 政治80 道德70 符合戶部
  assert.equal(s.warnings.length, before);
});

test('reassigning an office displaces the previous holder', () => {
  const s = createInitialState('t');
  assignOffice(s, 'o3', 'revenue');
  assert.equal(officeHolder(s, 'revenue').id, 'o3');
  assert.equal(s.officials.find((o) => o.id === 'o2').office, null);
});

test('a vacant revenue office costs treasury every month', () => {
  const filled = createInitialState('t');
  const vacant = createInitialState('t');
  vacant.officials.find((o) => o.id === 'o2').office = null;
  const r1 = makeRng(['x']);
  const r2 = makeRng(['x']);
  monthlyTick(filled, r1);
  monthlyTick(vacant, r2);
  assert.ok(vacant.stats.treasury < filled.stats.treasury);
});

test('recruiting adds officials and is capped at MAX_OFFICIALS (court 12 + six governors)', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { recruit: 20 } }, makeRng(['r']));
  assert.equal(s.officials.length, MAX_OFFICIALS);
  assert.equal(s.officials.filter((o) => !o.prefecture).length, MAX_OFFICIALS - 6);
});

test('recruits are deterministic for the same rng seed', () => {
  const a = createInitialState('t');
  const b = createInitialState('t');
  applyOption(a, { effects: { recruit: 3 } }, makeRng(['r']));
  applyOption(b, { effects: { recruit: 3 } }, makeRng(['r']));
  assert.deepEqual(a.officials, b.officials);
});

test('unmetRequirements reports only shortfalls', () => {
  const o = generateOfficial(makeRng(['g']), 'g1');
  o.abilities.intellect = 90;
  o.abilities.politics = 10;
  const gaps = unmetRequirements(o, { intellect: 60, politics: 60 });
  assert.deepEqual(gaps.map((g) => g.key), ['politics']);
});

test('charm grows while health is at least 50 and stops below that', () => {
  const healthy = createInitialState('t');
  const sick = createInitialState('t');
  sick.stats.health = 40;
  monthlyTick(healthy, makeRng(['c']));
  monthlyTick(sick, makeRng(['c']));
  assert.ok(healthy.stats.charm > 150);
  assert.equal(sick.stats.charm, 150);
  advanceMonth(healthy);
});

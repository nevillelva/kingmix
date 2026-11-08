import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';

test('removeOfficial removes the lowest-loyalty official', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { removeOfficial: true } });
  assert.equal(s.officials.length, 2);
  assert.ok(!s.officials.some((o) => o.id === 'o3'));
});

test('official_loyalty_add raises the lowest-loyalty official, capped at 100', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { official_loyalty_add: 15 } });
  assert.equal(s.officials.find((o) => o.id === 'o3').loyalty, 70);
  applyOption(s, { effects: { official_loyalty_add: 999 } });
  assert.ok(s.officials.every((o) => o.loyalty <= 100));
});

test('population_pct applies a percentage change', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { population_pct: -5 } });
  assert.equal(s.stats.population, 950000);
});

test('advanceMonth rolls over the year and increments age', () => {
  const s = createInitialState('t');
  s.month = 12;
  advanceMonth(s);
  assert.equal(s.year, 2);
  assert.equal(s.month, 1);
  assert.equal(s.age, 19);
});

test('health reaching zero ends the reign by death', () => {
  const s = createInitialState('t');
  s.stats.health = 0.05;
  monthlyTick(s);
  assert.equal(s.alive, false);
  assert.equal(s.endReason, 'death');
});

test('reaching age 62 ends the reign by abdication', () => {
  const s = createInitialState('t');
  s.age = 61;
  s.month = 12;
  advanceMonth(s);
  assert.equal(s.endReason, 'abdicated');
});

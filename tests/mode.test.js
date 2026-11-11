import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODES, modeMonths } from '../src/mode.js';
import { createInitialState } from '../src/state.js';
import { runSimulation } from '../src/sim.js';
import { advanceMonth } from '../src/turn.js';
import { serializeSave, exportSave, importSave } from '../src/save.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

test('MODES defines long (600) and short (144) with labels', () => {
  assert.deepEqual(MODES.long, { key: 'long', label: '長局', months: 600 });
  assert.deepEqual(MODES.short, { key: 'short', label: '短局', months: 144 });
  assert.equal(modeMonths('long'), 600);
  assert.equal(modeMonths('short'), 144);
  assert.throws(() => modeMonths('medium'), /unknown mode/);
});

test('default state is long mode', () => {
  assert.equal(createInitialState('m-default').mode, 'long');
});

test('long mode is not capped: advancing past 144 months keeps the emperor alive', () => {
  const s = createInitialState('m-long-advance');
  s.age = 18;
  for (let i = 0; i < 144; i++) advanceMonth(s);
  assert.equal(s.turn, 144);
  assert.equal(s.alive, true);
  assert.equal(s.endReason, null);
});

test('short mode ends at 144 months with endReason short_end', () => {
  const s = createInitialState('m-short-advance', { mode: 'short' });
  for (let i = 0; i < 143; i++) advanceMonth(s);
  assert.equal(s.alive, true);
  advanceMonth(s);
  assert.equal(s.turn, 144);
  assert.equal(s.alive, false);
  assert.equal(s.endReason, 'short_end');
});

test('runSimulation short mode stops at 144 months without accession', () => {
  const r = runSimulation({ seed: 'mode-short-sim', months: 600, events, mode: 'short' });
  assert.equal(r.endReason, 'short_end');
  assert.equal(r.alive, false);
  assert.equal(r.dynastyEnded, false);
  assert.equal(r.generation, 1);
  assert.equal(r.year, 13); // 第 144 月結束時為第 13 年 1 月
  assert.ok(r.ending && r.ending.axes);
});

test('runSimulation default (no mode) still runs long and does not end at 144', () => {
  const r = runSimulation({ seed: 'mode-long-default', months: 200, events });
  assert.notEqual(r.endReason, 'short_end');
});

test('save round trip keeps mode', () => {
  const s = createInitialState('m-save', { mode: 'short' });
  const back = importSave(exportSave(s));
  assert.equal(back.ok, true);
  assert.equal(back.state.mode, 'short');
  const wrapped = JSON.parse(JSON.stringify(serializeSave(s)));
  assert.equal(wrapped.state.mode, 'short');
});

test('an unknown mode is rejected when creating state', () => {
  assert.throws(() => createInitialState('m-bad', { mode: 'epic' }), /unknown mode/);
});

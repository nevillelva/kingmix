import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { ensureCity, markOccupied, occupationText } from '../src/city.js';
import { resolveWar } from '../src/war.js';
import { chronicleLine } from '../src/chronicle.js';
import { runSimulation } from '../src/sim.js';
import { readFileSync } from 'node:fs';
import {
  ensureCapture, tickRebellion, attackCity, canAttackCity, captureStatus, rebellionText, captureText,
  REBEL_MONTHS, REBEL_MORALE,
} from '../src/city-capture.js';

const TARGET = 'hedong';
const pref = (s, id = TARGET) => s.prefectures.find((p) => p.id === id);
const noEffects = () => {};

test('rebellion starts only after REBEL_MONTHS consecutive months below the morale threshold', () => {
  const s = createInitialState('siege-rebel-6');
  ensureCapture(s);
  pref(s).morale = REBEL_MORALE - 1;
  for (let m = 1; m < REBEL_MONTHS; m++) {
    tickRebellion(s);
    assert.equal(pref(s).rebel, false, `should not rebel after ${m} months`);
  }
  assert.equal(pref(s).rebelMonths, REBEL_MONTHS - 1);
  tickRebellion(s);
  assert.equal(pref(s).rebel, true);
  assert.equal(pref(s).rebelMonths, REBEL_MONTHS);
  assert.equal(canAttackCity(s, TARGET).ok, true);
  assert.equal(captureStatus(s, TARGET).rebel, true);
  const entry = s.chronicle.find((c) => c.kind === 'rebellion');
  assert.ok(entry && entry.prefecture === TARGET);
});

test('a month back at or above the threshold resets the consecutive count', () => {
  const s = createInitialState('siege-rebel-reset');
  ensureCapture(s);
  pref(s).morale = REBEL_MORALE - 1;
  for (let m = 0; m < REBEL_MONTHS - 1; m++) tickRebellion(s);
  pref(s).morale = REBEL_MORALE + 5; // 本月回升：連續計數歸零
  tickRebellion(s);
  assert.equal(pref(s).rebelMonths, 0);
  assert.equal(pref(s).rebel, false);
});

test('a successful siege lifts the rebellion', () => {
  const s = createInitialState('siege-rebel-lift');
  ensureCapture(s);
  pref(s).morale = 0;
  for (let m = 0; m < REBEL_MONTHS; m++) tickRebellion(s);
  assert.equal(pref(s).rebel, true);
  let won = null;
  for (let i = 0; i < 50 && !won; i++) {
    const t = createInitialState(`siege-lift-${i}`);
    ensureCapture(t);
    Object.assign(t.stats, { armament: 5000, military: 2000 });
    pref(t).defense = 0;
    pref(t).rebel = true;
    if (attackCity(t, TARGET).won) won = t;
  }
  assert.ok(won, 'expected a winning siege within 50 seeds');
  assert.equal(pref(won).rebel, false);
  assert.equal(pref(won).occupied, false);
  assert.equal(pref(won).rebelMonths, 0);
});

test('a lost war on a named prefecture occupies it; the siege can take it back', () => {
  const s = createInitialState('siege-occ-lost');
  ensureCapture(s);
  const rng = makeRng(['siege-occ-test']);
  const won = resolveWar(s, { prefecture: TARGET, strength: 1e9, reward: {}, loss: {} }, rng, noEffects);
  assert.equal(won, false);
  assert.equal(pref(s).occupied, true);
  assert.equal(captureStatus(s, TARGET).attackable, true);
  const occ = s.chronicle.find((c) => c.kind === 'occupation');
  assert.ok(occ && occ.prefecture === TARGET);
  // 重複戰敗不重複寫入史冊
  resolveWar(s, { prefecture: TARGET, strength: 1e9, reward: {}, loss: {} }, rng, noEffects);
  assert.equal(s.chronicle.filter((c) => c.kind === 'occupation').length, 1);
});

test('a won war, or a lost war with no named prefecture, does not occupy anything', () => {
  const s = createInitialState('siege-occ-none');
  ensureCapture(s);
  const rng = makeRng(['siege-occ-none']);
  assert.equal(resolveWar(s, { prefecture: TARGET, strength: 0.001, reward: {}, loss: {} }, rng, noEffects), true);
  assert.equal(pref(s).occupied, false);
  assert.equal(resolveWar(s, { strength: 1e9, reward: {}, loss: {} }, rng, noEffects), false);
  assert.ok(s.prefectures.every((p) => p.occupied === false));
});

test('markOccupied is idempotent for a known prefecture and ignores unknown ids', () => {
  const s = createInitialState('siege-occ-attack');
  ensureCapture(s);
  assert.equal(markOccupied(s, TARGET), true);
  assert.equal(markOccupied(s, TARGET), false);
  assert.equal(canAttackCity(s, TARGET).ok, true);
  assert.equal(markOccupied(s, 'atlantis'), false);
});

test('old saves without the new fields load with safe defaults', () => {
  const s = createInitialState('siege-compat');
  for (const p of ensureCity(s)) {
    delete p.rebelMonths;
    delete p.rebel;
    delete p.occupied;
    delete p.morale;
  }
  ensureCapture(s);
  const p = pref(s);
  assert.equal(p.rebelMonths, 0);
  assert.equal(p.rebel, false);
  assert.equal(p.occupied, false);
  assert.equal(typeof p.morale, 'number');
  assert.doesNotThrow(() => tickRebellion(s));
  assert.equal(canAttackCity(s, TARGET).reason, 'not_rebel');
});

test('same seed gives identical rebellion and occupation outcomes', () => {
  const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
  const a = runSimulation({ seed: 'siege-det', months: 240, events });
  const b = runSimulation({ seed: 'siege-det', months: 240, events });
  assert.deepEqual(a.chronicle, b.chronicle);
  assert.deepEqual(a.stats, b.stats);
});

test('rebellion and occupation texts are 40–80 characters and render in the chronicle', () => {
  const name = '河東';
  for (const t of [rebellionText(name), captureText(name, false)]) {
    assert.ok(t.length >= 40 && t.length <= 80, `length ${t.length}: ${t}`);
  }
  const occ = occupationText(name);
  assert.ok(occ.length >= 40 && occ.length <= 80, `length ${occ.length}`);
  assert.equal(chronicleLine({ kind: 'rebellion', text: rebellionText(name) }).tag, '叛亂');
  assert.equal(chronicleLine({ kind: 'occupation', text: occ }).tag, '失守');
});

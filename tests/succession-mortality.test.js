import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { createHeir, tryAccession, tickHeirs, childMortalityRate, CHILD_ILLNESS_MONTHS } from '../src/succession.js';
import { makeRng } from '../src/rng.js';

function addHeir(s, gender, age, abilityValue = 50) {
  const h = createHeir(s, makeRng(['m']), { gender, mother: 'c1' });
  h.age = age;
  for (const k of Object.keys(h.abilities)) h.abilities[k] = abilityValue;
  return h;
}

// 同一局、同一月份的皇嗣結算必須完全一致（反 SL 的基礎）
test('child mortality is deterministic for the same seed and month', () => {
  const run = () => {
    const s = createInitialState('det-seed');
    for (let i = 0; i < 6; i++) addHeir(s, 'male', i % 5);
    const survived = [];
    for (let m = 0; m < 240; m++) {
      s.year = 1 + Math.floor(m / 12);
      s.month = (m % 12) + 1;
      tickHeirs(s);
      survived.push(s.heirs.map((h) => h.id).join(','));
    }
    return { survived, chronicle: s.chronicle.map((c) => `${c.heirId}:${c.year}:${c.month}`) };
  };
  assert.deepEqual(run(), run());
});

test('child mortality only applies to heirs under age 5', () => {
  assert.equal(childMortalityRate(4) > 0, true);
  assert.equal(childMortalityRate(5), 0);
  const s = createInitialState('adult-safe');
  const h = addHeir(s, 'male', 5);
  for (let m = 0; m < 2000; m++) {
    s.year = 1 + Math.floor(m / 12);
    s.month = (m % 12) + 1;
    tickHeirs(s);
  }
  assert.ok(s.heirs.includes(h));
});

test('a child death removes the heir and records it in the chronicle', () => {
  let found = null;
  for (let i = 0; i < 500 && !found; i++) {
    const s = createInitialState(`kid-${i}`);
    const h = addHeir(s, 'male', 0);
    for (let m = 0; m < 60 && s.heirs.includes(h); m++) {
      s.year = 1 + Math.floor(m / 12);
      s.month = (m % 12) + 1;
      tickHeirs(s);
    }
    if (!s.heirs.includes(h)) found = { s, h };
  }
  assert.ok(found, 'expected at least one infant death in 500 seeds');
  const entry = found.s.chronicle.find((c) => c.kind === 'heir_death');
  assert.equal(entry.heirId, found.h.id);
  assert.equal(entry.cause, 'child_mortality');
  assert.equal(entry.age, 0);
});

test('two adult male heirs raise the rivalry flag, one does not', () => {
  const s = createInitialState('rival');
  addHeir(s, 'male', 16);
  tickHeirs(s);
  assert.equal(s.dynasty.rivalry, false);
  addHeir(s, 'male', 17);
  s.year = 2;
  s.month = 3;
  tickHeirs(s);
  assert.equal(s.dynasty.rivalry, true);
});

// ---- 幼兒疾病：傳承風險 ----

const tickAt = (s, m) => {
  s.year = 1 + Math.floor(m / 12);
  s.month = (m % 12) + 1;
  tickHeirs(s);
};

test('illness is recorded, lasts CHILD_ILLNESS_MONTHS, then clears', () => {
  let found = null;
  for (let i = 0; i < 300 && !found; i++) {
    const s = createInitialState(`ill-${i}`);
    const h = addHeir(s, 'male', 0);
    for (let m = 0; m < 36 && !h.ill && s.heirs.includes(h); m++) tickAt(s, m);
    if (h.ill) found = { s, h };
  }
  assert.ok(found, 'expected an illness in 300 seeds');
  const { s, h } = found;
  assert.ok(s.chronicle.some((c) => c.kind === 'heir_illness' && c.heirId === h.id));
  for (let m = 1; m < CHILD_ILLNESS_MONTHS && s.heirs.includes(h); m++) tickAt(s, 36 + m);
  if (s.heirs.includes(h)) assert.equal(h.ill, undefined, 'illness cleared after its course');
});

test('only heirs under 5 can fall ill', () => {
  const s = createInitialState('ill-adult');
  const h = addHeir(s, 'male', 5);
  for (let m = 0; m < 600; m++) tickAt(s, m);
  assert.equal(h.ill, undefined);
  assert.ok(s.heirs.includes(h));
});

test('an ill infant dies more often than a healthy one (same seeds, six months)', () => {
  const deaths = (sick) => {
    let n = 0;
    for (let i = 0; i < 1500; i++) {
      const s = createInitialState(`sick-${i}`);
      const h = addHeir(s, 'male', 0);
      if (sick) h.ill = CHILD_ILLNESS_MONTHS;
      for (let m = 0; m < CHILD_ILLNESS_MONTHS; m++) tickAt(s, m);
      if (!s.heirs.includes(h)) n++;
    }
    return n;
  };
  assert.ok(deaths(true) > deaths(false));
});

test('dynasty ends when the emperor dies and only children remain', () => {
  const s = createInitialState('gap');
  addHeir(s, 'male', 9);
  addHeir(s, 'female', 20);
  s.alive = false;
  s.endReason = 'death';
  assert.equal(tryAccession(s), false);
  assert.equal(s.dynasty.ended, true);
  assert.equal(s.emperor.name, '皇帝');
});

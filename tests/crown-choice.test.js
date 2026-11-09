import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { createHeir, tryAccession, tickHeirs, ADULT_AGE } from '../src/succession.js';
import { makeRng } from '../src/rng.js';
import { eligibleCrownHeirs, heirFaction, chooseCrownPrince, CHANGE_CROWN_PRINCE_PRESTIGE_COST, CROWN_PRINCE_SWAP_SHIFT } from '../src/heirs-choice.js';

const WEAK = { intellect: 1, politics: 1, martial: 1, command: 1, virtue: 1 };
const STRONG = { intellect: 99, politics: 99, martial: 99, command: 99, virtue: 99 };

// 皇子以指定生母（後妃）出生，生母家族即其所屬派系
function addHeir(s, { gender = 'male', age = 18, family = 'qingliu', abilities } = {}) {
  let consort = s.consorts.find((c) => c.family === family);
  if (!consort) {
    consort = { id: `c${s.consorts.length + 1}`, family, favor: 50, personality: 'gentle' };
    s.consorts.push(consort);
  }
  const h = createHeir(s, makeRng(['crown-choice', s.heirs.length + s.dynasty.nextHeirId, age]), { gender, mother: consort.id });
  h.age = age;
  if (abilities) h.abilities = { ...abilities };
  return h;
}

function fresh(seed) {
  const s = createInitialState(seed);
  s.consorts = [];
  return s;
}

// ---- 立太子 ----

test('eligible heirs are living adult males, ordered oldest first', () => {
  const s = fresh('cc-elig');
  const young = addHeir(s, { age: ADULT_AGE - 1 });
  const princess = addHeir(s, { gender: 'female', age: 30 });
  const older = addHeir(s, { age: 25 });
  const younger = addHeir(s, { age: 16 });
  assert.deepEqual(eligibleCrownHeirs(s).map((h) => h.id), [older.id, younger.id]);
  assert.ok(!eligibleCrownHeirs(s).includes(young));
  assert.ok(!eligibleCrownHeirs(s).includes(princess));
});

test('first designation by the player is free and sets the crown prince', () => {
  const s = fresh('cc-first');
  const h = addHeir(s, { age: 18 });
  const prestige = s.stats.prestige;
  const qingliu = s.factions.qingliu;
  assert.deepEqual(chooseCrownPrince(s, h.id), { ok: true, changed: false });
  assert.equal(s.dynasty.crownPrince, h.id);
  assert.equal(s.stats.prestige, prestige, 'no prestige cost on first designation');
  assert.ok(s.factions.qingliu > qingliu, 'qingliu backs the crown prince, as with E125');
});

test('ineligible choices are refused without changing state', () => {
  const s = fresh('cc-bad');
  const young = addHeir(s, { age: 3 });
  const princess = addHeir(s, { gender: 'female', age: 30 });
  assert.equal(chooseCrownPrince(s, young.id).reason, 'ineligible');
  assert.equal(chooseCrownPrince(s, princess.id).reason, 'ineligible');
  assert.equal(chooseCrownPrince(s, 'nope').reason, 'ineligible');
  assert.equal(s.dynasty.crownPrince, undefined);
});

test('heir faction comes from the mother consort family', () => {
  const s = fresh('cc-fac');
  const h = addHeir(s, { family: 'hanmen', age: 18 });
  assert.equal(heirFaction(s, h), 'hanmen');
  assert.equal(heirFaction(s, { id: 'x', mother: null }), null);
});

// ---- 改立扣威儀 ----

test('redesignation costs prestige and swaps faction support (old -3, new +3)', () => {
  const s = fresh('cc-change');
  const oldHeir = addHeir(s, { family: 'xunggui', age: 20 });
  const newHeir = addHeir(s, { family: 'hanmen', age: 17 });
  chooseCrownPrince(s, oldHeir.id);
  const prestige = s.stats.prestige;
  const before = { ...s.factions };
  assert.equal(CHANGE_CROWN_PRINCE_PRESTIGE_COST, 1);
  assert.deepEqual(chooseCrownPrince(s, newHeir.id), { ok: true, changed: true });
  assert.equal(s.dynasty.crownPrince, newHeir.id);
  assert.equal(s.stats.prestige, prestige - 1);
  assert.equal(s.factions.xunggui, before.xunggui - CROWN_PRINCE_SWAP_SHIFT);
  assert.equal(s.factions.hanmen, before.hanmen + CROWN_PRINCE_SWAP_SHIFT);
  assert.equal(s.factions.qingliu, before.qingliu, 'qingliu untouched by redesignation');
});

test('redesignation with the same heir, or without enough prestige, changes nothing', () => {
  const s = fresh('cc-deny');
  const a = addHeir(s, { family: 'xunggui', age: 20 });
  const b = addHeir(s, { family: 'hanmen', age: 17 });
  chooseCrownPrince(s, a.id);
  assert.equal(chooseCrownPrince(s, a.id).reason, 'same');
  s.stats.prestige = 0;
  const before = { ...s.factions };
  assert.equal(chooseCrownPrince(s, b.id).reason, 'prestige');
  assert.equal(s.dynasty.crownPrince, a.id);
  assert.deepEqual(s.factions, before);
});

// ---- 太子登基 ----

test('the chosen crown prince succeeds even when a stronger adult son exists', () => {
  const s = fresh('cc-acc');
  const crown = addHeir(s, { age: 16, abilities: WEAK });
  addHeir(s, { age: 25, abilities: STRONG });
  chooseCrownPrince(s, crown.id);
  s.alive = false;
  assert.equal(tryAccession(s), true);
  assert.equal(s.emperor.name, crown.name);
  assert.equal(s.dynasty.crownPrince, null, 'designation consumed by accession');
});

test('after a redesignation, the newest choice is the one who succeeds', () => {
  const s = fresh('cc-acc2');
  const first = addHeir(s, { family: 'xunggui', age: 20, abilities: STRONG });
  const second = addHeir(s, { family: 'hanmen', age: 18, abilities: WEAK });
  chooseCrownPrince(s, first.id);
  chooseCrownPrince(s, second.id);
  s.alive = false;
  tryAccession(s);
  assert.equal(s.emperor.name, second.name);
});

// ---- 太子死亡清空 ----

test('if the crown prince dies, the designation is cleared and the player may choose again', () => {
  const s = fresh('cc-death');
  const h = addHeir(s, { age: 16 });
  const other = addHeir(s, { family: 'hanmen', age: 17 });
  chooseCrownPrince(s, h.id);
  h.age = 0; // 幼年夭折率非零，足以在數百個月內觸發（僅此測試用）
  for (let m = 0; m < 5000 && s.heirs.some((x) => x.id === h.id); m++) {
    s.month = (m % 12) + 1;
    s.year = 1 + Math.floor(m / 12);
    tickHeirs(s);
  }
  assert.ok(!s.heirs.some((x) => x.id === h.id), 'crown prince died');
  assert.equal(s.dynasty.crownPrince, null);
  assert.equal(chooseCrownPrince(s, other.id).changed, false, 'vacancy: no redesignation cost');
});

// ---- 奪嫡保護 ----

test('rivalry never removes the player-chosen crown prince', () => {
  const s = fresh('cc-rival');
  const crown = addHeir(s, { family: 'hanmen', age: 16 });
  const other = addHeir(s, { age: 17 });
  chooseCrownPrince(s, crown.id);
  for (let m = 0; m < 2000 && s.heirs.some((x) => x.id === other.id); m++) {
    s.month = (m % 12) + 1;
    s.year = 1 + Math.floor(m / 12);
    tickHeirs(s);
  }
  assert.ok(!s.heirs.some((x) => x.id === other.id), 'rival removed');
  assert.ok(s.heirs.some((x) => x.id === crown.id), 'crown prince kept');
  assert.equal(s.dynasty.crownPrince, crown.id);
});

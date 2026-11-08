import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SURNAMES, GIVEN_NAMES, TRAITS, PERSONALITIES, FACTION_NAMES,
  generateName, assignTraits, generatePerson, attachPerson, generateConsort,
  describeConsort, describeTraits, traitSum, applyTraitEffects,
} from '../src/people.js';
import { createInitialState } from '../src/state.js';
import { monthlyTick } from '../src/turn.js';
import { runSimulation } from '../src/sim.js';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/officials.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const TRAIT_IDS = new Set(TRAITS.map((t) => t.id));
const ALLOWED_EFFECT_KEYS = new Set(['loyalty', 'corruption', 'people', 'treasury']);

test('name pool: 50 unique surnames and 60 unique given names', () => {
  assert.equal(SURNAMES.length, 50);
  assert.equal(new Set(SURNAMES).size, 50);
  assert.equal(GIVEN_NAMES.length, 60);
  assert.equal(new Set(GIVEN_NAMES).size, 60);
});

test('generated names are deterministic and draw from the pools', () => {
  for (let id = 0; id < 40; id++) {
    const a = generateName('seed-x', `o${id}`);
    const b = generateName('seed-x', `o${id}`);
    assert.equal(a, b);
    const surname = [...SURNAMES].find((s) => a.startsWith(s));
    assert.ok(surname, `${a} starts with a known surname`);
    assert.ok(GIVEN_NAMES.includes(a.slice(surname.length)), `${a} has a known given name`);
  }
});

test('different seeds give different names for the same id (most of the time)', () => {
  let differ = 0;
  for (let id = 0; id < 40; id++) {
    if (generateName('seed-a', `o${id}`) !== generateName('seed-b', `o${id}`)) differ++;
  }
  assert.ok(differ >= 30, `only ${differ}/40 names differ across seeds`);
});

test('16 traits with unique ids, names, descriptions and only known effect keys', () => {
  assert.equal(TRAITS.length, 16);
  assert.equal(TRAIT_IDS.size, 16);
  for (const t of TRAITS) {
    assert.ok(t.name && t.description, `${t.id} has name and description`);
    assert.ok(Object.keys(t.effects).length > 0, `${t.id} has effects`);
    for (const [k, v] of Object.entries(t.effects)) {
      assert.ok(ALLOWED_EFFECT_KEYS.has(k), `${t.id} uses unknown key ${k}`);
      assert.ok(Math.abs(v) <= 0.5, `${t.id}.${k} is small`);
    }
  }
});

test('trait assignment: 2 or 3 distinct valid traits, deterministic per (seed, id)', () => {
  const counts = new Set();
  for (let id = 0; id < 100; id++) {
    const a = assignTraits('seed-t', `o${id}`);
    assert.deepEqual(a, assignTraits('seed-t', `o${id}`));
    assert.ok(a.length === 2 || a.length === 3);
    assert.equal(new Set(a).size, a.length);
    for (const t of a) assert.ok(TRAIT_IDS.has(t));
    counts.add(a.length);
  }
  assert.deepEqual([...counts].sort(), [2, 3]);
});

test('generatePerson and attachPerson are deterministic and set name, age and traits', () => {
  const p = generatePerson('seed-p', 'h1', { minAge: 0, maxAge: 0 });
  assert.deepEqual(p, generatePerson('seed-p', 'h1', { minAge: 0, maxAge: 0 }));
  assert.equal(p.age, 0);
  const o = attachPerson('seed-p', { id: 'o9', age: 99 });
  assert.equal(o.age, generatePerson('seed-p', 'o9').age);
  assert.ok(o.personName && o.traits.length >= 2);
  const kept = attachPerson('seed-p', { id: 'h2', age: 7 }, { withAge: false });
  assert.equal(kept.age, 7);
});

test('consorts: personality among 8 types, family among the 3 factions, deterministic', () => {
  assert.equal(PERSONALITIES.length, 8);
  assert.equal(new Set(PERSONALITIES.map((p) => p.id)).size, 8);
  const seenP = new Set();
  const seenF = new Set();
  for (let i = 1; i <= 60; i++) {
    const c = generateConsort('seed-c', `c${i}`);
    assert.deepEqual(c, generateConsort('seed-c', `c${i}`));
    assert.ok(PERSONALITIES.some((p) => p.id === c.personality));
    assert.ok(FACTIONS.includes(c.family));
    seenP.add(c.personality);
    seenF.add(c.family);
  }
  assert.equal(seenP.size, 8);
  assert.equal(seenF.size, 3);
});

test('describeConsort and describeTraits produce readable Chinese text', () => {
  const c = { id: 'c1', ...generateConsort('seed-d', 'c1') };
  const text = describeConsort(c);
  assert.ok(text.includes(FACTION_NAMES[c.family]));
  assert.ok(text.includes(c.personName));
  const names = describeTraits({ traits: ['loyal', 'honest'] });
  assert.deepEqual(names, ['忠貞', '清廉']);
});

test('traitSum adds effects of all traits a person holds', () => {
  const person = { traits: ['loyal', 'ambitious'] };
  assert.ok(Math.abs(traitSum(person, 'loyalty') - 0.02) < 1e-9);
  assert.equal(traitSum(person, 'corruption'), 0);
});

test('trait effects are zero for officials without traits (existing officials unchanged)', () => {
  const s = createInitialState('plain');
  for (const o of s.officials) o.traits = [];
  const before = JSON.stringify({ off: s.officials, stats: s.stats });
  applyTraitEffects(s);
  assert.equal(JSON.stringify({ off: s.officials, stats: s.stats }), before);
});

test('loyal trait raises loyalty; greedy office holder leaks more treasury than honest one', () => {
  const s = createInitialState('effects');
  const loyal = { id: 'x1', loyalty: 50, office: null, traits: ['loyal'] };
  s.officials = [loyal];
  applyTraitEffects(s);
  assert.ok(Math.abs(loyal.loyalty - 50.1) < 1e-9);

  const treasury0 = 1000;
  const greedy = { id: 'g', loyalty: 50, office: 'revenue', traits: ['greedy'] };
  s.officials = [greedy];
  s.stats.treasury = treasury0;
  applyTraitEffects(s);
  const greedyLoss = treasury0 - s.stats.treasury;

  const honest = { id: 'h', loyalty: 50, office: 'revenue', traits: ['honest'] };
  s.officials = [honest];
  s.stats.treasury = treasury0;
  applyTraitEffects(s);
  const honestLoss = treasury0 - s.stats.treasury;

  assert.ok(greedyLoss > honestLoss, `greedy ${greedyLoss} vs honest ${honestLoss}`);
});

test('loyalty stays within 0-100 and treasury/people within bounds after trait effects', () => {
  const s = createInitialState('clamp');
  s.officials = [{ id: 'z', loyalty: 100, office: null, traits: ['loyal', 'benevolent', 'frugal'] }];
  s.stats.people = 100;
  applyTraitEffects(s);
  assert.ok(s.officials[0].loyalty <= 100);
  assert.ok(s.stats.people <= 100);
  s.stats.treasury = 0;
  s.officials = [{ id: 'y', loyalty: 0, office: 'revenue', traits: ['extravagant', 'greedy'] }];
  applyTraitEffects(s);
  assert.ok(s.stats.treasury >= 0 && s.officials[0].loyalty >= 0);
});

test('createInitialState gives every official a name, age and deterministic traits', () => {
  const a = createInitialState('init-seed');
  const b = createInitialState('init-seed');
  assert.deepEqual(a.officials, b.officials);
  for (const o of a.officials) {
    assert.ok(o.personName);
    assert.ok(Number.isInteger(o.age));
    assert.ok(o.traits.length >= 2 && o.traits.length <= 3);
  }
});

test('monthlyTick stays deterministic with trait effects applied', () => {
  const run = () => {
    const s = createInitialState('tick-det');
    for (let i = 0; i < 24; i++) monthlyTick(s);
    return JSON.stringify({ off: s.officials, stats: s.stats });
  };
  assert.equal(run(), run());
});

test('simulation with the same seed is identical including person fields', () => {
  const a = runSimulation({ seed: 'people-det', months: 120, events });
  const b = runSimulation({ seed: 'people-det', months: 120, events });
  assert.deepEqual(a, b);
});

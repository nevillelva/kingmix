import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { applyOption, monthlyTick } from '../src/turn.js';
import { createHeir, tryAccession, tickHeirs, designateCrownPrince, tickCrownPrince, ADULT_AGE, CROWN_PRINCE_ALARM } from '../src/succession.js';
import { attachPerson, generateConsort, describeConsort, TRAITS } from '../src/people.js';
import { makeRng } from '../src/rng.js';
import { runSimulation } from '../src/sim.js';
import { tickHarem, setDemandOutcome, consortFavor, DEMAND_TERM, FAVOR_INITIAL, FAVOR_STEP } from '../src/harem.js';
import { tickTutorTraits, GOOD_TRAITS, BAD_TRAITS, MAX_HEIR_TRAITS } from '../src/education.js';
import { tickTitles, earnedTitles, titleFlag } from '../src/titles.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

function addHeir(s, { gender = 'male', age = 0, traits } = {}) {
  const rng = makeRng(['gap-heir', s.heirs.length, age]);
  const h = createHeir(s, rng, { gender, mother: null });
  attachPerson(s.seed, h, { withAge: false });
  h.age = age;
  if (traits) h.traits = traits;
  return h;
}

// ---- 1. 立太子 ----

test('E125 option A carries the crown-prince request flag, other options do not', () => {
  const e125 = events.find((e) => e.id === 'E125');
  assert.equal(e125.options[0].effects.setFlag, 'crown_prince_pending');
  for (const o of e125.options.slice(1)) assert.equal(o.effects.setFlag, undefined);
});

test('a pending crown-prince request designates the strongest adult son and clears the flag', () => {
  const s = createInitialState('cp1');
  const weak = addHeir(s, { age: 16 });
  const strong = addHeir(s, { age: 20 });
  strong.abilities = { intellect: 99, politics: 99, martial: 99, command: 99, virtue: 99 };
  weak.abilities = { intellect: 1, politics: 1, martial: 1, command: 1, virtue: 1 };
  applyOption(s, { effects: { setFlag: 'crown_prince_pending' } });
  tickCrownPrince(s);
  assert.equal(s.dynasty.crownPrince, strong.id);
  assert.equal(s.flags.crown_prince_pending, undefined);
});

test('a crown-prince request waits while no adult son exists', () => {
  const s = createInitialState('cp2');
  addHeir(s, { age: ADULT_AGE - 1 });
  applyOption(s, { effects: { setFlag: 'crown_prince_pending' } });
  tickCrownPrince(s);
  assert.equal(s.dynasty.crownPrince, undefined);
  assert.equal(s.flags.crown_prince_pending, true);
  s.heirs[0].age = ADULT_AGE;
  tickCrownPrince(s);
  assert.equal(s.dynasty.crownPrince, s.heirs[0].id);
});

test('designation: qingliu backs the heir, other factions alarmed (officials lose loyalty)', () => {
  const s = createInitialState('cp3');
  const h = addHeir(s, { age: 18 });
  const before = { ...s.factions };
  const loyaltyBefore = Object.fromEntries(s.officials.map((o) => [o.id, o.loyalty]));
  assert.equal(designateCrownPrince(s, h.id), true);
  assert.ok(s.factions.qingliu > before.qingliu);
  assert.equal(s.factions.xunggui, before.xunggui);
  for (const o of s.officials) {
    const expected = o.faction === 'qingliu' ? loyaltyBefore[o.id] : Math.max(0, loyaltyBefore[o.id] - CROWN_PRINCE_ALARM);
    assert.equal(o.loyalty, expected, `${o.id} loyalty`);
  }
});

test('only adult males can be designated crown prince', () => {
  const s = createInitialState('cp4');
  const young = addHeir(s, { age: 3 });
  const princess = addHeir(s, { gender: 'female', age: 30 });
  assert.equal(designateCrownPrince(s, young.id), false);
  assert.equal(designateCrownPrince(s, princess.id), false);
  assert.equal(designateCrownPrince(s, 'nope'), false);
});

test('the crown prince succeeds the throne ahead of a stronger rival', () => {
  const s = createInitialState('cp5');
  const crown = addHeir(s, { age: 16 });
  const rival = addHeir(s, { age: 25 });
  crown.abilities = { intellect: 1, politics: 1, martial: 1, command: 1, virtue: 1 };
  rival.abilities = { intellect: 99, politics: 99, martial: 99, command: 99, virtue: 99 };
  designateCrownPrince(s, crown.id);
  s.alive = false;
  assert.equal(tryAccession(s), true);
  assert.equal(s.emperor.name, crown.name);
  assert.equal(s.dynasty.crownPrince, null);
});

test('rivalry never removes the crown prince; the other adult son is the one at risk', () => {
  const s = createInitialState('cp6');
  const crown = addHeir(s, { age: 16 });
  const other = addHeir(s, { age: 17 });
  designateCrownPrince(s, crown.id);
  for (let m = 0; m < 2000 && s.heirs.some((x) => x.id === other.id); m++) {
    s.month = (m % 12) + 1;
    s.year = 1 + Math.floor(m / 12);
    tickHeirs(s);
  }
  assert.ok(!s.heirs.some((x) => x.id === other.id), 'rival removed');
  assert.ok(s.heirs.some((x) => x.id === crown.id), 'crown prince kept');
  assert.equal(s.dynasty.crownPrince, crown.id);
});

test('if the crown prince dies, the designation is cleared', () => {
  const s = createInitialState('cp7');
  const h = addHeir(s, { age: 16 });
  designateCrownPrince(s, h.id);
  h.age = 0; // 幼年夭折率非零，足以在數百個月內觸發（僅此測試用，主線不會讓成年太子降回幼齡）
  for (let m = 0; m < 5000 && s.heirs.some((x) => x.id === h.id); m++) {
    s.month = (m % 12) + 1;
    s.year = 1 + Math.floor(m / 12);
    tickHeirs(s);
  }
  assert.ok(!s.heirs.some((x) => x.id === h.id), 'heir died');
  assert.equal(s.dynasty.crownPrince, null);
});

test('rivalry: two adult sons raise the flag and record when it began', () => {
  const s = createInitialState('rv1');
  addHeir(s, { age: 16 });
  addHeir(s, { age: 17 });
  tickHeirs(s);
  assert.equal(s.dynasty.rivalry, true);
  assert.ok(s.dynasty.rivalrySince);
});

// ---- 2. 抓周 ----

test('newborn heirs draw 2–3 distinct traits from TRAITS at birth', () => {
  const s = createInitialState('zhuazhou');
  s.consorts.push({ id: 'c1', ...generateConsort(s.seed, 'c1') });
  for (let i = 0; i < 20; i++) applyOption(s, { effects: { birth: i % 2 ? 'male' : 'female' } }, makeRng(['b', i]));
  const ids = new Set(TRAITS.map((t) => t.id));
  for (const h of s.heirs) {
    assert.ok(h.traits.length >= 2 && h.traits.length <= 3, `${h.id} has ${h.traits.length}`);
    assert.equal(new Set(h.traits).size, h.traits.length);
    for (const t of h.traits) assert.ok(ids.has(t));
  }
});

test('accession carries the heir traits onto the emperor', () => {
  const s = createInitialState('zhuazhou2');
  addHeir(s, { age: 18, traits: ['loyal', 'scholarly'] });
  s.alive = false;
  tryAccession(s);
  assert.deepEqual(s.emperor.traits, ['loyal', 'scholarly']);
});

// ---- 3. 太傅教育 ----

test('without a tutor, child heirs gain no traits', () => {
  const s = createInitialState('edu0');
  const h = addHeir(s, { age: 5, traits: ['loyal'] });
  for (let m = 0; m < 240; m++) tickTutorTraits(s);
  assert.deepEqual(h.traits, ['loyal']);
});

test('with a tutor, child heirs acquire traits, capped and without duplicates', () => {
  const s = createInitialState('edu1');
  s.officials.find((o) => o.id === 'o1').office = 'tutor';
  s.officials.find((o) => o.id === 'o1').abilities = { intellect: 100, politics: 50, martial: 60, command: 50, virtue: 100 };
  const h = addHeir(s, { age: 2, traits: ['loyal'] });
  for (let m = 0; m < 600; m++) {
    s.month = (m % 12) + 1;
    s.year = 1 + Math.floor(m / 12);
    tickTutorTraits(s);
  }
  assert.ok(h.traits.length > 1, 'gained at least one trait');
  assert.ok(h.traits.length <= MAX_HEIR_TRAITS);
  assert.equal(new Set(h.traits).size, h.traits.length);
});

test('a stronger tutor yields more trait gains than a weak one (same seed)', () => {
  const gains = (intel) => {
    const s = createInitialState('edu2');
    s.officials.find((o) => o.id === 'o1').office = 'tutor';
    s.officials.find((o) => o.id === 'o1').abilities = { intellect: intel, politics: 50, martial: 60, command: 50, virtue: intel };
    const h = addHeir(s, { age: 2, traits: [] });
    for (let m = 0; m < 240; m++) { s.month = (m % 12) + 1; s.year = 1 + Math.floor(m / 12); tickTutorTraits(s); }
    return h.traits.length;
  };
  assert.ok(gains(100) >= gains(60));
});

test('good and bad trait pools together cover every trait exactly once', () => {
  const all = [...GOOD_TRAITS, ...BAD_TRAITS].sort();
  assert.deepEqual(all, TRAITS.map((t) => t.id).sort());
});

// ---- 4. 嬪妃寵愛值 ----

test('new consorts start with favor in 40–60, deterministically, and the text shows it', () => {
  for (let i = 1; i <= 30; i++) {
    const c = generateConsort('favor-seed', `c${i}`);
    assert.ok(c.favor >= 40 && c.favor <= 60);
    assert.equal(c.favor, generateConsort('favor-seed', `c${i}`).favor);
  }
  const c = { id: 'c1', ...generateConsort('favor-seed', 'c1') };
  assert.ok(describeConsort(c).includes(`寵愛${c.favor}`));
});

test('granted demand raises favor, denied demand lowers it, each resolves once', () => {
  const s = createInitialState('fav1');
  s.consorts.push({ id: 'c1', family: 'qingliu', favor: 50 });
  s.harem = { demands: [{ id: 1, consortId: 'c1', family: 'qingliu', kind: '爵位', turn: 0, status: 'open' }], nextDemandId: 2, waijia: {}, dominant: null, taihou: { power: 0 } };
  setDemandOutcome(s, 1, true);
  assert.equal(s.consorts[0].favor, 50 + FAVOR_STEP);
  assert.equal(setDemandOutcome(s, 1, false), null, 'already resolved');
  s.harem.demands.push({ id: 2, consortId: 'c1', family: 'qingliu', kind: '田產', turn: 0, status: 'open' });
  setDemandOutcome(s, 2, false);
  assert.equal(consortFavor(s.consorts[0]), 50);
});

test('overdue open demands are decided by the emperor; favor stays within 0–100', () => {
  const s = createInitialState('fav2');
  s.consorts.push({ id: 'c1', family: 'hanmen', favor: 100 });
  s.harem = { demands: [{ id: 1, consortId: 'c1', family: 'hanmen', kind: '爵位', turn: 0, status: 'open' }], nextDemandId: 2, waijia: {}, dominant: null, taihou: { power: 0 } };
  s.turn = DEMAND_TERM - 1;
  tickHarem(s);
  assert.equal(s.harem.demands[0].status, 'open', 'not yet due');
  s.turn = DEMAND_TERM;
  tickHarem(s);
  assert.notEqual(s.harem.demands[0].status, 'open');
  assert.ok(s.consorts[0].favor >= 0 && s.consorts[0].favor <= 100);
  assert.equal(FAVOR_INITIAL, 50);
});

// ---- 5. 屬性突破稱號 ----

test('literature and military titles are granted once at 100/150/200 with a small bonus', () => {
  const s = createInitialState('title1');
  s.stats.literature = 100;
  const prestige = s.stats.prestige;
  tickTitles(s);
  assert.equal(s.flags[titleFlag('literature', 100)], '博士');
  assert.equal(s.stats.prestige, prestige + 3);
  tickTitles(s);
  assert.equal(s.stats.prestige, prestige + 3, 'bonus is one-time');
  s.stats.literature = 200;
  tickTitles(s);
  assert.equal(s.flags[titleFlag('literature', 150)], '鴻儒');
  assert.equal(s.flags[titleFlag('literature', 200)], '文宗');
  assert.deepEqual(earnedTitles(s).slice(0, 3), ['博士', '鴻儒', '文宗']);
});

test('military milestone grants its own title and power bonus', () => {
  const s = createInitialState('title2');
  s.stats.military = 150;
  const power = s.stats.power;
  tickTitles(s);
  assert.equal(s.flags[titleFlag('military', 100)], '知兵');
  assert.equal(s.flags[titleFlag('military', 150)], '名將');
  assert.equal(s.stats.power, power + 6);
});

test('titles are awarded inside the monthly tick', () => {
  const s = createInitialState('title3');
  s.stats.literature = 120;
  monthlyTick(s, makeRng(['t3']));
  assert.ok(s.flags[titleFlag('literature', 100)]);
});

// ---- Integration ----

test('600-month runs stay error-free and bounded across seeds with the new systems', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const r = runSimulation({ seed: `gap-${seed}`, months: 600, events });
    assert.ok(Number.isFinite(r.stats.treasury));
    assert.ok(r.stats.people >= 0 && r.stats.people <= 100);
  }
});

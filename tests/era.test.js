import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import {
  DEFAULT_ERA, PRESET_ERAS, toChineseNumber, validateEra, createEra, eraName, eraYearLabel, eraYearText,
  eraCooldownRemaining, changeEra, ERA_CHANGE_PRESTIGE_COST,
} from '../src/era.js';

const stripEra = (s) => { const { era, ...rest } = s; return rest; };

test('validateEra accepts 1–4 CJK characters and trims whitespace', () => {
  assert.deepEqual(validateEra('永'), { ok: true, name: '永' });
  assert.deepEqual(validateEra('  承平  '), { ok: true, name: '承平' });
  assert.deepEqual(validateEra('天下太平'), { ok: true, name: '天下太平' });
});

test('validateEra rejects empty, over-length, and non-CJK names', () => {
  assert.equal(validateEra('').reason, 'empty');
  assert.equal(validateEra('   ').reason, 'empty');
  assert.equal(validateEra(undefined).reason, 'empty');
  assert.equal(validateEra('天下太平盛').reason, 'length');
  assert.equal(validateEra('ab').reason, 'charset');
  assert.equal(validateEra('永和1').reason, 'charset');
  assert.equal(validateEra('永 和').reason, 'charset');
});

test('six presets are all valid and distinct', () => {
  assert.equal(PRESET_ERAS.length, 6);
  assert.equal(new Set(PRESET_ERAS).size, 6);
  for (const n of PRESET_ERAS) assert.equal(validateEra(n).ok, true);
  assert.equal(DEFAULT_ERA, '永和');
});

test('empty or invalid era falls back to the default 永和', () => {
  assert.equal(createEra('').name, DEFAULT_ERA);
  assert.equal(createEra('九個字的年號太長').name, DEFAULT_ERA);
  assert.equal(createInitialState('e').era.name, DEFAULT_ERA);
  assert.equal(eraName({}), DEFAULT_ERA);
});

test('createInitialState stores a chosen era and leaves everything else unchanged', () => {
  const a = createInitialState('seed-x');
  const b = createInitialState('seed-x', { era: '景運' });
  assert.equal(b.era.name, '景運');
  assert.deepEqual(stripEra(a), stripEra(b));
});

test('era does not change the seeded simulation outcome', () => {
  const run = (era) => {
    const s = createInitialState('det-era', { era });
    for (let i = 0; i < 24 && s.alive; i++) {
      const rng = makeRng(['tick', s.year, s.month]);
      advanceMonth(s);
      void rng;
    }
    return JSON.stringify(stripEra(s));
  };
  assert.equal(run('永和'), run('寧康'));
});

test('era module never imports the RNG', () => {
  const src = readFileSync(new URL('../src/era.js', import.meta.url), 'utf8');
  const imports = src.split('\n').filter((l) => l.startsWith('import'));
  assert.equal(imports.some((l) => /rng/i.test(l)), false);
});

test('year label counts from the era start and uses 元 for the first year', () => {
  const s = createInitialState('y');
  assert.equal(eraYearLabel(s), '元');
  assert.equal(eraYearText(s), '永和元年');
  s.year = 3;
  assert.equal(eraYearText(s), '永和三年');
  s.era.since = 3;
  assert.equal(eraYearLabel(s), '元');
});

test('changeEra costs prestige, updates name and era start, and writes a log entry', () => {
  const s = createInitialState('c');
  s.year = 5; s.month = 4;
  const before = s.stats.prestige;
  const r = changeEra(s, '承平');
  assert.deepEqual(r, { ok: true, name: '承平' });
  assert.equal(s.stats.prestige, before - ERA_CHANGE_PRESTIGE_COST);
  assert.equal(eraName(s), '承平');
  assert.equal(eraYearText(s), '承平元年');
  assert.deepEqual(s.era.log.at(-1), { year: 5, month: 4, from: '永和', to: '承平', kind: 'change' });
});

test('changeEra is limited to once per 12 months', () => {
  const s = createInitialState('cd');
  s.stats.prestige = 50;
  s.year = 2; s.month = 1;
  assert.equal(changeEra(s, '承平').ok, true);
  s.month = 6;
  assert.equal(eraCooldownRemaining(s), 7);
  const blocked = changeEra(s, '景運');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'cooldown');
  assert.equal(blocked.remaining, 7);
  s.year = 3; s.month = 1;
  assert.equal(eraCooldownRemaining(s), 0);
  assert.equal(changeEra(s, '景運').ok, true);
});

test('changeEra refuses when prestige is insufficient or the name is invalid', () => {
  const s = createInitialState('p');
  s.stats.prestige = ERA_CHANGE_PRESTIGE_COST - 1;
  assert.equal(changeEra(s, '承平').reason, 'prestige');
  assert.equal(s.era.name, DEFAULT_ERA);
  s.stats.prestige = 10;
  assert.equal(changeEra(s, '太長的年號名').reason, 'length');
  assert.equal(s.stats.prestige, 10);
  assert.equal(s.era.log.length, 0);
});

test('Chinese year labels for 1–99', () => {
  assert.equal(toChineseNumber(2), '二');
  assert.equal(toChineseNumber(10), '十');
  assert.equal(toChineseNumber(12), '十二');
  assert.equal(toChineseNumber(20), '二十');
  assert.equal(toChineseNumber(21), '二十一');
});

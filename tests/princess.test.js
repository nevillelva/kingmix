// 皇女排課與和親（diplomacy.js marryPrincess、fates.js marryOffFate）：皇女可排課、和親效果、命運線寫入出嫁段落與結局，既有和親不變。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applySchemaDefaults } from '../src/schema.js';
import { createHeir } from '../src/succession.js';
import { makeRng } from '../src/rng.js';
import { setCourse, tickCurriculum, curriculumEntry } from '../src/curriculum.js';
import {
  arrangeMarriage, diplomacyOf, eligiblePrincesses, marryPrincess, MARRIAGE_COST,
  MARRIAGE_TRUCE_MONTHS, PRINCESS_ATTITUDE_GAIN, PRINCESS_MARRIAGE_MIN_AGE, PRINCESS_TRUCE_MONTHS,
} from '../src/diplomacy.js';
import { chronicleLine } from '../src/chronicle.js';

function fresh(seed = 'princess-test') {
  const s = applySchemaDefaults(createInitialState(seed));
  s.chronicle = [];
  s.alive = true;
  s.year = 2;
  s.month = 3;
  s.stats.treasury = 500;
  s.fates = {};
  return s;
}

function addDaughter(s, age) {
  const h = createHeir(s, makeRng(['princess', s.heirs.length, age]), { gender: 'female', mother: null });
  h.age = age;
  return h;
}

test('皇女可排課並於季結算計功績（不分性別，六歲方可）', () => {
  const s = fresh();
  const girl = addDaughter(s, 8);
  assert.deepEqual(setCourse(s, girl.id, 'classics'), { ok: true });
  tickCurriculum(s);
  assert.ok(curriculumEntry(s, girl.id).merit > 0);
  const young = addDaughter(s, 5);
  assert.deepEqual(setCourse(s, young.id, 'classics'), { ok: false, reason: 'too_young' });
});

test('eligiblePrincesses：僅非男性且及笄者', () => {
  const s = fresh();
  const old = addDaughter(s, PRINCESS_MARRIAGE_MIN_AGE);
  addDaughter(s, PRINCESS_MARRIAGE_MIN_AGE - 1);
  const boy = createHeir(s, makeRng(['boy']), { gender: 'male', mother: null });
  boy.age = 20;
  assert.deepEqual(eligiblePrincesses(s).map((h) => h.id), [old.id]);
});

test('和親（皇女）失敗時不改動狀態：非皇女、年幼、國庫不足', () => {
  const s = fresh();
  const boy = createHeir(s, makeRng(['b']), { gender: 'male', mother: null });
  boy.age = 20;
  const young = addDaughter(s, 10);
  assert.deepEqual(marryPrincess(s, 'west', boy.id), { ok: false, reason: 'no_princess' });
  assert.deepEqual(marryPrincess(s, 'west', young.id), { ok: false, reason: 'too_young' });
  s.stats.treasury = MARRIAGE_COST - 1;
  const old = addDaughter(s, PRINCESS_MARRIAGE_MIN_AGE);
  const before = JSON.stringify(s);
  assert.deepEqual(marryPrincess(s, 'west', old.id), { ok: false, reason: 'treasury' });
  assert.equal(JSON.stringify(s), before);
});

test('皇女和親效果：停戰期加長、好感上升多於既有聯姻，皇女離宮並清除課表', () => {
  const s = fresh();
  const girl = addDaughter(s, 16);
  setCourse(s, girl.id, 'ethics');
  const base = diplomacyOf(s).west.attitude;
  const treasury = s.stats.treasury;
  const r = marryPrincess(s, 'west', girl.id);
  assert.equal(r.ok, true);
  const d = diplomacyOf(s).west;
  assert.equal(d.kin, PRINCESS_TRUCE_MONTHS);
  assert.ok(PRINCESS_TRUCE_MONTHS > MARRIAGE_TRUCE_MONTHS);
  assert.equal(d.attitude, Math.min(100, base + PRINCESS_ATTITUDE_GAIN));
  assert.equal(s.stats.treasury, treasury - MARRIAGE_COST);
  assert.equal(s.heirs.some((h) => h.id === girl.id), false);
  assert.equal(curriculumEntry(s, girl.id), null);
});

test('皇女和親寫入命運線：出嫁段落與 married 結局，史冊可讀', () => {
  const s = fresh();
  const girl = addDaughter(s, 16);
  marryPrincess(s, 'north', girl.id);
  const seg = s.chronicle.find((c) => c.kind === 'fate');
  const end = s.chronicle.find((c) => c.kind === 'fate_end');
  assert.ok(seg && end);
  assert.match(seg.text, /出嫁北狄/);
  assert.equal(end.cause, 'married');
  assert.match(end.text, /遠嫁異邦/);
  assert.equal(chronicleLine(end).tag, '和親');
  assert.doesNotMatch(seg.text + end.text, /undefined|\{name\}/);
  assert.equal(s.fates[`heir:${girl.id}`].ended, true);
});

test('既有和親（不指定皇女）行為不變：停戰二年、好感 +15', () => {
  const s = fresh();
  const base = diplomacyOf(s).west.attitude;
  assert.deepEqual(arrangeMarriage(s, 'west'), { ok: true });
  assert.equal(diplomacyOf(s).west.kin, MARRIAGE_TRUCE_MONTHS);
  assert.equal(diplomacyOf(s).west.attitude, Math.min(100, base + 15));
  assert.equal(s.chronicle.length, 0);
});

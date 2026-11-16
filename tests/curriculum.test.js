// 皇子課表養成（curriculum.js）：排課、季考結算、繼位評價、主修結局、舊存檔遷移與無課表時的不變性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
const fresh = (seed) => applySchemaDefaults(createInitialState(seed));
import { createHeir, tryAccession, successionScore, heirStrength, ADULT_AGE } from '../src/succession.js';
import { makeRng } from '../src/rng.js';
import { setCourse, tickCurriculum, tutelageOf, curriculumEntry, COURSES, CURRICULUM_CAP, CURRICULUM_MIN_AGE, CURRICULUM_MIN_MERIT } from '../src/curriculum.js';
import { evaluateDynasty } from '../src/ending.js';
import { chronicleLine } from '../src/chronicle.js';
import { migrateState } from '../src/save.js';
import { SCHEMA_FIELDS, applySchemaDefaults, defaultOf } from '../src/schema.js';

function addHeir(s, { gender = 'male', age = 8, abilities } = {}) {
  const h = createHeir(s, makeRng(['curr-heir', s.heirs.length, age]), { gender, mother: null });
  h.age = age;
  if (abilities) Object.assign(h.abilities, abilities);
  return h;
}

test('setCourse 排定課程；年幼、無此皇子或無此課程則拒絕且不改動狀態', () => {
  const s = fresh('curr-a');
  const young = addHeir(s, { age: CURRICULUM_MIN_AGE - 1 });
  const ok = addHeir(s, { age: 8 });
  assert.deepEqual(setCourse(s, young.id, 'classics'), { ok: false, reason: 'too_young' });
  assert.deepEqual(setCourse(s, 'nope', 'classics'), { ok: false, reason: 'no_heir' });
  assert.deepEqual(setCourse(s, ok.id, 'cooking'), { ok: false, reason: 'no_course' });
  assert.equal(curriculumEntry(s, young.id), null);
  assert.deepEqual(setCourse(s, ok.id, 'martial'), { ok: true });
  assert.equal(curriculumEntry(s, ok.id).course, 'martial');
});

test('改排課程保留既有功績與紀錄', () => {
  const s = fresh('curr-b');
  const h = addHeir(s, { age: 8 });
  setCourse(s, h.id, 'classics');
  s.month = 3;
  tickCurriculum(s);
  const merit = curriculumEntry(s, h.id).merit;
  setCourse(s, h.id, 'ethics');
  assert.equal(curriculumEntry(s, h.id).course, 'ethics');
  assert.equal(curriculumEntry(s, h.id).merit, merit);
  assert.equal(curriculumEntry(s, h.id).terms.length, 1);
});

test('季考只在季末月份結算，且提升該科對應能力並寫入史冊', () => {
  const s = fresh('curr-c');
  const h = addHeir(s, { age: 9, abilities: { martial: 50 } });
  setCourse(s, h.id, 'martial');
  s.month = 2;
  tickCurriculum(s);
  assert.equal(curriculumEntry(s, h.id).terms.length, 0);
  s.month = 6;
  tickCurriculum(s);
  const e = curriculumEntry(s, h.id);
  assert.equal(e.terms.length, 1);
  assert.ok(h.abilities.martial > 50);
  const entry = s.chronicle.find((c) => c.kind === 'curriculum_term');
  assert.equal(entry.heirId, h.id);
  assert.equal(entry.course, 'martial');
  assert.ok(['甲', '乙', '丙'].includes(entry.grade));
  assert.equal(chronicleLine(entry).tag, entry.grade);
});

test('能力受上限 CURRICULUM_CAP 約束', () => {
  const s = fresh('curr-d');
  const h = addHeir(s, { age: 10, abilities: { intellect: CURRICULUM_CAP - 1 } });
  setCourse(s, h.id, 'classics');
  for (let i = 0; i < 4; i++) { s.month = 3 + 3 * (i % 4); tickCurriculum(s); }
  assert.equal(h.abilities.intellect, CURRICULUM_CAP);
});

test('未排課程的皇子不受影響（既有行為不變）', () => {
  const s = fresh('curr-e');
  const h = addHeir(s, { age: 9 });
  const before = { ...h.abilities };
  s.month = 3;
  tickCurriculum(s);
  assert.deepEqual(h.abilities, before);
  assert.equal(s.chronicle.length, 0);
});

test('繼位評價：功績計入評價，能讓能力略低者勝出；無功績時評價等於能力總和', () => {
  const s = fresh('curr-f');
  const a = addHeir(s, { age: ADULT_AGE, abilities: { intellect: 50, politics: 50, martial: 50, command: 50, virtue: 50 } });
  const b = addHeir(s, { age: ADULT_AGE, abilities: { intellect: 48, politics: 48, martial: 48, command: 48, virtue: 48 } });
  assert.equal(successionScore(s, a), heirStrength(a));
  s.curriculum.heirs[b.id] = { course: 'classics', merit: 40, terms: [] }; // 40 × 0.5 = 20 > 能力差 10
  assert.ok(successionScore(s, b) > successionScore(s, a));
  s.alive = false;
  s.dynasty.crownPrince = null;
  assert.equal(tryAccession(s), true);
  assert.equal(s.emperor.name, b.name);
});

test('主修結局：功績低於門檻無主修；達門檻依各課總增益定出主修', () => {
  const s = fresh('curr-g');
  const h = addHeir(s, { age: ADULT_AGE });
  s.curriculum.heirs[h.id] = { course: 'statecraft', merit: CURRICULUM_MIN_MERIT - 1, terms: [] };
  assert.equal(tutelageOf(s, h.id), null);
  s.curriculum.heirs[h.id] = {
    course: 'statecraft',
    merit: 10,
    terms: [
      { course: 'statecraft', gain: 3 },
      { course: 'ethics', gain: 4 },
      { course: 'statecraft', gain: 3 },
    ],
  };
  assert.deepEqual(tutelageOf(s, h.id), { course: 'statecraft', title: '謀略長遠之主' });
});

test('登基後 emperor.tutelage 記錄主修，且 evaluateDynasty 帶出結局；清除該皇子課表', () => {
  const s = fresh('curr-h');
  const h = addHeir(s, { age: ADULT_AGE });
  s.curriculum.heirs[h.id] = {
    course: 'martial', merit: 8, terms: [{ course: 'martial', gain: 4 }, { course: 'martial', gain: 4 }],
  };
  s.alive = false;
  tryAccession(s);
  assert.equal(s.emperor.tutelage.course, 'martial');
  assert.equal(evaluateDynasty(s).tutelage.title, '騎射雄健之主');
  assert.equal(s.curriculum.heirs[h.id], undefined);
  assert.ok(Object.keys(COURSES).includes(s.emperor.tutelage.course));
});

test('舊存檔遷移：補上 curriculum 預設值，且不改寫既有欄位', () => {
  assert.ok(SCHEMA_FIELDS.includes('curriculum'));
  assert.deepEqual(defaultOf('curriculum', null), { heirs: {} });
  const old = fresh('curr-i');
  delete old.curriculum;
  const out = migrateState(old);
  assert.deepEqual(out.curriculum, { heirs: {} });
  const again = applySchemaDefaults(structuredClone(out));
  assert.deepEqual(again.curriculum, { heirs: {} });
});

test('無課表時 tickCurriculum 不改動 curriculum 與皇子能力', () => {
  const s = fresh('curr-j');
  const h = addHeir(s, { age: 9 });
  const before = structuredClone(h.abilities);
  s.month = 3;
  tickCurriculum(s);
  assert.deepEqual(s.curriculum, { heirs: {} });
  assert.deepEqual(h.abilities, before);
});

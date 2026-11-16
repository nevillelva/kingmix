// 皇子排課介面（web/ui/render-curriculum.js）：純函式、排課鈕標記、經 setCourse 寫入（不直接改 state）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 替身 DOM：web/ui 模組載入時會讀取 document／window／localStorage（與 ui-split-busy.test.js 相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

// 介面模組於載入時讀取 document，故替身 DOM 設好後才動態匯入。
const { createInitialState } = await import('../src/state.js');
const { applySchemaDefaults } = await import('../src/schema.js');
const { createHeir } = await import('../src/succession.js');
const { makeRng } = await import('../src/rng.js');
const { curriculumEntry, COURSES } = await import('../src/curriculum.js');
const { U } = await import('../web/ui/store.js');
const { canSchedule, curriculumControlHtml, curriculumSummary, setCourseAct } = await import('../web/ui/render-curriculum.js');

function stateWithHeir({ gender = 'male', age = 8 } = {}) {
  const s = applySchemaDefaults(createInitialState(4242));
  const h = createHeir(s, makeRng(['curr-ui', age]), { gender, mother: null });
  h.age = age;
  return { s, h };
}

test('canSchedule：皇子與皇女皆可排課，年滿六歲方可', () => {
  assert.equal(canSchedule({ gender: 'male', age: 5 }), false);
  assert.equal(canSchedule({ gender: 'male', age: 6 }), true);
  assert.equal(canSchedule({ gender: 'female', age: 5 }), false);
  assert.equal(canSchedule({ gender: 'female', age: 10 }), true);
  assert.equal(canSchedule(null), false);
});

test('curriculumSummary：未排課、已排課的文字摘要', () => {
  assert.equal(curriculumSummary(null), '尚未排課');
  assert.equal(curriculumSummary({ course: 'martial', merit: 7, terms: [{}, {}] }), '主修騎射　功績 7　季考 2 次');
});

test('curriculumControlHtml：年幼皇子與皇女皆不出現排課鈕以外之課表（年幼顯示說明）；皇女年滿六歲列出五門課', () => {
  const { s, h } = stateWithHeir({ age: 3 });
  assert.equal(curriculumControlHtml(null, s), '');
  assert.match(curriculumControlHtml(h, s), /年幼/);
  const girl = stateWithHeir({ gender: 'female', age: 9 });
  const gh = curriculumControlHtml(girl.h, girl.s);
  for (const key of Object.keys(COURSES)) assert.match(gh, new RegExp(`data-arg="${girl.h.id}\\|${key}"`));
  h.age = 8;
  const html = curriculumControlHtml(h, s);
  for (const key of Object.keys(COURSES)) assert.match(html, new RegExp(`data-arg="${h.id}\\|${key}"`));
  assert.equal((html.match(/data-act="course"/g) || []).length, 5);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test('setCourseAct 經 setCourse 寫入課表；失敗時回饋原因且不改 state', () => {
  const { s, h } = stateWithHeir({ age: 8 });
  U.state = s;
  assert.equal(setCourseAct(`${h.id}|classics`), true);
  assert.equal(curriculumEntry(s, h.id).course, 'classics');
  assert.match(U.feedback, /已排定經史/);

  const { s: s2, h: young } = stateWithHeir({ age: 2 });
  U.state = s2;
  setCourseAct(`${young.id}|classics`);
  assert.equal(curriculumEntry(s2, young.id), null);
  assert.match(U.feedback, /年幼未入學/);

  setCourseAct('nope|classics');
  assert.equal(U.state.curriculum.heirs.nope, undefined);
  assert.match(U.feedback, /查無此皇子/);
});

test('排課後主修可改，既有功績保留（改排不歸零）', () => {
  const { s, h } = stateWithHeir({ age: 8 });
  U.state = s;
  setCourseAct(`${h.id}|classics`);
  setCourseAct(`${h.id}|ethics`);
  assert.equal(curriculumEntry(s, h.id).course, 'ethics');
  assert.equal(curriculumEntry(s, h.id).merit, 0);
});

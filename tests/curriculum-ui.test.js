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
const { canSchedule, curriculumBlocks, curriculumSummary, setCourseAct } = await import('../web/ui/render-curriculum.js');

// 區塊列平面化：取出所有文字與按鈕項目（供斷言）。
const flatten = (blocks) => blocks.flatMap((b) => (b.t === 'btns' ? b.items.map((it) => ({ label: it.label, onClick: it.onClick })) : [b]));
// 課程鈕：標籤為課名或「主·課名」（伴讀舉薦鈕不計入）。
const courseItems = (blocks) => flatten(blocks).filter((x) => x.label && Object.values(COURSES).some((c) => x.label === c.label || x.label === `主·${c.label}`));

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

test('curriculumBlocks：年幼皇子與皇女皆只顯示說明；年滿六歲列出五門課（皇女亦然）', () => {
  const { s, h } = stateWithHeir({ age: 3 });
  assert.equal(curriculumBlocks(null, s).length, 0);
  const young = flatten(curriculumBlocks(h, s));
  assert.match(young[0].s, /年幼/);
  assert.equal(young.filter((x) => x.onClick).length, 0, '年幼時無任何可點項目');

  const girl = stateWithHeir({ gender: 'female', age: 9 });
  const gItems = courseItems(curriculumBlocks(girl.h, girl.s));
  assert.equal(gItems.length, Object.keys(COURSES).length);

  h.age = 8;
  const items = courseItems(curriculumBlocks(h, s));
  assert.equal(items.length, 5);
  assert.equal(items.filter((x) => /^主·/.test(x.label)).length, 0, '尚未排課時無主修標記');
});

test('curriculumBlocks：排課鈕點擊經 setCourse 寫入，主修標記隨之更新', () => {
  const { s, h } = stateWithHeir({ age: 8 });
  U.state = s;
  courseItems(curriculumBlocks(h, s)).find((x) => x.label === COURSES.classics.label).onClick();
  assert.equal(curriculumEntry(s, h.id).course, 'classics');
  assert.match(U.feedback, /已排定經史/);
  const marked = courseItems(curriculumBlocks(h, s)).filter((x) => x.label.startsWith('主·'));
  assert.equal(marked.length, 1);
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

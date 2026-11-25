// 名臣分頁與結局名單測試：以記錄型替身上下文檢視繪製的文字（空名單、單一大臣、多位大臣、結局名單），並點擊分頁鈕。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 替身 DOM 與 localStorage（web/ui 模組載入時會讀取，與其他 UI 測試相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

// 記錄型替身 2D 上下文：fillText 的字串寫入 log；measureText 依字數回傳寬度。其餘方法皆為 no-op。
function recordingContext(log) {
  const make = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'fillText') return (s) => { log.push(String(s)); };
      if (k === Symbol.toPrimitive) return () => '';
      return make();
    },
    apply: () => make(),
    set: () => true,
  });
  return make();
}

const { createInitialState } = await import('../src/state.js');
const { prepareMonth } = await import('../src/month-start.js');
const { U } = await import('../web/ui/store.js');
const { C } = await import('../web/ui/canvas/core.js');
const { beginFrame, endFrame, dispatchPoint, publishedHits } = await import('../web/ui/canvas/input.js');
const { drawCourt } = await import('../web/ui/render-court.js');
const { inOfficeMinisters } = await import('../web/ui/canvas/ministers.js');
const { renderEnding } = await import('../web/ui/render-ending.js');
const { gameEventPool } = await import('../web/ui/event-pool.js');

const baseEvents = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;

const log = []; // 共用陣列：替身上下文寫入此處，每次繪製前清空（不可重新指派）。

function setup(seed) {
  log.length = 0;
  C.ctx = recordingContext(log);
  C.U = 1; C.W = 420; C.H = 760; C.dpr = 1;
  C.content = { x: 0, y: 12, w: 420, h: 736 };
  C.scroll = 0;
  U.events = baseEvents;
  U.seed = seed;
  U.state = createInitialState(seed);
  U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.reviewedCount = 0;
  U.pendingAction = null;
  U.courtPage = null;
  U.soundOn = false;
  prepareMonth(U.state, gameEventPool(baseEvents, U.state));
}

// 繪製一幀朝堂，回傳發布的可點區域（未停用者）。
function frame() {
  log.length = 0;
  beginFrame();
  drawCourt(C);
  endFrame();
  return publishedHits().filter((h) => !h.disabled);
}

// 第一列（最上方、最左）為朝政鈕，最上方最右為名臣鈕。
const topRow = (hits) => {
  const minY = Math.min(...hits.map((h) => h.y));
  return hits.filter((h) => h.y === minY).sort((a, b) => a.x - b.x);
};

function drawnText() {
  return log.join('|');
}

test('名臣分頁：空名單顯示空狀態，不列出任何大臣', () => {
  setup('ministers-empty');
  for (const o of U.state.officials) o.office = null;
  U.courtPage = 'ministers';
  frame();
  assert.ok(drawnText().includes('朝中暫無在任大臣'), '空名單應顯示空狀態');
  assert.ok(drawnText().includes('朝中在任 0 人'));
});

test('名臣分頁：單一在任大臣列於名單，其餘無官職者不列', () => {
  setup('ministers-single');
  const [chancellor, ...rest] = U.state.officials;
  for (const o of U.state.officials) o.office = null;
  chancellor.office = 'chancellor';
  U.courtPage = 'ministers';
  frame();
  const text = drawnText();
  assert.ok(text.includes(chancellor.personName || chancellor.name), '在任者應列出姓名');
  assert.ok(text.includes('官職　丞相'), '應顯示官職名');
  assert.ok(text.includes('朝中在任 1 人'));
  assert.ok(!text.includes('朝中暫無在任大臣'));
  for (const o of rest) assert.ok(!text.includes(o.personName || o.name), '無官職者不應列出');
});

test('名臣分頁：多位在任大臣皆列出，並標示任期與政績尚無紀錄', () => {
  setup('ministers-multi');
  U.courtPage = 'ministers';
  const holders = inOfficeMinisters(U.state); // 知府（prefecture）不列入朝堂名臣
  assert.ok(holders.length >= 2, '初始局面應有至少兩位在任大臣');
  frame();
  const text = drawnText();
  for (const o of holders) assert.ok(text.includes(o.personName || o.name), `應列出 ${o.id}`);
  assert.ok(text.includes(`朝中在任 ${holders.length} 人`));
  assert.ok(text.includes('任期　尚無紀錄'));
  assert.ok(text.includes('政績　尚無紀錄'));
});

test('名臣分頁：可點分頁鈕切換，再點朝政鈕返回', () => {
  setup('ministers-tabs');
  U.courtPage = null;
  let hits = frame();
  const [court, ministersBtn] = topRow(hits);
  assert.ok(ministersBtn && court, '分頁列應登記兩個可點區域');
  dispatchPoint(ministersBtn.x + ministersBtn.w / 2, ministersBtn.y + ministersBtn.h / 2);
  assert.equal(U.courtPage, 'ministers');
  hits = frame();
  assert.ok(drawnText().includes('在任大臣'), '切換後應繪製名臣頁');
  const [back] = topRow(hits);
  dispatchPoint(back.x + back.w / 2, back.y + back.h / 2);
  assert.equal(U.courtPage, 'court');
});

// 結局名單：以終局狀態繪製結局畫面，檢視名臣列傳區塊。
function endingLog(state) {
  log.length = 0;
  C.ctx = recordingContext(log);
  C.W = 420; C.H = 760; C.U = 1;
  U.state = state;
  renderEnding(C);
  return log.join('|');
}

function endedState(seed) {
  const s = createInitialState(seed);
  s.alive = false;
  s.fates = {};
  s.latePressure = { ...(s.latePressure || {}), minister: null };
  return s;
}

test('結局名單：無入傳者顯示無名臣入傳', () => {
  setup('ending-empty');
  const text = endingLog(endedState('ending-empty'));
  assert.ok(text.includes('名臣列傳'));
  assert.ok(text.includes('本局無名臣入傳'));
});

test('結局名單：單一權臣入傳，列出姓名與類別', () => {
  setup('ending-single');
  const s = endedState('ending-single');
  const [m] = s.officials;
  s.latePressure.minister = { id: m.id, name: m.name, faction: m.faction, year: 1, month: 1 };
  s.fates[`official:${m.id}`] = { arc: m.faction, name: '丞相', stage: 2, last: 0, ended: false, lines: ['權傾朝野之第一段'], endLine: null };
  const text = endingLog(s);
  assert.ok(text.includes('丞相（權臣）'));
  assert.ok(text.includes('權傾朝野之第一段'), '無結局句時以最近一段命運紀事為註記');
  assert.ok(!text.includes('本局無名臣入傳'));
});

test('結局名單：多位入傳（權臣與死諫）皆列出', () => {
  setup('ending-multi');
  const s = endedState('ending-multi');
  const [a, b] = s.officials;
  s.latePressure.minister = { id: a.id, name: a.name, faction: a.faction, year: 1, month: 1 };
  s.fates[`official:${a.id}`] = { arc: a.faction, name: '權臣甲', stage: 2, last: 0, ended: false, lines: ['甲段'], endLine: null };
  s.fates[`official:${b.id}`] = { arc: b.faction, name: '死諫乙', stage: 3, last: 0, ended: true, endCause: 'remonstrance', lines: ['乙段'], endLine: '乙以死諫終。' };
  const text = endingLog(s);
  assert.ok(text.includes('權臣甲（權臣）'));
  assert.ok(text.includes('死諫乙（死諫）'));
  assert.ok(text.includes('乙以死諫終。'));
});

// Canvas 歷代統計對照測試：以替身 2D 上下文繪製空狀態與多筆紀錄，點擊所有分頁命中區域，並驗證統計數字。
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 替身 DOM（web/ui 模組載入時會讀取，與其他 UI 測試相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
}

// 記憶體內 localStorage，每則測試前清空。
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

// 替身 2D 上下文：fillText 的文字記入 drawn，measureText 依字數回傳寬度使換行有實際作用。
const drawn = [];
function recordingContext() {
  const make = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'fillText') return (s) => { drawn.push(String(s)); };
      if (k === Symbol.toPrimitive) return () => '';
      return make();
    },
    apply: () => make(),
    set: () => true,
  });
  return make();
}

const { C, setScreen, currentScreen, drawFrame } = await import('../web/ui/canvas/core.js');
const { beginFrame, endFrame, dispatchPoint, publishedHits } = await import('../web/ui/canvas/input.js');
const { U } = await import('../web/ui/store.js');
const { LEGACY_KEY, drawLegacy } = await import('../web/ui/render-legacy.js');
const { drawLegacyStats, legacyStatsModel, LEGACY_STATS_EMPTY } = await import('../web/ui/canvas/legacy-stats.js');

const run = (i, extra = {}) => ({
  seed: i, mode: 'normal', endReason: 'death', years: 10, finalTitle: '承續基業之主',
  generations: 1, dynastyEnded: false, ...extra,
});

const SAMPLE = [
  run(1, { years: 10, endReason: 'death', finalTitle: '承續基業之主', generations: 1 }),
  run(2, { years: 20, endReason: 'abdicated', finalTitle: '中興之主', generations: 2 }),
  run(3, { years: 30, endReason: 'death', finalTitle: '中興之主', generations: 3 }),
  run(4, { years: 5, endReason: 'assassinated', finalTitle: '短命之君', generations: 1, mode: 'short' }),
];

beforeEach(() => {
  store.clear();
  drawn.length = 0;
  C.ctx = recordingContext();
  C.U = 1; C.W = 420; C.H = 760; C.dpr = 1; C.scroll = 0; C.contentH = 0;
  C.content = { x: 0, y: 12, w: 420, h: 736 };
  U.tab = 'legacy-stats';
  setScreen('legacy-stats');
});

// 繪製一幀並回傳發布的可點區域（未停用者）。
function frame(fn) {
  beginFrame();
  fn(C);
  endFrame();
  return publishedHits().filter(h => !h.disabled);
}

test('空狀態：沒有紀錄時顯示提示，只登記分頁鈕，且統計為零', () => {
  const hits = frame(C2 => drawLegacyStats(C2, []));
  assert.equal(hits.length, 2, '只應有兩顆分頁鈕');
  assert.ok(drawn.includes(LEGACY_STATS_EMPTY), '應顯示空狀態提示');
  const m = legacyStatsModel([]);
  assert.deepEqual({ runs: m.runs, avgYears: m.avgYears, maxYears: m.maxYears, rows: m.rows }, { runs: 0, avgYears: 0, maxYears: 0, rows: [] });
  assert.deepEqual(m.endDist, []);
  assert.deepEqual(m.titleDist, []);
  assert.ok(C.contentH > 0, '空狀態仍應回報內容高度');
});

test('空狀態：localStorage 無紀錄時自動讀取，同樣顯示提示', () => {
  frame(drawLegacyStats);
  assert.ok(drawn.includes(LEGACY_STATS_EMPTY));
});

test('統計數字：局數、平均與最長在位、結局與稱號分布，皆依既有欄位計算', () => {
  const m = legacyStatsModel(SAMPLE);
  assert.equal(m.runs, 4);
  assert.equal(m.avgYears, 16.3, '(10+20+30+5)/4 = 16.25，四捨五入至一位');
  assert.equal(m.maxYears, 30);
  assert.deepEqual(m.endDist.map(d => [d.key, d.count]), [['death', 2], ['abdicated', 1], ['assassinated', 1]]);
  assert.deepEqual(m.titleDist.map(t => [t.title, t.count]), [['中興之主', 2], ['承續基業之主', 1], ['短命之君', 1]]);
});

test('各朝對照：每一局一列，最新一局在最上，並列出在位、世數、結局、稱號', () => {
  const m = legacyStatsModel(SAMPLE);
  assert.equal(m.rows.length, 4);
  assert.equal(m.rows[0].no, 4);
  assert.equal(m.rows[0].years, 5);
  assert.equal(m.rows[0].end, '遇刺');
  assert.equal(m.rows[0].mode, '短局');
  assert.equal(m.rows[3].no, 1);
  assert.equal(m.rows[3].title, '承續基業之主');
});

test('多筆紀錄：繪製統計與各朝對照，分頁鈕仍為兩顆，不拋錯', () => {
  store.set(LEGACY_KEY, JSON.stringify(SAMPLE));
  const hits = frame(drawLegacyStats);
  assert.equal(hits.length, 2);
  assert.ok(drawn.some(s => s.includes('共 4 局')));
  assert.ok(drawn.some(s => s.includes('最長在位 30 年')));
  assert.ok(drawn.some(s => s.includes('第4局') && s.includes('在位 5 年') && s.includes('遇刺')));
  assert.equal(drawn.includes(LEGACY_STATS_EMPTY), false, '有紀錄時不顯示空狀態');
});

test('分頁鈕：點擊「帝王表」切至 legacy 畫面，點擊「統計對照」切回本頁', () => {
  store.set(LEGACY_KEY, JSON.stringify(SAMPLE));
  const hits = frame(drawLegacyStats);
  const [toLegacy] = [...hits].sort((a, b) => a.x - b.x);

  let res = dispatchPoint(toLegacy.x + toLegacy.w / 2, toLegacy.y + toLegacy.h / 2);
  assert.equal(res.handled, true);
  assert.equal(currentScreen(), 'legacy');
  assert.equal(U.tab, 'legacy');

  // 切回統計對照後，再次點擊統計對照本頁鈕應保持本頁。
  setScreen('legacy');
  frame(drawLegacyStats);
  const back = publishedHits().filter(h => !h.disabled).sort((a, b) => a.x - b.x)[1];
  res = dispatchPoint(back.x + back.w / 2, back.y + back.h / 2);
  assert.equal(res.handled, true);
  assert.equal(currentScreen(), 'legacy-stats');
  assert.equal(U.tab, 'legacy-stats');
});

test('畫面登記：legacy-stats 經 drawFrame 繪製，不顯示「尚未移植」', () => {
  store.set(LEGACY_KEY, JSON.stringify(SAMPLE));
  C.canvas = null;
  setScreen('legacy-stats');
  drawFrame(0);
  assert.equal(drawn.some(s => s.includes('尚未移植')), false);
  assert.ok(drawn.some(s => s.includes('統計對照')));
});

test('帝王表頂部加入分頁列，史冊內容位於分頁列之下', () => {
  store.set(LEGACY_KEY, JSON.stringify(SAMPLE));
  C.content = { x: 0, y: 0, w: 400 };
  C.ctx = recordingContext();
  frame(drawLegacy);
  assert.ok(drawn.includes('帝王表') && drawn.includes('統計對照'));
  assert.ok(drawn.indexOf('帝王表') < drawn.indexOf('史冊'), '分頁列先於史冊標題繪製');
});

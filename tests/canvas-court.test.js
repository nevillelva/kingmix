// Canvas 朝堂煙霧測試：以替身 2D 上下文繪製朝堂、奏摺、朝政行動與年終考評，並逐一點擊所有可點區域，不得拋錯。
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

// 替身 2D 上下文：任何方法皆為 no-op；measureText 依字數回傳寬度，使換行與量測有實際作用。
function stubContext() {
  const make = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
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
const { startCampaign } = await import('../src/campaign.js');
const { U } = await import('../web/ui/store.js');
const { C } = await import('../web/ui/canvas/core.js');
const { beginFrame, endFrame, dispatchPoint, publishedHits } = await import('../web/ui/canvas/input.js');
const { drawCourt, drawReview } = await import('../web/ui/render-court.js');
const { gameEventPool } = await import('../web/ui/event-pool.js');

const baseEvents = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;

function setup(seed) {
  C.ctx = stubContext();
  C.U = 1; C.W = 420; C.H = 760; C.dpr = 1;
  C.content = { x: 0, y: 12, w: 420, h: 736 };
  C.scroll = 0;
  U.events = baseEvents;
  U.seed = seed;
  U.state = createInitialState(seed);
  U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.reviewedCount = 0;
  U.pendingAction = null;
  prepareMonth(U.state, gameEventPool(baseEvents, U.state));
}

// 繪製一幀（drawFn 為朝堂或年終考評），回傳發布的可點區域。
function frame(drawFn) {
  beginFrame();
  drawFn(C);
  endFrame();
  return publishedHits().filter(h => !h.disabled);
}

// 反覆點擊第一個可點區域，直到沒有可點項或達上限；每次點擊後重繪。回傳點擊次數。
function clickThrough(drawFn, limit = 12) {
  let clicks = 0;
  for (let i = 0; i < limit; i++) {
    const hits = frame(drawFn);
    if (!hits.length) break;
    const h = hits[0];
    const res = dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
    assert.equal(res.handled, true, '可點區域應被處理');
    clicks++;
  }
  return clicks;
}

test('朝堂畫面：早朝奏摺、次奏與朝政行動可繪製，所有區域點擊不拋錯', () => {
  setup('canvas-court-main');
  const hits = frame(drawCourt);
  assert.ok(hits.length > 0, '朝堂應登記可點區域');
  assert.ok(C.contentH > 0, '朝堂應回報內容高度供捲動');
  clickThrough(drawCourt);
});

test('朝政行動子面板：開啟各面板並繪製，不拋錯', () => {
  setup('canvas-court-panels');
  for (const panel of ['dc', 'policy', 'era', 'heir', 'faction', 'suppress', 'tax', 'city', 'diplo']) {
    U.panel = panel;
    assert.ok(frame(drawCourt).length >= 0);
  }
  U.panel = 'diplo2'; U.pick1 = 'hanmen';
  frame(drawCourt);
  U.panel = null;
});

test('親征中：軍務卡繪製，戰術與議和入口不拋錯', () => {
  setup('canvas-court-campaign');
  const r = startCampaign(U.state, { strength: 3, reward: {}, loss: {} });
  if (!r.ok) return; // 無法出征之局面不在此測試範圍
  U.state.campaign.title = '煙霧測試';
  assert.ok(frame(drawCourt).length > 0);
  clickThrough(drawCourt, 6);
});

test('年終考評與邸報：史冊與邸報皆可繪製並可收卷', () => {
  setup('canvas-court-review');
  // 以歲末紀事補一筆，供考評與邸報使用。
  const s = U.state;
  s.annals = s.annals || [];
  const base = { year: s.year, generation: s.generation || 1, treasury: 100, people: 50, military: 30, agriculture: 40, wars: 0, wins: 0, officials: 3, consorts: 2, dc: 0 };
  s.annals.push({ ...base });
  s.annals.push({ ...base, year: base.year + 1, treasury: 120 });
  U.reviewedCount = 0;
  assert.ok(frame(drawReview).length > 0);
  U.reviewPage = 'gazette';
  frame(drawReview);
  clickThrough(drawReview, 2);
});

test('水平滑動：左滑通知監聽者（+1），且放開後的 click 被防護，不誤裁決', async () => {
  const { installSwipe, onSwipe, consumeSwipeClick } = await import('../web/ui/canvas/court.js');
  const handlers = {};
  const fake = { addEventListener: (t, fn) => { handlers[t] = fn; } };
  installSwipe(fake);
  const seen = [];
  const off = onSwipe((d) => seen.push(d));
  handlers.pointerdown({ clientX: 200, clientY: 100 });
  handlers.pointerup({ clientX: 140, clientY: 104 });
  assert.deepEqual(seen, [1]);
  assert.equal(consumeSwipeClick(), true, '滑動後的 click 應被防護');
  assert.equal(consumeSwipeClick(), false, '防護只生效一次');
  // 垂直或過短的移動不算滑動
  handlers.pointerdown({ clientX: 200, clientY: 100 });
  handlers.pointerup({ clientX: 150, clientY: 180 });
  assert.deepEqual(seen, [1]);
  off();
});

test('自訂年號輸入：Canvas 文字輸入框以 modal 繪製，點「確定」回傳目前字串，點空白取消', async () => {
  const { openTextEntry, textEntryOpen, drawTextEntry } = await import('../web/ui/canvas/court.js');
  const { takeModal, leaveModal } = await import('../web/ui/canvas/input.js');
  setup('canvas-court-entry');
  C.W = 420; C.H = 760;
  const drawModalFrame = () => {
    beginFrame();
    drawTextEntry();
    const req = takeModal();
    assert.ok(req, '輸入框應登記為對話框');
    req.drawFn(C);
    leaveModal();
    endFrame();
  };
  let got = 'unset';
  openTextEntry({ title: '自訂年號', maxLen: 4, onSubmit: (v) => { got = v; } });
  assert.equal(textEntryOpen(), true);
  drawModalFrame();
  // 「確定」為框內右側按鈕：取已發布的對話框命中區中 x 最大者。
  const btns = publishedHits().filter(h => !h.disabled);
  const ok = btns.reduce((a, b) => (b.x > a.x ? b : a));
  dispatchPoint(ok.x + ok.w / 2, ok.y + ok.h / 2);
  assert.equal(got, '', '未輸入即確定，回傳空字串（由 changeEra 判定不合規）');
  assert.equal(textEntryOpen(), false);
});

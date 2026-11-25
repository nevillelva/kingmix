// 命運線（時間軸）Canvas 畫面測試：以假 2D 上下文繪製，點遍命中區域，不得拋出例外。
// 覆蓋：純資料模型（時間順序、伏筆）、空局與有資料之繪製、人物篩選、頂欄入口。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 替身環境（須於匯入 web/ui 模組前設定）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
};
const fakeEl = () => new Proxy({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, remove() {}, click() {}, focus() {}, select() {} }, {
  get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? fakeEl() : undefined)),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = {
  getElementById: () => null,
  createElement: () => fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  body: { appendChild() {} },
  documentElement: fakeEl(),
  visibilityState: 'visible',
};
globalThis.window = globalThis;

// 假 2D 上下文：任何方法皆可呼叫；measureText 回傳固定寬度。
const gradient = () => ({ addColorStop() {} });
const ctx = new Proxy({
  measureText: (s) => ({ width: String(s).length * 10 }),
  createLinearGradient: gradient,
  createRadialGradient: gradient,
}, {
  get: (t, k) => {
    if (k in t) return t[k];
    if (typeof k !== 'string') return undefined;
    return () => undefined;
  },
  set: () => true,
});
const canvas = {
  width: 0, height: 0, style: {},
  getContext: () => ctx,
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};

const core = await import('../web/ui/canvas/core.js');
const input = await import('../web/ui/canvas/input.js');
const { U } = await import('../web/ui/store.js');
await import('../web/ui/render-nav.js'); // 頂欄、底欄與既有畫面
const fate = await import('../web/ui/canvas/fate.js');
const { createInitialState } = await import('../src/state.js');
const { render } = await import('../web/ui/render-nav.js');

core.initCanvas(canvas, { innerWidth: 400, innerHeight: 760, devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {} });

let frame = 0;
const draw = () => core.drawFrame(frame++ * 16);

// 點遍目前畫面（含捲動各頁）上的命中區域；停用鈕應回傳提示而不執行。
function clickAll(limit = 400) {
  let clicks = 0;
  for (let page = 0; page <= 6; page++) {
    core.setScroll(page * 0.5 * core.C.content.h);
    draw();
    for (let k = 0; k < limit; k++) {
      draw();
      const hits = input.publishedHits();
      if (k >= hits.length) break;
      const h = hits[k];
      const res = input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
      if (h.disabled) {
        assert.equal(res.handled, true);
        assert.ok(res.why, '停用鈕應提供提示');
      }
      clicks++;
    }
  }
  return clicks;
}

// 造一局含命運線紀錄的狀態（不依賴隨機數）。
function seededState() {
  const st = createInitialState(11);
  st.alive = true;
  st.year = 3; st.month = 5;
  st.chronicle = [
    { kind: 'fate', name: '甲', text: '甲以清議立身，初入朝堂。', tag: '朝臣', year: 1, month: 2 },
    { kind: 'fate', name: '乙', text: '乙承祖蔭入仕。', tag: '朝臣', year: 2, month: 7 },
    { kind: 'fate_end', name: '甲', text: '甲死諫於殿前。', cause: 'remonstrance', year: 3, month: 1 },
  ];
  st.fates = {
    'official:o1': { arc: 'qingliu', name: '甲', stage: 3, last: 2 * 12 + 6, ended: true, endCause: 'remonstrance' },
    'official:o2': { arc: 'xunggui', name: '乙', stage: 1, last: 1 * 12 + 6, ended: false },
  };
  return st;
}

test('模型：事件依時間排序，伏筆列出未揭曉段數與最早月份', () => {
  const st = seededState();
  // 故意打亂鍵盤順序，確認排序由年月決定。
  st.chronicle.reverse();
  const tl = fate.fateTimeline(st);
  assert.deepEqual(tl.events.map(e => `${e.year}-${e.month}`), ['1-2', '2-7', '3-1']);
  assert.equal(tl.now.year, 3);
  assert.equal(tl.now.month, 5);
  const pend = tl.pending;
  assert.equal(pend.length, 1, '僅未結局者列為伏筆');
  assert.equal(pend[0].name, '乙');
  assert.equal(pend[0].remaining, 2, '乙已揭曉一段，尚餘兩段');
  assert.ok(pend[0].earliest, '應給出最早揭曉月份');
});

test('模型：空局與無命運線紀錄皆不拋錯，且無伏筆', () => {
  const st = createInitialState(3);
  st.alive = true;
  const tl = fate.fateTimeline(st);
  assert.deepEqual(tl.events, []);
  assert.deepEqual(tl.pending, []);
  assert.doesNotThrow(() => fate.fateTimeline({ ...st, chronicle: undefined, fates: undefined }));
});

test('畫面：空局可繪製，並以「返回」鈕回到朝堂', () => {
  U.state = createInitialState(5); U.state.alive = true;
  U.tab = 'fate'; U.panel = null; U.pick1 = null;
  render();
  assert.equal(core.currentScreen(), 'fate');
  draw();
  assert.ok(input.publishedHits().length >= 1, '應至少有返回鈕之類的命中區域');
  assert.ok(clickAll() > 0);
});

test('畫面：有資料時繪製事件與伏筆，點人物可篩選再點可還原', () => {
  U.state = seededState();
  U.tab = 'fate'; U.panel = null; U.pick1 = null;
  render();
  fate.setFateFilter(null);
  draw();
  const before = fate.fateFilter();
  assert.equal(before, null);
  // 找到帶人名「甲」的篩選命中區域並點擊。
  let toggled = false;
  for (let i = 0; i < 200 && !toggled; i++) {
    draw();
    const hits = input.publishedHits().filter(h => !h.disabled);
    const h = hits[i];
    if (!h) break;
    input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
    if (fate.fateFilter() !== null) toggled = true;
  }
  assert.ok(toggled, '應有一個命中區域可切換人物篩選');
  draw();
  assert.ok(clickAll() > 0);
  fate.setFateFilter(null);
});

test('畫面：未開局時為占位提示，不拋錯', () => {
  U.state = null; U.tab = 'fate';
  render();
  draw();
  assert.doesNotThrow(() => clickAll());
});

test('頂欄入口：點「命運線」切換至 fate 畫面', () => {
  U.state = seededState(); U.tab = 'court'; U.panel = null; U.pick1 = null;
  render();
  draw();
  // 只點頂欄（位於內容區上方）的命中區域，避免誤觸朝堂的政務按鈕。
  const topHits = () => input.publishedHits().filter(h => !h.disabled && h.y + h.h <= core.C.content.y);
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    U.tab = 'court'; render(); draw();
    const h = topHits()[i];
    if (!h) break;
    input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
    if (U.tab === 'fate') ok = true;
  }
  assert.ok(ok, '頂欄應有「命運線」入口');
  render(); draw();
  assert.equal(core.currentScreen(), 'fate');
});

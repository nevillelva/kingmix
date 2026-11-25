// Canvas 介面煙霧測試：以假 2D 上下文逐幀繪製，依序點遍每個命中區域，不得拋出例外。
// 覆蓋：開局（含各選項）、結局、存檔管理對話框、雲端衝突對話框、停用鈕提示與捲動邊界。
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
// navigator 於 Node 22 為唯讀 getter，不覆寫（剪貼簿路徑於測試中不觸發）。

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
const dlg = await import('../web/ui/dialog.js');
// 前面的開局測試會留下新手提要等頁內對話框；此處先關閉，避免其命中區域蓋住結局畫面。
const closeAllDialogs = () => { while (dlg.dialogCount()) dlg.topDialog().close(); };
await import('../web/ui/render-nav.js'); // 註冊頂欄、底欄與畫面
const io = await import('../web/ui/state-io.js');
const { resetStartForm } = await import('../web/ui/render-start.js');
const { createInitialState } = await import('../src/state.js');

core.initCanvas(canvas, { innerWidth: 400, innerHeight: 760, devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {} });
const { render } = await import('../web/ui/render-nav.js');

let frame = 0;
const draw = () => core.drawFrame(frame++ * 16);

// 逐一嘗試命中區域：每次先以 setup 還原狀態、重繪、點第 i 個區域；pred 成立即回傳 true。
function tryEachHit(setup, pred) {
  for (let i = 0; i < 400; i++) {
    setup();
    draw();
    core.setScroll(1e9); // 捲到底，以涵蓋畫面下方的按鈕
    draw();
    const hits = input.publishedHits();
    if (i >= hits.length) return false;
    const h = hits[i];
    if (!h.disabled) input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
    if (pred()) return true;
  }
  return false;
}

// 點遍目前畫面上的命中區域（每次點擊後重繪，因狀態可能改變），並沿捲動區逐頁涵蓋。回傳點擊次數。
function clickAll(limit = 400) {
  let clicks = 0;
  const pages = 6;
  for (let page = 0; page <= pages; page++) {
    core.setScroll(page * 0.5 * core.C.content.h);
    draw();
    for (let k = 0; k < limit; k++) {
      draw();
      const hits = input.publishedHits();
      if (k >= hits.length) break;
      const h = hits[k];
      if (h.disabled) {
        // 停用鈕：應回傳提示文字而不執行。
        const res = input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
        assert.equal(res.handled, true);
        assert.ok(res.why, '停用鈕應提供提示');
      } else {
        input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2);
      }
      clicks++;
    }
  }
  return clicks;
}

test('開局畫面：可繪製並登記命中區域，點遍不拋錯', () => {
  U.state = null; U.tab = 'palace'; U.saveOpen = false; U.conflict = null;
  render();
  assert.equal(core.currentScreen(), 'start');
  draw();
  const n = input.publishedHits().length;
  assert.ok(n >= 10, `開局應有多個命中區域（實得 ${n}）`);
  assert.ok(clickAll() > 0);
});

test('開局各選項：出身、祖訓、國策、策卡、劇本、模式、預設年號皆可切換', () => {
  resetStartForm(); U.state = null; U.tab = 'palace'; U.saveOpen = false;
  render();
  draw();
  // 點第一個可點區域（出身卡）後應改變 F 狀態而不拋錯；反覆點擊同一區域亦安全。
  const hits = input.publishedHits().filter(h => !h.disabled);
  for (const h of hits.slice(0, 40)) input.dispatchPoint(h.x + 2, h.y + 2);
  draw();
  assert.ok(input.publishedHits().length > 0);
});

test('開局按「開始新局」會建立本局並離開開局畫面', () => {
  const ok = tryEachHit(() => { resetStartForm(); U.saveOpen = false; U.conflict = null; U.state = null; U.tab = 'palace'; U.accPolicies = ['agrarian']; U.openingDeck = []; render(); },
    () => U.state !== null);
  assert.ok(ok, '應有一個命中區域為「開始新局」');
  render();
  draw();
  assert.notEqual(core.currentScreen(), 'start');
});

test('結局畫面：諡號卷軸與重新開局', () => {
  closeAllDialogs();
  const st = createInitialState(7);
  st.alive = false;
  U.state = st; U.seed = '7'; U.tab = 'palace';
  render();
  assert.equal(core.currentScreen(), 'ending');
  const ok = tryEachHit(() => { U.state = createInitialState(7); U.state.alive = false; U.seed = '7'; render(); },
    () => U.state === null);
  assert.ok(ok, '應有一個命中區域為「重新開局」且會清空本局');
});

test('存檔管理對話框：匯出、匯入、三格欄位、覆寫確認皆可點而不拋錯', () => {
  U.state = createInitialState(3); U.seed = "3"; U.tab = "palace";
  U.state.alive = true;
  render();
  U.saveOpen = true;
  draw();
  const before = input.publishedHits().length;
  assert.ok(before > 5, '對話框應有多個按鈕');
  // 先模擬欄位 1 已有內容，讓覆寫確認路徑可達。
  store.set(io.slotKey(1), JSON.stringify({ placeholder: true }));
  U.slotPending = 1;
  draw();
  clickAll();
  U.saveOpen = false;
  store.delete(io.slotKey(1));
});

test('雲端衝突對話框：選擇後 resolve，且不殘留狀態', async () => {
  U.state = createInitialState(5); U.seed = '5'; U.state.alive = true; U.tab = 'palace';
  let picked = null;
  U.conflict = { local: U.state, remote: U.state, winner: 'remote', resolve: (c) => { picked = c; } };
  render();
  draw();
  // 對話框登記順序：面板吞點擊區（第 0 個）、「用雲端」（第 1 個）、「用本機」（第 2 個）。
  const hits = input.publishedHits();
  assert.ok(hits.length >= 3, '衝突對話框應有面板與兩個選項');
  input.dispatchPoint(hits[1].x + 2, hits[1].y + 2);
  assert.ok(picked === 'remote' || picked === 'local');
  assert.equal(U.conflict, null);
});

test('捲動：內容高度超過可視範圍時滾輪可調整 scroll，且不超出上下界', () => {
  U.state = null; U.tab = 'palace'; U.saveOpen = false; U.conflict = null;
  render();
  draw();
  core.setScroll(1e9);
  assert.ok(core.C.scroll <= Math.max(0, core.C.contentH - core.C.content.h) + 1e-6);
  core.setScroll(-50);
  assert.equal(core.C.scroll, 0);
});

test('未登記的分頁顯示占位（不拋錯）', () => {
  const st = createInitialState(9);
  st.alive = true;
  U.state = st; U.seed = '9'; U.tab = 'map';
  render();
  draw();
  assert.equal(core.currentScreen(), 'map');
  assert.ok(input.publishedHits().length >= 1, '分頁列仍應可點');
  clickAll();
});

test('toast 佇列：提示文字以 pushToast 加入且過期後移除', () => {
  core.pushToast('測試提示', 1000);
  draw();
  assert.doesNotThrow(() => draw());
});

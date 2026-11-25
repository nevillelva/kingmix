import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── 最小替身 DOM：openDialog 只用到 createElement／body／document 的 keydown 監聽與元素的 remove／focus。
function makeDom() {
  const listeners = new Map();
  const anyStub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : anyStub()),
    apply: () => anyStub(), set: () => true,
  });
  const doc = {
    visibilityState: 'visible',
    getElementById: () => anyStub(),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild(el) { el.isConnected = true; el.parentNode = this; this._kids = (this._kids || []).concat(el); return el; } },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    createElement() {
      const el = {
        isConnected: false, attrs: {}, focused: 0, clicks: [], _html: '',
        setAttribute(k, v) { this.attrs[k] = String(v); },
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; },
        querySelector() { return { focus() { el.focused++; } }; },
        addEventListener(type, fn) { if (type === 'click') el.clicks.push(fn); },
        remove() { this.isConnected = false; },
      };
      return el;
    },
  };
  const count = (type) => listeners.get(type)?.size ?? 0;
  const fire = (type, ev) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(ev); };
  return { doc, count, fire };
}

const dom = makeDom();
globalThis.document = dom.doc;
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { openDialog } = await import('../web/ui/dialog.js');
const { bgmLookahead, BGM_STEP, BGM_LOOKAHEAD } = await import('../web/ui/audio.js');

// ── 對話框（Canvas）：堆疊、Esc、相容層 openDialog ─────────────
const { openCanvasDialog, dialogCount, drawDialogs } = await import('../web/ui/dialog.js');
const { C } = await import('../web/ui/canvas/core.js');
const { beginFrame, takeModal, leaveModal, endFrame, closeModal, dispatchPoint, publishedHits } = await import('../web/ui/canvas/input.js');

function ctxStub() {
  const noop = () => {};
  const known = { measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }) };
  return new Proxy({}, { get: (t, k) => (k in known ? known[k] : noop), set: () => true });
}
// 模擬一幀：登記對話框請求並發布命中表（與 core.drawFrame 的順序相同）。
function frame() {
  C.ctx ??= ctxStub(); C.W = 640; C.H = 480; C.U = 1;
  beginFrame(); drawDialogs(); const req = takeModal(); if (req) req.drawFn(C); leaveModal(); endFrame();
}

test('openCanvasDialog：堆疊計數；關閉兩次只呼叫一次 onClose', () => {
  let n = 0;
  const close = openCanvasDialog({ title: 'x', onClose: () => n++ });
  assert.equal(dialogCount() >= 1, true);
  close(); close();
  assert.equal(n, 1);
});

test('drawDialogs：無對話框時不登記 modal；Esc 關閉最上層並呼叫 onClose', () => {
  frame();
  let closed = 0;
  const close = openCanvasDialog({ title: 'x', dismissible: true, onClose: () => closed++ });
  frame();
  dom.fire('keydown', { key: 'Escape' });
  closeModal();
  assert.equal(closed, 1);
  assert.equal(dialogCount(), 0);
  close();
});

test('相容層 openDialog：html 按鈕（data-dlg）點擊時 onClick 收到對應 key；背景點擊 e.target 為 close.el', () => {
  frame();
  const seen = [];
  const close = openDialog({ html: '<p>提示</p><button data-dlg="ok">好</button>', onClick: (e, c) => { seen.push(e.target === c.el ? 'backdrop' : e.target.closest('[data-dlg]')?.dataset.dlg); c(); } });
  frame();
  const hit = publishedHits().find((h) => h.w > 0 && h.h > 0 && h.w < 640);
  assert.ok(hit, '應有按鈕命中區');
  dispatchPoint(hit.x + hit.w / 2, hit.y + hit.h / 2);
  assert.deepEqual(seen, ['ok']);
  assert.equal(dialogCount(), 0);
  close();
});

test('相容層 openDialog：無 onClick 時背景點擊不關閉（以吞掉點擊實現）', () => {
  frame();
  const close = openDialog({ html: '<p>x</p>' });
  frame();
  dispatchPoint(1, 1);
  assert.equal(dialogCount(), 1);
  close();
});

// ── bgmLookahead（音訊時鐘前瞻排程） ─────────────────────────

test('bgmLookahead：只排入落在前瞻視窗內的節拍，並以音訊時刻推進', () => {
  const st = { next: null, step: 0 };
  const out = [];
  bgmLookahead(st, 10, (f, w, v) => out.push({ f, w, v }));
  // 首次自 now+0.05 起算，前瞻 0.15 內只有一個節拍。
  assert.equal(out.filter(x => x.v === 0.055).length, 1);
  assert.ok(Math.abs(out[0].w - 0.05) < 1e-9);
  assert.ok(Math.abs(st.next - (10.05 + BGM_STEP)) < 1e-9);
});

test('bgmLookahead：重複呼叫不重複排同一節拍；每 8 拍加一次低音', () => {
  const st = { next: null, step: 0 };
  const whens = [];
  let now = 0;
  for (let i = 0; i < 40; i++) {
    bgmLookahead(st, now, (f, w, v) => { if (v === 0.055) whens.push(now + w); });
    now += 0.1;
  }
  // 40 次 × 0.1 秒 = 4 秒，節拍間隔 0.9 秒，應約 4–5 個主音，且時刻嚴格遞增。
  for (let i = 1; i < whens.length; i++) assert.ok(whens[i] > whens[i - 1]);
  for (let i = 1; i < whens.length; i++) assert.ok(Math.abs((whens[i] - whens[i - 1]) - BGM_STEP) < 1e-6, '節拍間隔為 BGM_STEP');
});

test('bgmLookahead：低音每 8 步一次（step%8===1）', () => {
  const st = { next: null, step: 0 };
  let bass = 0, main = 0;
  let now = 0;
  for (let i = 0; i < 200; i++) {
    bgmLookahead(st, now, (f, w, v) => { if (v === 0.047) bass++; if (v === 0.055) main++; });
    now += 0.2;
  }
  assert.ok(main > 0);
  // 每 8 拍一次低音（首拍即加），主音中有休止（null）的拍不計主音，但低音仍依 step 計。
  assert.ok(bass >= Math.floor(st.step / 8) && bass <= Math.ceil(st.step / 8) + 1);
});

test('bgmLookahead：落後（now 超過排程時刻）時自 now+0.05 重新起算，不補排過去的節拍', () => {
  const st = { next: 5, step: 3 };
  const out = [];
  bgmLookahead(st, 100, (f, w) => out.push(w));
  assert.ok(out.every(w => w >= 0));
  assert.ok(Math.abs(st.next - (100.05 + BGM_STEP)) < 1e-9);
  assert.ok(BGM_LOOKAHEAD > 0.05);
});

// ── 原始碼層級檢查 ───────────────────────────────────────────

test('Canvas 入口：index.html 僅含單一畫布與隱藏輸入橋接，main.js 啟動畫布並顯示載入畫面', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../web/ui/main.js', import.meta.url), 'utf8');
  assert.match(html, /<canvas id="game"/);
  assert.match(html, /<input id="ime"/);
  assert.doesNotMatch(html, /<main id="app"/, '不再使用 DOM 版面容器');
  assert.match(main, /initCanvas\(canvas\);/);
  assert.match(main, /setScreen\('boot'\);/);
  assert.match(main, /setScreen\('bootError'\);/, '事件資料失敗時顯示錯誤畫面');
});

test('overlays.js 用 openDialog、render-ruler.js 用 canvas modal，皆不再各自管理 keydown', () => {
  const read = (f) => readFileSync(new URL(`../web/ui/${f}`, import.meta.url), 'utf8');
  const overlays = read('overlays.js');
  assert.match(overlays, /import \{ openDialog \} from '\.\/dialog\.js'/, 'overlays.js imports openDialog');
  assert.doesNotMatch(overlays, /addEventListener\('keydown'|removeEventListener\('keydown'/, 'overlays.js has no own keydown listener');
  // 帝王面板已改為 Canvas：以 input.js 的 modal 承接對話框與 Esc／點背景關閉，不再自行管理 keydown。
  const ruler = read('render-ruler.js');
  assert.match(ruler, /import \{ modal \} from '\.\/canvas\/input\.js'/, 'render-ruler.js uses canvas modal');
  assert.doesNotMatch(ruler, /addEventListener\('keydown'|removeEventListener\('keydown'/, 'render-ruler.js has no own keydown listener');
});

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

// ── openDialog ──────────────────────────────────────────────

test('openDialog：掛上外層、套用 class 與屬性，並將焦點給 initialFocus', () => {
  const close = openDialog({ html: '<b>x</b>', className: 'nianhao', attrs: { role: 'dialog' }, initialFocus: '.go' });
  const ov = close.el;
  assert.equal(ov.className, 'nianhao');
  assert.equal(ov.attrs.role, 'dialog');
  assert.equal(ov.innerHTML, '<b>x</b>');
  assert.equal(ov.isConnected, true);
  assert.equal(ov.focused, 1);
  close();
});

test('openDialog：預設 class 為 dlg-ov；Esc 關閉並移除 keydown 監聽，onClose 只呼叫一次', () => {
  let closedCount = 0;
  const before = dom.count('keydown');
  const close = openDialog({ html: '', onClose: () => closedCount++ });
  assert.equal(close.el.className, 'dlg-ov');
  assert.equal(dom.count('keydown'), before + 1);
  dom.fire('keydown', { key: 'Escape' });
  assert.equal(close.el.isConnected, false);
  assert.equal(dom.count('keydown'), before);
  assert.equal(closedCount, 1);
  close();
  assert.equal(closedCount, 1, '重複 close 無副作用');
});

test('openDialog：非 Esc 按鍵不關閉', () => {
  const close = openDialog({ html: '' });
  dom.fire('keydown', { key: 'Enter' });
  assert.equal(close.el.isConnected, true);
  close();
});

test('openDialog：外部已移除節點時，下一次 keydown 會清理監聽而不再處理', () => {
  const before = dom.count('keydown');
  let closedCount = 0;
  const close = openDialog({ html: '', onClose: () => closedCount++ });
  close.el.remove(); // 外部移除
  dom.fire('keydown', { key: 'Escape' });
  assert.equal(dom.count('keydown'), before, '監聽已被清除');
  assert.equal(closedCount, 0, '外部移除不視為 close');
});

test('openDialog：onClick 收到 (event, close)；未提供 onClick 時點擊不關閉', () => {
  let seen = null;
  const close = openDialog({ html: '', onClick: (e, c) => { seen = { e, c }; } });
  assert.equal(close.el.clicks.length, 1);
  close.el.clicks[0]({ target: close.el });
  assert.equal(seen.c, close);
  assert.equal(close.el.isConnected, true);
  close();

  const plain = openDialog({ html: '' });
  assert.equal(plain.el.clicks.length, 0);
  plain();
});

test('openDialog：initialFocus 可為函式', () => {
  let got = null;
  const close = openDialog({ html: '', initialFocus: (ov) => { got = ov; return null; } });
  assert.equal(got, close.el);
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

test('overlays.js 與 render-ruler.js 改用 openDialog，不再各自管理 keydown', () => {
  const read = (f) => readFileSync(new URL(`../web/ui/${f}`, import.meta.url), 'utf8');
  for (const f of ['overlays.js', 'render-ruler.js']) {
    const src = read(f);
    assert.match(src, /import \{ openDialog \} from '\.\/dialog\.js'/, `${f} imports openDialog`);
    assert.doesNotMatch(src, /addEventListener\('keydown'|removeEventListener\('keydown'/, `${f} has no own keydown listener`);
  }
});

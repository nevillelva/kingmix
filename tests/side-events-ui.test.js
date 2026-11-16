// 側線玩法介面（web/ui/render-side.js）：純函式文字、煉丹可用性、側線開關與替身 DOM。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { ALCHEMY_COST, alchemyStatus, attemptAlchemy, setSideEventsEnabled, tourWithEncounter, ENCOUNTERS } from '../src/side-events.js';
import { tourTo } from '../src/tour.js';

// ── 替身 DOM：web/ui 模組載入時會讀取 document／window／localStorage（與 ui-split-busy.test.js 相同做法）。
const fakeEls = new Map();
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}
const fakeEl = (id) => ({ id, textContent: '', disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
const docGet = document.getElementById;
document.getElementById = (id) => (fakeEls.has(id) ? fakeEls.get(id) : docGet.call(document, id));

const ui = await import('../web/ui/render-side.js');
const { U } = await import('../web/ui/store.js');

test('煉丹可用性：可用、已煉過、國庫不足、側線關閉各有明確原因', () => {
  const s = createInitialState('ui-alch-avail');
  s.stats.treasury = 500;
  const ok = ui.alchemyAvailability(s);
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, null);
  assert.match(ok.text, /耗國庫 20/);

  attemptAlchemy(s);
  const cd = ui.alchemyAvailability(s);
  assert.equal(cd.ok, false);
  assert.equal(cd.reason, 'cooldown');
  assert.match(cd.text, /本月已煉過丹/);

  const poor = createInitialState('ui-alch-poor');
  poor.stats.treasury = ALCHEMY_COST - 1;
  assert.equal(ui.alchemyAvailability(poor).reason, 'treasury');
  assert.match(ui.alchemyAvailability(poor).text, /國庫不足/);

  const off = createInitialState('ui-alch-off');
  setSideEventsEnabled(off, false);
  assert.equal(ui.alchemyAvailability(off).reason, 'disabled');
  assert.match(ui.alchemyAvailability(off).text, /側線已關閉/);
});

test('alchemyStatus 與 attemptAlchemy 的裁決一致，且唯讀不改 state', () => {
  const s = createInitialState('ui-status-agree');
  const before = JSON.stringify(s);
  assert.deepEqual(alchemyStatus(s), { ok: true, reason: null });
  assert.equal(JSON.stringify(s), before, 'alchemyStatus 不應改動 state');
  s.stats.treasury = 0;
  assert.equal(alchemyStatus(s).reason, 'treasury');
  assert.equal(attemptAlchemy(s).reason, 'treasury');
});

test('煉丹結果文字：成功、失敗與未成皆為繁體中文且含效果', () => {
  const win = ui.alchemyResultText({ ok: true, outcome: 'success', effects: { health: 6, charm: 3 } });
  assert.match(win, /煉丹成功/);
  assert.match(win, /健康\+6、聲色\+3/);
  const lose = ui.alchemyResultText({ ok: true, outcome: 'failure', effects: { health: -4 } });
  assert.match(lose, /煉丹失敗/);
  assert.match(lose, /健康-4/);
  assert.equal(ui.alchemyResultText({ ok: false, reason: 'cooldown' }), '本月已煉過丹，每月至多一次。');
  assert.equal(ui.alchemyResultText(null), '煉丹未成。');
});

test('奇遇覆蓋層 HTML 轉義標題並列出效果；無府名時改稱途中', () => {
  const enc = { id: 'x', title: '<b>測</b>', narrative: '敘事', effects: { benevolence: 3, morale: -4 } };
  const html = ui.encounterHtml(enc, '河東');
  assert.doesNotMatch(html, /<b>測<\/b>/);
  assert.match(html, /&lt;b&gt;測&lt;\/b&gt;/);
  assert.match(html, /於河東/);
  assert.match(html, /仁德\+3、所至府民心-4/);
  assert.match(ui.encounterHtml(enc, ''), /途中/);
});

test('效果文字涵蓋奇遇表與煉丹表所有鍵（無未譯之英文鍵名）', () => {
  const keys = new Set([...ENCOUNTERS.flatMap((e) => Object.keys(e.effects)), 'health', 'charm']);
  for (const k of keys) {
    assert.doesNotMatch(ui.effectsText({ [k]: 1 }), /^[a-z_]+\+1$/, `${k} 未譯`);
  }
});

test('側線開關文字與 aria 狀態隨 state.sideEvents.enabled 變化，未開局時停用', () => {
  assert.equal(ui.sideToggleLabel(true), '側線奇遇：開');
  assert.equal(ui.sideToggleLabel(false), '側線奇遇：關');

  const btn = fakeEl('side-toggle');
  fakeEls.set('side-toggle', btn);
  const prev = U.state;
  try {
    U.state = null;
    ui.paintSideToggle();
    assert.equal(btn.textContent, '側線奇遇：開');
    assert.equal(btn.disabled, true);

    U.state = createInitialState('ui-toggle');
    ui.paintSideToggle();
    assert.equal(btn.disabled, false);
    assert.equal(btn.attrs['aria-pressed'], 'true');

    setSideEventsEnabled(U.state, false);
    ui.paintSideToggle();
    assert.equal(btn.textContent, '側線奇遇：關');
    assert.equal(btn.attrs['aria-pressed'], 'false');
  } finally {
    U.state = prev;
    fakeEls.delete('side-toggle');
  }
});

test('側線關閉時，巡幸結果與主線 tourTo 相同且無奇遇', () => {
  const plain = createInitialState('ui-off-same');
  const off = createInitialState('ui-off-same');
  setSideEventsEnabled(off, false);
  const rp = tourTo(plain, 'hedong');
  const ro = tourWithEncounter(off, 'hedong');
  assert.equal(ro.encounter, null);
  assert.equal(ro.ok, rp.ok);
  assert.deepEqual(off.stats, plain.stats);
  assert.equal(off.location, plain.location);
});

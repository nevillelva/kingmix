// 稽核修補第 1 組（fix/audit-g1）：圖鑑接線、季節與墨跡、宣戰停用、名臣列傳、禪位入口、完工紅點、水墨輿圖。
// 注意：本檔刻意不 import render-gallery.js，圖鑑是否登記完全取決於 render-nav.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 替身 DOM 與 localStorage（與其他 UI 測試相同做法）。
{
  const listeners = new Map();
  const anyStub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : anyStub()),
    apply: () => anyStub(), set: () => true,
  });
  globalThis.document ??= {
    visibilityState: 'visible', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild(el) { return el; } }, createElement: () => anyStub(), documentElement: { dataset: {} },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}

// 名臣列傳的跨局紀錄須在 unlock-store 首次讀取前寫入（其結果會快取）。
const UNLOCK_KEY = 'kingmix-unlocks-v1';
localStorage.setItem(UNLOCK_KEY, JSON.stringify({
  version: 2,
  titles: [],
  biographies: [
    { runKey: 'seed-a:1', role: 'official', id: 'o1', name: '甲臣', tag: 'minister', year: 5, lines: ['甲臣初入朝'], endLine: '甲臣善終' },
    { runKey: 'seed-b:1', role: 'official', id: 'o2', name: '乙臣', tag: 'remonstrance', year: 7, lines: [], endLine: '乙臣死諫' },
  ],
}));

const { U } = await import('../web/ui/store.js');
const { C, currentScreen, drawFrame } = await import('../web/ui/canvas/core.js');
const { render } = await import('../web/ui/render-nav.js');
const overlays = await import('../web/ui/overlays.js');
const { drawThrone, biographyEntries, openResign, isResignOpen } = await import('../web/ui/render-officials.js');
const { declareWarBlocked } = await import('../web/ui/render-actions.js');
const { goZone } = await import('../web/ui/render-palace.js');
const { pendingMarks } = await import('../src/palace.js');
const mapSvg = await import('../web/ui/map-svg.js');
const { createInitialState } = await import('../src/state.js');
const { applySchemaDefaults } = await import('../src/schema.js');

function ctxStub() {
  const noop = () => {};
  const known = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return new Proxy({}, { get: (t, k) => (k in known ? known[k] : noop), set: () => true });
}
C.ctx = ctxStub(); C.W = 640; C.H = 480; C.U = 1; C.content = { x: 0, y: 40, w: 640, h: 400 };

// 以引擎初始狀態為底（與 canvas-d 測試相同），再覆寫本測試需要的欄位。
const mk = (over = {}) => ({
  ...applySchemaDefaults(createInitialState('audit-g1')), alive: true, year: 3, month: 5, ...over,
});

test('圖鑑（E-037）：只載入導覽時，點圖鑑即可登記並繪製圖鑑畫面', () => {
  U.state = mk();
  U.events = [];
  U.tab = 'gallery';
  render();
  assert.equal(currentScreen(), 'gallery');
  C.contentH = 0;
  drawFrame(0);
  assert.ok(C.contentH > 0, '圖鑑畫面應由 drawFrame 繪出（未登記時 contentH 為 0）');
});

test('季節（E-071、E-073）：render() 依月份套用季節，無局時移除', () => {
  U.state = mk({ month: 5 });
  U.tab = 'gallery';
  render();
  assert.equal(document.documentElement.dataset.season, 'spring');
  U.state = null;
  U.tab = 'court';
  render();
  assert.equal(document.documentElement.dataset.season, undefined);
});

test('墨跡轉場（E-074）：畫面鍵變更時 render() 呼叫 inkFlash 記下新畫面', () => {
  U.state = mk();
  U.lastScreen = 'court';
  U.tab = 'gallery';
  render();
  assert.equal(U.lastScreen, 'gallery');
  render();
  assert.equal(U.lastScreen, 'gallery', '同畫面重繪不改變畫面鍵');
});

test('宣戰停用（E-002）：盟國或戰役進行中時停用；一般鄰國與無戰役時可宣戰', () => {
  U.state = mk({ campaign: null });
  assert.equal(declareWarBlocked({ allied: false }, false), false);
  assert.equal(declareWarBlocked({ allied: true }, false), true, '盟國不可宣戰');
  assert.equal(declareWarBlocked({ allied: false }, true), true, '本月行動用盡亦停用');
  U.state = mk({ campaign: { status: 'active' } });
  assert.equal(declareWarBlocked({ allied: false }, false), true, '戰役進行中不可再宣戰');
  U.state = mk({ campaign: { status: 'ended' } });
  assert.equal(declareWarBlocked({ allied: false }, false), false, '已結束之戰役不阻擋');
});

test('名臣列傳（E-029）：帝王頁依本種子顯示已寫入之列傳，不混入他局', () => {
  U.state = mk({ seed: 'seed-a' });
  const names = biographyEntries('seed-a').map((b) => b.name);
  assert.deepEqual(names, ['甲臣']);
  assert.deepEqual(biographyEntries('seed-none'), []);
  U.tab = 'throne';
  C.contentH = 0;
  drawFrame(0);
  assert.ok(C.contentH > 0);
});

test('禪位（E-052）：入口在帝王頁，openResign 可達；無呼叫者之 openResignDialog 已移除', () => {
  assert.equal(overlays.openResignDialog, undefined);
  U.state = mk();
  U.tab = 'throne';
  render();
  assert.equal(currentScreen(), 'throne');
  openResign();
  assert.equal(isResignOpen(), true);
  C.contentH = 0;
  drawFrame(0);
  assert.equal(isResignOpen(), true, '帝王頁重繪不得關閉禪位對話框');
});

test('完工紅點（B-U7）：點選完工地塊即確認並清除 facilityDone 標記', () => {
  U.state = mk({ facilityDone: { armory: true } });
  U.state.stats = { ...U.state.stats, treasury: 0 };
  assert.ok(pendingMarks(U.state).some((m) => m.buildingId === 'armory' && m.reason === 'completed'));
  goZone({ id: 'armory', facility: 'armory' });
  assert.equal(U.state.facilityDone.armory, undefined, '標記應清除');
  assert.equal(pendingMarks(U.state).some((m) => m.buildingId === 'armory' && m.reason === 'completed'), false);
});

test('水墨山河（B-039）：backdrop 以淡墨與青線繪出，不可點', () => {
  const calls = [];
  const g = new Proxy({}, { get: (t, k) => (k === 'stroke' ? () => calls.push('stroke') : k === 'quadraticCurveTo' || k === 'bezierCurveTo' ? () => calls.push(k) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  mapSvg.drawInkBackdrop(g);
  assert.ok(calls.filter((c) => c === 'stroke').length >= 2, '山脈與河流皆應描線');
  assert.ok(calls.includes('bezierCurveTo'), '河流以三段貝茲曲線繪出');
});

test('水墨暈染（B-040）：具 wash 之府縣以 shadowBlur 模擬暈染，描邊不帶陰影', () => {
  const prev = globalThis.Path2D;
  globalThis.Path2D = class { constructor(d) { this.d = d; } };
  try {
    const seen = [];
    const stack = [];
    const g = {
      shadowBlur: 0, shadowColor: 'transparent', shadowOffsetX: 0, shadowOffsetY: 0,
      save() { stack.push({ shadowBlur: this.shadowBlur, shadowColor: this.shadowColor, shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY }); },
      restore() { Object.assign(this, stack.pop() ?? {}); },
      setLineDash() {},
      fill() { seen.push({ op: 'fill', blur: this.shadowBlur }); },
      stroke() { seen.push({ op: 'stroke', blur: this.shadowBlur }); },
    };
    mapSvg.drawShape(g, 'M0 0 L10 0 L10 10 Z', { fill: '#fff', stroke: '#000', wash: true });
    const fill = seen.find((s) => s.op === 'fill');
    const stroke = seen.find((s) => s.op === 'stroke');
    assert.ok(fill.blur > 0, '填色應帶 shadowBlur');
    assert.equal(stroke.blur, 0, '描邊應清晰');
    assert.equal(g.shadowBlur, 0, '繪製後陰影設定須還原');
    seen.length = 0;
    mapSvg.drawShape(g, 'M0 0 L10 0 L10 10 Z', { fill: '#fff' });
    assert.equal(seen[0].blur, 0, '未指定 wash 時不加暈染');
  } finally {
    globalThis.Path2D = prev;
  }
});

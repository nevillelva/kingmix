// 稽核第 2 組修補（fix/audit-g2）：宮城與輿圖畫面的文字與回饋行。以替身畫布記錄 fillText 之內容，不依賴瀏覽器。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 替身 DOM 與 localStorage（與 canvas-b-smoke.test.js 相同做法） ──
{
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const el = () => ({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {} });
  globalThis.document ??= { getElementById: () => el(), createElement: () => el(), body: el(), documentElement: { dataset: {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
}

// 替身畫布：記錄所有 fillText 的文字；其餘方法皆為空操作。
let drawn = [];
function recordingCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillText') return (s) => { drawn.push(String(s)); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 12 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const core = await import('../web/ui/canvas/core.js');
const { U } = await import('../web/ui/store.js');
const { createInitialState } = await import('../src/state.js');
const { PALACE_LAYOUT, palaceZones } = await import('../web/ui/canvas/palace.js');
const { FACILITIES } = await import('../src/facilities.js');
const { PREFECTURE_DEFS } = await import('../src/economy.js');
await import('../web/ui/render-palace.js');
await import('../web/ui/render-map.js');

core.C.ctx = recordingCtx();
core.C.canvas = { style: {} };
core.resizeCanvas(960, 720, 1);

// 繪製一幀指定畫面，回傳其間所有 fillText 之文字。
function drawScreen(name) {
  drawn = [];
  core.setScreen(name);
  core.drawFrame(0);
  return drawn.slice();
}

const freshState = () => {
  const s = createInitialState('canvas-audit-g2');
  s.stats.treasury = 500;
  return s;
};

const FACILITY_LANDMARKS = PALACE_LAYOUT.filter((z) => z.facility);

// ── A-084：玄武門裝飾文字 ──
test('宮城地景補回「玄武門」裝飾文字（與午朝廣場並列）', () => {
  U.state = freshState();
  U.tab = 'palace';
  U.feedback = '';
  const texts = drawScreen('palace');
  assert.ok(texts.includes('玄武門'), '宮城應繪出「玄武門」');
  assert.ok(texts.includes('午朝廣場'), '既有「午朝廣場」應保留');
});

// ── A-075–A-079、B-007–B-011：地塊名稱與設施頁正式名一致 ──
test('設施地塊的版面名稱（PALACE_LAYOUT.n）與 FACILITIES 正式名一致', () => {
  assert.equal(FACILITY_LANDMARKS.length, 5, '五處設施空地');
  for (const z of FACILITY_LANDMARKS) {
    assert.equal(z.n, FACILITIES[z.facility].name, `${z.facility} 的地塊名稱`);
  }
});

test('palaceZones 之設施地塊標籤取自設施正式名', () => {
  const facilityName = Object.fromEntries(Object.entries(FACILITIES).map(([k, v]) => [k, v.name]));
  const zones = palaceZones({ facilityName });
  for (const z of zones.filter((x) => x.facility)) {
    assert.equal(z.label, FACILITIES[z.facility].name, `${z.facility} 的標籤`);
  }
});

test('宮城繪出設施正式名，且不再出現舊簡稱', () => {
  U.state = freshState();
  U.tab = 'palace';
  U.feedback = '';
  const texts = drawScreen('palace');
  for (const name of ['御花園', '太醫院', '翰林院', '翻書院', '武庫']) {
    assert.ok(texts.includes(name), `應繪出「${name}」`);
  }
  for (const old of ['園林', '醫館', '翰林', '藏書']) {
    assert.ok(!texts.includes(old), `不應再繪出舊簡稱「${old}」`);
  }
});

// ── A-010、B 回饋項：宮城頁補畫 U.feedback ──
test('宮城頁於說明列下方繪出 U.feedback', () => {
  U.state = freshState();
  U.tab = 'palace';
  U.feedback = '測試：宮城回饋行';
  const texts = drawScreen('palace');
  U.feedback = '';
  assert.ok(texts.includes('測試：宮城回饋行'));
});

// ── A-103、A-104、A-035、B-042：輿圖頁補畫 U.feedback ──
test('輿圖頁（未選州府）繪出 U.feedback', () => {
  U.state = freshState();
  U.tab = 'map';
  U.mapSel = null;
  U.feedback = '側線奇遇已關閉。';
  const texts = drawScreen('map');
  U.feedback = '';
  assert.ok(texts.includes('側線奇遇已關閉。'));
});

test('輿圖頁（已選州府）亦繪出 U.feedback', () => {
  U.state = freshState();
  U.tab = 'map';
  U.mapSel = PREFECTURE_DEFS[0].id;
  U.mapNote = '';
  U.feedback = '奇遇抉擇：嚴懲。';
  const texts = drawScreen('map');
  U.feedback = '';
  U.mapSel = null;
  assert.ok(texts.includes('奇遇抉擇：嚴懲。'));
});

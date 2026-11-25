// Canvas 介面（feat/canvas-b）煙霧測試：以替身畫布繪製宮城、後宮、輿圖、設施四個畫面與其覆蓋層，
// 並逐一執行每一個可點區域的回呼，不得拋錯。替身 DOM／localStorage 與 cards.test.js 相同做法。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 替身 DOM 與 localStorage（web/ui 模組於載入時會讀取 document／window／localStorage） ──
{
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const el = () => ({ innerHTML: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {} });
  globalThis.document ??= { getElementById: () => el(), createElement: () => el(), body: el(), documentElement: { dataset: {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
}

// 替身 2D 上下文：任何未定義的方法皆為空操作；measureText 依字數估寬。
function fakeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 12 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const core = await import('../web/ui/canvas/core.js');
const inp = await import('../web/ui/canvas/input.js');
const { U } = await import('../web/ui/store.js');
const { createInitialState } = await import('../src/state.js');
const { createHeir } = await import('../src/succession.js');
const { makeRng } = await import('../src/rng.js');
const { pickAllConsorts } = await import('../src/draft.js');
const { palaceZones, PALACE_LAYOUT, zoneRect, isoPx, setIso } = await import('../web/ui/canvas/palace.js');
const { haremModel, draftAvailability, isDraftOpen } = await import('../web/ui/canvas/harem.js');
const { mapDetailModel } = await import('../web/ui/render-map.js');
await import('../web/ui/render-palace.js');
const { facilityCards } = await import('../web/ui/render-facility.js');
const { effectsText, alchemyAvailability, encounterHtml, sideToggleLabel } = await import('../web/ui/render-side.js');

const W = 960, H = 720;
core.C.ctx = fakeCtx();
core.C.canvas = { style: {} };
core.resizeCanvas(W, H, 1);

function freshState() {
  const s = createInitialState('canvas-b-smoke');
  s.stats.treasury = 500;
  pickAllConsorts(s);
  createHeir(s, makeRng(['smoke']), { gender: 'male', mother: s.consorts[0].id });
  s.heirs[0].age = 8;
  return s;
}

// 繪製一幀（與瀏覽器相同的 drawFrame 流程），發布命中表。
function frame(name) {
  core.setScreen(name);
  core.drawFrame(0);
  return inp.publishedHits();
}

// 逐一點擊畫面上每個可點區域（以其中心點，經 dispatchPoint 判定）；不得拋錯。
function exerciseScreen(name, max = 200) {
  U.state = freshState();
  U.tab = name;
  let clicks = 0;
  for (let k = 0; k < max; k++) {
    const hs = frame(name);
    if (k >= hs.length) break;
    const h = hs[k];
    assert.doesNotThrow(() => inp.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2), `點擊 ${name} 第 ${k} 個區域`);
    clicks++;
  }
  frame(name);
  return clicks;
}

test('宮城：地標對應既有分頁與設施，且繪製後登記點擊區域', () => {
  const s = freshState();
  const zones = palaceZones({ pend: 1, marks: new Set(['court']), counts: { consorts: s.consorts.length, heirs: s.heirs.length, annals: 0 }, facilities: {}, jobs: {}, facilityName: {} });
  assert.equal(zones.length, PALACE_LAYOUT.length);
  const tabs = new Set(zones.filter((z) => z.nav).map((z) => z.nav.tab));
  for (const t of ['throne', 'harem', 'court', 'officials', 'dc']) assert.ok(tabs.has(t), `缺少分頁 ${t}`);
  assert.equal(zones.filter((z) => z.facility).length, 5, '五處設施空地');
  assert.ok(zones.find((z) => z.id === 'taihe').s.includes('待批 1 件'));
  assert.equal(zones.find((z) => z.id === 'taihe').marked, true, '太和殿（朝堂）有紅點');
  setIso(W, H);
  const [x, y] = isoPx(0, 0, 0);
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  const r = zoneRect(PALACE_LAYOUT[0]);
  assert.ok(r.w > 0 && r.h > 0);
});

test('宮城畫面：點遍所有可點區域（地標、輿圖、後宮、設施、側線）不拋錯', () => {
  const n = exerciseScreen('palace');
  assert.ok(n >= 7, `點擊區域數 ${n}`);
});

test('後宮畫面與選秀覆蓋層：嬪妃、外戚、太后、子嗣與選秀鈕皆可點，且選秀結果寫入引擎', () => {
  const s = freshState();
  U.state = s;
  const m = haremModel(s);
  assert.equal(m.consorts.length, 4);
  assert.equal(m.heirs.length, 1);
  assert.ok(m.dom.length > 0);
  const av = draftAvailability(s);
  assert.equal(av.slate.length, 4);
  assert.equal(av.canAll, true, '4 人加 4 人恰為上限 8，仍可雨露均霑');
  pickAllConsorts(s);
  assert.equal(draftAvailability(s).canAll, false, '已滿 8 人，不得再雨露均霑');
  const n = exerciseScreen('harem');
  assert.ok(n >= 3, `後宮區域數 ${n}`);
});

test('選秀：後宮有空位時，由畫面開啟覆蓋層並可獨寵一人入宮', () => {
  U.state = createInitialState('draft-ui');
  U.state.stats.treasury = 500;
  U.state.consorts = [];
  U.tab = 'harem';
  let hs = frame('harem');
  const open = hs.find((h) => h.x > W - 200 && h.y < 60);
  assert.ok(open, '找到選秀納妃鈕');
  inp.dispatchPoint(open.x + open.w / 2, open.y + open.h / 2);
  hs = frame('harem');
  assert.equal(isDraftOpen(), true, '覆蓋層已開啟');
  // 每張秀女卡有一個底板（block）與一個點擊區，同位置；依 x 去重即得四張卡。
  const slots = [...new Map(hs.filter((h) => h.w > 60 && h.h > 100).map((h) => [h.x + h.w / 2, h])).values()];
  assert.equal(slots.length, 4, '四位秀女皆可點');
  inp.dispatchPoint(slots[0].x + slots[0].w / 2, slots[0].y + slots[0].h / 2);
  assert.equal(U.state.consorts.length, 1, '獨寵一人後入宮 1 位');
  assert.equal(U.state.stats.treasury, 500 - 10, '國庫扣除獨寵成本');
  frame('harem');
  assert.equal(isDraftOpen(), false, '入宮後覆蓋層關閉');
});

test('輿圖畫面：每府詳情模型正確，點遍所有可點區域不拋錯', () => {
  const s = freshState();
  U.state = s;
  const d = mapDetailModel(s, 'jingzhao');
  assert.ok(d && d.name, '府詳情');
  assert.equal(mapDetailModel(s, 'no-such-pref'), null);
  U.mapSel = 'jingzhao';
  const n = exerciseScreen('map');
  assert.ok(n >= 6, `輿圖區域數 ${n}`);
});

test('設施畫面：六座設施卡片與興建鈕；點遍所有可點區域不拋錯', () => {
  const s = freshState();
  U.state = s;
  const cards = facilityCards(s);
  assert.equal(cards.length, 5);
  assert.ok(cards.every((c) => c.name && c.next));
  const n = exerciseScreen('facility');
  assert.ok(n >= 1, `設施區域數 ${n}`);
});

test('側線：效果文字、煉丹可用性與奇遇對話 HTML（供測試）', () => {
  assert.equal(effectsText({ morale: 4, benevolence: -2 }), '所至府民心+4、仁德-2');
  const av = alchemyAvailability(freshState());
  assert.equal(typeof av.ok, 'boolean');
  assert.equal(sideToggleLabel(false), '側線奇遇：關');
  const html = encounterHtml({ title: '試', narrative: '甲', effects: {} }, '京兆');
  assert.match(html, /微服私訪・試/);
});

test('畫面切換：currentScreen 反映最後設定之畫面', () => {
  core.setScreen('facility');
  assert.equal(core.currentScreen(), 'facility');
});

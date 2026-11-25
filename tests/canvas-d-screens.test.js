// D 負責畫面（朝臣、東廠、帝王、課表、策卡、關係圖、帝王面板）的 Canvas 煙霧測試。
// 替身 canvas：所有繪圖方法為空操作；每幀以 beginFrame／endFrame 登記命中表，逐一點擊不得拋錯。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 替身 DOM：store.js 於載入時讀取 document／window／localStorage。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

const { createInitialState } = await import('../src/state.js');
const { applySchemaDefaults } = await import('../src/schema.js');
const { U } = await import('../web/ui/store.js');
const { C, setScreen } = await import('../web/ui/canvas/core.js');
const input = await import('../web/ui/canvas/input.js');
const officials = await import('../web/ui/render-officials.js');
const ruler = await import('../web/ui/render-ruler.js');
const rel = await import('../web/ui/render-relations.js');
const cardsMod = await import('../web/ui/render-cards.js');

// 替身 canvas 上下文：方法皆為空操作；measureText 回傳寬度，使文字換行計算可進行。
function stubCtx() {
  const grad = () => ({ addColorStop() {} });
  const target = { createLinearGradient: grad, createRadialGradient: grad, measureText: () => ({ width: 7 }) };
  return new Proxy(target, {
    get(obj, prop) { if (prop in obj) return obj[prop]; return () => undefined; },
    set(obj, prop, value) { obj[prop] = value; return true; },
    has() { return true; },
  });
}

function setupCanvas() {
  C.ctx = stubCtx();
  C.W = 420; C.H = 760; C.U = 1; C.dpr = 1; C.T = 0; C.scroll = 0;
  C.content = { x: 0, y: 0, w: 420, h: 760 };
}

function freshState(seed = 'canvas-d-smoke') {
  U.state = applySchemaDefaults(createInitialState(seed));
  U.feedback = ''; U.panel = null; U.pick1 = null;
}

// 一幀：開始、繪製、結束（發布命中表）。
function frame(fn) {
  input.beginFrame();
  fn(C);
  input.endFrame();
  return input.publishedHits();
}

const SCREENS = {
  officials: officials.drawOfficials,
  dc: officials.drawDC,
  throne: officials.drawThrone,
};

setupCanvas();

test('朝臣、東廠、帝王三畫面皆可繪製，並設定內容高度與命中區', () => {
  for (const [name, draw] of Object.entries(SCREENS)) {
    freshState();
    const hits = frame(draw);
    assert.ok(C.contentH > 0, `${name} 應設定 contentH`);
    assert.ok(hits.length > 0, `${name} 應登記命中區`);
  }
});

test('三畫面逐一點擊每個命中區中心不得拋錯（每次點擊前重建狀態）', () => {
  for (const [name, draw] of Object.entries(SCREENS)) {
    freshState();
    const n = frame(draw).length;
    for (let i = 0; i < n; i++) {
      freshState();
      const r = frame(draw)[i];
      assert.doesNotThrow(() => input.dispatchPoint(r.x + r.w / 2, r.y + r.h / 2), `${name} hit #${i}`);
    }
  }
});

test('停用按鈕（off）點擊只回傳提示，不執行動作', () => {
  freshState();
  const hits = frame(SCREENS.officials);
  const disabled = hits.find((h) => h.disabled);
  if (disabled) {
    const before = JSON.stringify(U.state.officials);
    input.dispatchPoint(disabled.x + disabled.w / 2, disabled.y + disabled.h / 2);
    assert.equal(JSON.stringify(U.state.officials), before);
  }
});

test('帝王面板：openRuler 後以 modal 繪製，點「返回朝堂」關閉', () => {
  freshState();
  ruler.openRuler();
  input.beginFrame();
  ruler.rulerModalFrame();
  const req = input.takeModal();
  assert.ok(req, '應有對話框請求');
  req.drawFn(C);
  input.leaveModal();
  input.endFrame();
  const hits = input.publishedHits();
  assert.ok(hits.length > 0);
  // 對話框內的按鈕位於面板下方；逐一點擊（對話框外點擊會關閉，亦不得拋錯）。
  for (const h of hits) assert.doesNotThrow(() => input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2));
  assert.equal(ruler.isRulerOpen(), false);
});

test('帝王面板：rulerProfile 本質＝加成後扣除收藏加成；雷達頂點位於上方', () => {
  freshState();
  const p = ruler.rulerProfile(U.state);
  assert.equal(p.rows.length, 5);
  for (const r of p.rows) assert.equal(r.final - r.bonus, r.base);
  const [x0, y0] = ruler.radarPoint(0, 5, 1, 100, 100, 50);
  assert.ok(Math.abs(x0 - 100) < 1e-9 && Math.abs(y0 - 50) < 1e-9);
});

test('禪位確認對話框：點擊背景關閉，不執行禪位', () => {
  freshState();
  setScreen('throne');
  officials.openResign();
  assert.equal(officials.isResignOpen(), true);
  input.beginFrame();
  officials.drawThrone(C);
  input.endFrame();
  // 以對話框請求模擬一幀，確認可繪製且不拋錯。
  input.beginFrame();
  officials.drawThrone(C);
  const req = input.takeModal();
  if (req) req.drawFn(C);
  input.leaveModal();
  input.endFrame();
  input.closeModal();
  assert.equal(U.state.alive, true, '未確認前不得終局');
  assert.equal(officials.isResignOpen(), false, '對話框關閉後旗標復原');
  setScreen('officials');
});

test('朝臣關係圖：無資料時為佔位文字；有圖時版面高度與節點座標一致', () => {
  const blockNone = rel.relationsBlock({ alive: true }, 300);
  assert.equal(blockNone.t, 'text');
  const g = {
    nodes: [{ id: 'a', name: '甲', faction: 'qingliu' }, { id: 'b', name: '乙', faction: 'qingliu' }, { id: 'c', name: '丙', faction: 'hanmen' }],
    edges: [{ a: 'a', b: 'b', kind: 'teacher' }],
  };
  const lay = rel.relationsLayout(g, 300, 1);
  assert.ok(lay.h > 0);
  assert.equal(Object.keys(lay.pos).length, 3);
  assert.equal(lay.zones.length, 2);
  assert.ok(lay.zones.every((z) => z.y + z.h <= lay.h));
});

test('策卡區塊：非正月或無 offer 時無區塊，不重抽', () => {
  freshState();
  assert.deepEqual(cardsMod.policyOfferBlocks(), []);
  assert.equal(cardsMod.synergyText(), '');
  assert.equal(cardsMod.activeCardsText(), '');
});

test('東廠：巡漕失敗回饋原因（無此府）且不改 state', () => {
  freshState();
  const before = JSON.stringify(U.state.canalLog ?? []);
  officials.patrolAct('no-such-prefecture');
  assert.equal(U.feedback, '無此府。');
  assert.equal(JSON.stringify(U.state.canalLog ?? []), before);
});

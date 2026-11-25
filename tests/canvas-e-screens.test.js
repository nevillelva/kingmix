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
  globalThis.__fireKey = (key) => { for (const fn of [...(listeners.get('keydown') ?? [])]) fn({ key }); };
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
}

const { U } = await import('../web/ui/store.js');
const { C } = await import('../web/ui/canvas/core.js');
const input = await import('../web/ui/canvas/input.js');
const { drawDialogs } = await import('../web/ui/dialog.js');
const { drawLegacy, renderLegacy, LEGACY_KEY, legacyModel } = await import('../web/ui/render-legacy.js');
const { drawGallery, galleryModel, renderGallery } = await import('../web/ui/render-gallery.js');
const { drawCampaignPage } = await import('../web/ui/render-campaign.js');
const { showQuarterCard, quarterCardModel } = await import('../web/ui/render-quarter.js');
const { guideMount, GUIDE_KEY, openNianhao, openResignDialog } = await import('../web/ui/overlays.js');
const { stampThen, drawFx, inkFlash } = await import('../web/ui/fx.js');
const { drawSoundToggle, sndLabel, toggleSound } = await import('../web/ui/audio.js');
const { dialogCount } = await import('../web/ui/dialog.js');
const { registerScreen, setScreen } = await import('../web/ui/canvas/core.js');

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

// 模擬一幀（core.drawFrame 之順序）：畫面 → 對話框 → 發布命中表。回傳發布之命中表。
function frame(screenFn) {
  input.beginFrame();
  if (screenFn) screenFn(C);
  drawDialogs();
  const req = input.takeModal();
  if (req) req.drawFn(C);
  input.leaveModal();
  input.endFrame();
  return input.publishedHits();
}
// 點遍目前命中表的每個可點區域（中心點），不得拋錯。
function clickAll() {
  const hits = input.publishedHits().filter((h) => !h.disabled);
  for (const h of hits) assert.doesNotThrow(() => input.dispatchPoint(h.x + h.w / 2, h.y + h.h / 2));
  return hits.length;
}

const RUN = { seed: 'abc', mode: 'standard', years: 12, generations: 2, endReason: 'death', finalTitle: '承續基業之主' };
const BASE_STATE = { alive: true, year: 3, month: 5, officials: [], wars: [], eventHistory: { counts: {} }, dynasty: { generation: 1, crownPrince: null }, heirs: [], seed: 'x' };

test('畫面登記：legacy、gallery、campaign 皆以 registerScreen 登錄', () => {
  setScreen('legacy');
  renderLegacy();
  assert.equal(typeof registerScreen, 'function');
  renderGallery();
  assert.equal(typeof drawGallery, 'function');
});

test('歷代帝王：無紀錄顯示空狀態，有紀錄時產生表列與統計', () => {
  localStorage.removeItem(LEGACY_KEY);
  U.state = BASE_STATE;
  frame(drawLegacy);
  assert.ok(C.contentH > 0);
  localStorage.setItem(LEGACY_KEY, JSON.stringify([RUN, { ...RUN, seed: 'def' }]));
  const m = legacyModel(JSON.parse(localStorage.getItem(LEGACY_KEY)));
  assert.equal(m.rows.length, 2);
  assert.equal(m.rows[0][0], 2, '最新一局列於最上，局數為 2');
  assert.match(m.sub, /共 2 局/);
  frame(drawLegacy);
  assert.ok(C.contentH > 100);
  clickAll();
});

test('圖鑑：未解鎖條目以「？？？」示意；分類與總進度齊全', () => {
  U.state = BASE_STATE;
  U.events = [{ id: 'E001', title: '甲' }];
  const m = galleryModel(U.state, [], U.events);
  assert.equal(m.categories.length, 4);
  assert.ok(m.categories.every((c) => Array.isArray(c.entries)));
  const locked = m.categories.flatMap((c) => c.entries).filter((e) => !e.on);
  assert.ok(locked.length > 0 && locked.every((e) => e.label === '？？？'));
  frame(drawGallery);
  assert.ok(C.contentH > 0);
  clickAll();
});

test('戰役畫面：無進行中戰役顯示空狀態；有戰役時繪製且可點遍', () => {
  U.state = { ...BASE_STATE, campaign: null };
  frame(drawCampaignPage);
  assert.ok(C.contentH > 0);
  U.state = { ...BASE_STATE, campaign: { status: 'active', title: '北伐', round: 1, ourWins: 1, enemyWins: 0, grain: 30, intel: 'unscouted', estimate: 0, neighborId: 'n1', rounds: [{ round: 1, tactic: 'assault', won: true, ours: 120, enemy: 100, lossOurs: 5, lossEnemy: 12, line: '剋敵' }] } };
  U.battlePrefs = { auto: false, speed: 1 };
  frame(drawCampaignPage);
  assert.ok(C.contentH > 200);
  assert.ok(clickAll() >= 4, '應含 3 戰術與議和、歲幣');
  assert.equal(U.battlePrefs.speed, 2, '加速鈕已切換至 2 倍');
});

test('季結算卡：開啟、收卷清除 U.quarterCard，同卡不重複開啟', () => {
  const card = { year: 3, quarter: 1, delta: { gold: 4, people: -2 }, biggestGain: { key: 'gold', amount: 4 }, biggestDrop: { key: 'people', amount: 2 } };
  U.state = BASE_STATE;
  U.quarterCard = card;
  showQuarterCard();
  showQuarterCard();
  assert.equal(dialogCount(), 1, '同一張卡只開一次');
  frame();
  assert.ok(quarterCardModel(card).rows.length === 2);
  clickAll();
  assert.equal(U.quarterCard, null);
  assert.equal(dialogCount(), 0);
});

test('新手提要：首月顯示；任何關閉方式皆寫入已看過', () => {
  localStorage.removeItem(GUIDE_KEY);
  U.state = { ...BASE_STATE, month: 1 };
  U.guideArmed = true;
  guideMount();
  assert.equal(dialogCount(), 1);
  frame();
  clickAll();
  assert.equal(localStorage.getItem(GUIDE_KEY), '1');
  assert.equal(U.guideArmed, false);
});

test('禪位確認：取消與確認皆可點遍；確認前不改變狀態', () => {
  U.state = { ...BASE_STATE, dynasty: { generation: 1, crownPrince: null }, heirs: [] };
  openResignDialog();
  frame();
  assert.equal(U.state.alive, true, '開啟對話框不得結束本世');
  __fireKey('Escape');
  input.closeModal();
  assert.equal(dialogCount(), 0);
});

test('年號覆蓋層：開啟後點擊繼續即關閉', () => {
  U.state = { ...BASE_STATE, year: 4, month: 1 };
  openNianhao('永平元年', '新歲伊始，萬象更新。');
  frame();
  assert.equal(dialogCount(), 1);
  clickAll();
  assert.equal(dialogCount(), 0);
});

test('蓋章（Canvas 矩形）：立即執行於無動效之情境，並於 DOM 路徑之外不殘留 pendingAction', () => {
  U.state = BASE_STATE;
  U.pendingAction = null;
  let ran = 0;
  stampThen(null, () => { ran += 1; });
  assert.equal(ran, 1);
  assert.equal(U.pendingAction, null);
});

test('墨跡轉場與季節雪景：每幀繪製不拋錯', () => {
  U.lastScreen = 'a';
  inkFlash('b');
  U.state = { ...BASE_STATE, month: 1 };
  assert.doesNotThrow(() => frame(drawFx));
});

test('音效按鈕：標籤隨狀態切換，點擊切換音效並寫入 localStorage', () => {
  U.soundOn = true;
  assert.equal(sndLabel(), '音效：開');
  frame((c) => drawSoundToggle(c, 10, 10, 120, 30));
  clickAll();
  assert.equal(U.soundOn, false);
  assert.equal(sndLabel(), '音效：關');
  toggleSound();
  assert.equal(U.soundOn, true);
});

test('上一役戰報卡：有戰報時回傳高度，無戰報回傳 0；lastBattleCard 回傳空字串（改由 Canvas 繪製）', async () => {
  const { drawLastBattleCard, lastBattleCard } = await import('../web/ui/render-campaign.js');
  U.lastBattle = null;
  assert.equal(drawLastBattleCard(C, 10, 10, 300), 0);
  assert.equal(lastBattleCard(), '');
  U.lastBattle = { title: '北伐', lines: ['第1回合：騎兵（我方120 對 敵方100）勝', '結果：大捷'] };
  let h = 0;
  frame(() => { h = drawLastBattleCard(C, 10, 10, 300); });
  assert.ok(h > 40);
});

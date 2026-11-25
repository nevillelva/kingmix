// 稽核第 3 組修補測試：刺探入口（D102）、關係裁決入口（D110）、東廠失敗扣行動（C-020）、
// 快進停止提示文字（C-080、C-081）、手機自訂年號鍵盤（C-025）、存檔失敗常駐（A-002、A-044、A-046）、
// 解鎖寫入失敗提示只於狀態變化時出現（A-048）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 替身 DOM 與 localStorage（web/ui 模組載入時會讀取，與其他 UI 測試相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// 記錄型替身 2D 上下文：fillText 的字串寫入 log；measureText 依字數回傳寬度。
function recordingContext(log) {
  const make = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'fillText') return (s) => { log.push(String(s)); };
      if (k === Symbol.toPrimitive) return () => '';
      return make();
    },
    apply: () => make(),
    set: () => true,
  });
  return make();
}

const { createInitialState } = await import('../src/state.js');
const { prepareMonth } = await import('../src/month-start.js');
const { SCOUT_COST, SCOUT_TTL, scoutedFresh } = await import('../src/diplomacy.js');
const { U } = await import('../web/ui/store.js');
const { C } = await import('../web/ui/canvas/core.js');
const { gameEventPool } = await import('../web/ui/event-pool.js');
const baseEvents = JSON.parse(read('data/events.json')).events;

function setup(seed) {
  C.ctx = recordingContext([]);
  C.U = 1; C.W = 420; C.H = 760; C.dpr = 1;
  C.content = { x: 0, y: 12, w: 420, h: 736 };
  C.scroll = 0;
  U.events = baseEvents;
  U.seed = seed;
  U.state = createInitialState(seed);
  U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.reviewedCount = 0;
  U.pendingAction = null;
  U.courtPage = null;
  U.soundOn = false;
  prepareMonth(U.state, gameEventPool(baseEvents, U.state));
}

// ── D102：刺探入口 ──
test('D102: 外交「刺探」列於 diplo2，並於 dpath 分派至 scoutNeighbor', () => {
  const src = read('web/ui/render-actions.js');
  assert.match(src, /\['scout', '刺探'/);
  assert.match(src, /v === 'scout'/);
  assert.match(src, /scoutNeighbor\(U\.state, n\.id\)/);
});

test('D102: 刺探扣國庫、記下情報期限並耗一次行動', async () => {
  const { agencyAct, agency } = await import('../web/ui/render-actions.js');
  setup('audit-g3-scout');
  const { diplomacyOf, NEIGHBORS } = await import('../src/diplomacy.js');
  const n = NEIGHBORS[0];
  U.state.stats.treasury = 100;
  U.pick1 = n.id; U.panel = 'diplo2';
  const used0 = agency().used;
  agencyAct('dpath', 'scout');
  assert.equal(U.state.stats.treasury, 100 - SCOUT_COST);
  assert.equal(scoutedFresh(U.state, n.id), true);
  assert.equal(agency().used, used0 + 1, '刺探與其他外交路線相同，耗一次行動');
  assert.equal(U.panel, null);
  assert.equal(diplomacyOf(U.state)[n.id].scoutedUntil, U.state.turn + SCOUT_TTL);
});

test('D102: 國庫不足時刺探不成，不扣國庫、不耗行動', async () => {
  const { agencyAct, agency } = await import('../web/ui/render-actions.js');
  setup('audit-g3-scout-poor');
  const { NEIGHBORS } = await import('../src/diplomacy.js');
  const n = NEIGHBORS[0];
  U.state.stats.treasury = SCOUT_COST - 1;
  U.pick1 = n.id; U.panel = 'diplo2';
  const used0 = agency().used;
  agencyAct('dpath', 'scout');
  assert.equal(U.state.stats.treasury, SCOUT_COST - 1);
  assert.equal(scoutedFresh(U.state, n.id), false);
  assert.equal(agency().used, used0);
  assert.match(U.feedback, /國庫不足/);
});

// ── C-020：東廠開案失敗仍扣行動（保留程式行為，僅修正稽核描述）──
test('C-020: 東廠開案失敗分支仍經 useAction 扣一次行動', () => {
  const src = read('web/ui/render-actions.js');
  assert.match(src, /if \(!c\) return useAction\(activeCaseCount/);
});

test('C-020: 東廠開案失敗（此官已有案件）仍耗一次行動，且不新增案件', async () => {
  const { agencyAct, agency } = await import('../web/ui/render-actions.js');
  const { openInvestigation } = await import('../src/dongchang.js');
  setup('audit-g3-dc-fail');
  const off = U.state.officials[0];
  assert.ok(openInvestigation(U.state, off.id), '前置：先開一案');
  const casesBefore = U.state.dongchang.cases.length;
  const used0 = agency().used;
  agencyAct('dcopen', off.id);
  assert.equal(U.state.dongchang.cases.length, casesBefore, '失敗不新增案件');
  assert.equal(agency().used, used0 + 1, '失敗仍耗一次行動');
  assert.match(U.feedback, /此官已有案件/);
});

test('C-020: 東廠選單描述為「失敗仍耗一次行動」，並指出可於東廠頁處置', () => {
  const src = read('web/ui/render-actions.js');
  assert.match(src, /'對一位官員展開調查（失敗仍耗一次行動），之後可在東廠頁處置'/);
});

// ── C-080、C-081：快進停止提示文字需對應實際可用的動作與機制 ──
test('C-080: 民心過低的快進提示不再提及「賑濟」，改為實際可用之朝政行動', async () => {
  const { ffStopNote } = await import('../web/ui/game-flow.js');
  const note = ffStopNote('people', 3);
  assert.doesNotMatch(note, /賑濟/);
  assert.match(note, /稅制調為低稅/);
  assert.match(note, /修繕城池/);
});

test('C-081: 皇權過低的快進提示不再以改元為例；改元耗的是威儀而非皇權', async () => {
  const { ffStopNote } = await import('../web/ui/game-flow.js');
  const note = ffStopNote('power', 3);
  assert.doesNotMatch(note, /改元/);
  assert.match(note, /東廠密報/);
  assert.match(note, /皇權/);
});

test('D102: 情報尚新時再次刺探不扣國庫，提示無需重複', async () => {
  const { agencyAct, agency } = await import('../web/ui/render-actions.js');
  setup('audit-g3-scout-twice');
  const { NEIGHBORS } = await import('../src/diplomacy.js');
  const n = NEIGHBORS[0];
  U.state.stats.treasury = 100;
  U.pick1 = n.id; U.panel = 'diplo2';
  agencyAct('dpath', 'scout');
  const after = U.state.stats.treasury;
  const used = agency().used;
  U.pick1 = n.id; U.panel = 'diplo2';
  agencyAct('dpath', 'scout');
  assert.equal(U.state.stats.treasury, after);
  assert.equal(agency().used, used);
  assert.match(U.feedback, /無需重複刺探/);
});

// ── D110：朝臣頁關係裁決入口（寫入既有旗標，條件與引擎 stepRelations 一致）──
test('D110: 朝臣頁入口的裁決旗標皆為引擎讀取的旗標', () => {
  const engine = read('src/relations.js');
  const ui = read('web/ui/render-officials.js');
  for (const k of ['rel_order_purge', 'rel_order_pardon', 'rel_order_mourn', 'rel_order_disband']) {
    assert.match(engine, new RegExp(k));
    assert.match(ui, new RegExp(k));
  }
  assert.match(ui, /朝綱裁決/);
});

test('D110: 無互參、無連坐、無結黨時不顯示任何裁決', async () => {
  const { relOrderOptions } = await import('../web/ui/render-officials.js');
  setup('audit-g3-rel-none');
  U.state.flags = {};
  assert.deepEqual(relOrderOptions(U.state).options, []);
  assert.equal(relOrderOptions(U.state).pending, null);
});

test('D110: 互參未決時可準其所參、駁回參奏與赦免連坐；結黨時可許其解黨', async () => {
  const { relOrderOptions } = await import('../web/ui/render-officials.js');
  setup('audit-g3-rel-opts');
  U.state.flags = { impeach_pending: true };
  let keys = relOrderOptions(U.state).options.map(o => o.flag);
  assert.deepEqual(keys.sort(), ['rel_order_mourn', 'rel_order_pardon', 'rel_order_purge']);
  U.state.flags = { bloc_qingliu: true };
  keys = relOrderOptions(U.state).options.map(o => o.flag);
  assert.deepEqual(keys, ['rel_order_disband']);
  U.state.flags = { guilt_spread: true };
  keys = relOrderOptions(U.state).options.map(o => o.flag);
  assert.deepEqual(keys, ['rel_order_mourn']);
});

test('D110: 下達裁決寫入旗標、不耗行動，且同月不可重複下達', async () => {
  const { setRelOrder, relOrderOptions } = await import('../web/ui/render-officials.js');
  const { agency } = await import('../web/ui/render-actions.js');
  setup('audit-g3-rel-set');
  U.state.flags = { impeach_pending: true };
  const used = agency().used;
  setRelOrder('rel_order_purge');
  assert.equal(U.state.flags.rel_order_purge, true);
  assert.equal(agency().used, used, '裁決不耗朝政行動');
  const opts = relOrderOptions(U.state);
  assert.equal(opts.pending, 'rel_order_purge');
  assert.ok(opts.options.every(o => o.off), '已下裁決後其餘選項停用');
  setRelOrder('rel_order_pardon');
  assert.equal(U.state.flags.rel_order_pardon, undefined, '同月第二道裁決不寫入');
});

test('D110: 玩家於朝臣頁下達之準其所參，於月結時黜落被參者（引擎端生效）', async () => {
  const { setRelOrder } = await import('../web/ui/render-officials.js');
  const { createInitialState } = await import('../src/state.js');
  const { seedRelations, stepRelations } = await import('../src/relations.js');
  const s = createInitialState('audit-g3-rel-engine');
  seedRelations(s);
  stepRelations(s, () => 0);
  const { target } = s.relState.impeachment;
  setup('audit-g3-rel-engine-ui');
  U.state = s;
  setRelOrder('rel_order_purge');
  stepRelations(s, () => 0.99);
  assert.equal(s.officials.some(o => o.id === target), false);
});

test('D110: 朝臣頁繪製時出現「朝綱裁決」區塊（有互參在案）', async () => {
  const { drawOfficials } = await import('../web/ui/render-officials.js');
  const { beginFrame, endFrame } = await import('../web/ui/canvas/input.js');
  setup('audit-g3-rel-draw');
  const log = [];
  C.ctx = recordingContext(log);
  U.state.flags = { impeach_pending: true };
  beginFrame();
  drawOfficials();
  endFrame();
  assert.ok(log.some(s => s.includes('朝綱裁決')), '應繪出朝綱裁決區塊');
  assert.ok(log.some(s => s.includes('準其所參')), '應列出準其所參');
});

// ── A-048：解鎖寫入失敗提示只於狀態由「否」轉「是」時出現一次（不再每幀推送）──
test('A-048: renderStart 不再每幀提示；unlockFailNotice 只在寫入失敗狀態轉變時為真', async () => {
  const src = read('web/ui/render-start.js');
  assert.doesNotMatch(src, /if \(snap\.writeFailed\) saveMsg\(UNLOCK_FAIL_MSG\);/);
  const { unlockFailNotice } = await import('../web/ui/render-start.js');
  assert.equal(unlockFailNotice(false, true), true, '由否轉是：提示');
  assert.equal(unlockFailNotice(true, true), false, '持續失敗：不再提示');
  assert.equal(unlockFailNotice(true, false), false, '恢復：不提示');
  assert.equal(unlockFailNotice(false, false), false);
});

// ── A-002、A-044、A-046：存檔失敗改為常駐（寫入成功後清除）──
test('A-002: 損毀存檔備份失敗時常駐旗標為真，成功後清除', async () => {
  const { discardCorruptSave, corruptBackupFailing } = await import('../web/ui/state-io.js');
  const orig = globalThis.localStorage;
  try {
    globalThis.localStorage = { setItem() { throw new Error('full'); }, getItem: () => null, removeItem() {} };
    assert.equal(discardCorruptSave('{broken'), false);
    assert.equal(corruptBackupFailing(), true);
    globalThis.localStorage = { setItem() {}, getItem: () => null, removeItem() {} };
    assert.equal(discardCorruptSave('{broken'), true);
    assert.equal(corruptBackupFailing(), false);
  } finally { globalThis.localStorage = orig; }
});

test('A-046: 自動存檔寫入失敗時常駐旗標為真，寫入成功後清除', async () => {
  const { save, flushSave, autoSaveFailing } = await import('../web/ui/state-io.js');
  const { createInitialState } = await import('../src/state.js');
  const orig = globalThis.localStorage;
  setup('audit-g3-autosave');
  try {
    globalThis.localStorage = { setItem() { throw new Error('full'); }, getItem: () => null, removeItem() {} };
    save(); flushSave();
    assert.equal(autoSaveFailing(), true);
    globalThis.localStorage = { setItem() {}, getItem: () => null, removeItem() {} };
    U.state = createInitialState('audit-g3-autosave-2');
    save(); flushSave();
    assert.equal(autoSaveFailing(), false);
  } finally { globalThis.localStorage = orig; }
});

test('A-002/A-046: 常駐列接入開局畫面損毀卡與頂欄（drawTop）', () => {
  assert.match(read('web/ui/render-start.js'), /corruptBackupFailing\(\)/);
  assert.match(read('web/ui/render-nav.js'), /autoSaveFailing\(\)/);
});

// ── C-025：手機自訂年號鍵盤；「顯示輸入框」預設開啟，開啟時聚焦隱藏的 #ime，關閉時僅用 Canvas 框 ──
test('C-025: 自訂年號輸入預設顯示輸入框，開啟時聚焦 #ime，關閉時釋放焦點', async () => {
  const court = await import('../web/ui/canvas/court.js');
  const { takeModal, leaveModal, beginFrame, endFrame } = await import('../web/ui/canvas/input.js');
  setup('audit-g3-ime');
  const calls = [];
  const ime = { value: '', focus() { calls.push('focus'); }, blur() { calls.push('blur'); } };
  const origDoc = globalThis.document;
  globalThis.document = { ...origDoc, getElementById: (id) => (id === 'ime' ? ime : null), activeElement: null };
  try {
    assert.equal(court.textEntryShowsInput(), true, '預設為顯示');
    court.openTextEntry({ title: '自訂年號', maxLen: 4, onSubmit: () => {} });
    assert.deepEqual(calls, ['focus'], '開啟時聚焦隱藏輸入框以喚起手機鍵盤');
    court.setTextEntryShowsInput(false);
    assert.equal(court.textEntryShowsInput(), false);
    assert.equal(calls.at(-1), 'blur', '隱藏時釋放 #ime 焦點，僅用 Canvas 內文字框');
    court.setTextEntryShowsInput(true);
    assert.equal(calls.at(-1), 'focus');
    // 畫面上的切換鈕：點擊後切換顯示狀態
    C.W = 420; C.H = 760;
    beginFrame();
    court.drawTextEntry();
    const req = takeModal();
    req.drawFn(C);
    leaveModal();
    endFrame();
    const { publishedHits, dispatchPoint } = await import('../web/ui/canvas/input.js');
    const toggle = publishedHits().find(h => !h.disabled && h.h === 28); // 切換鈕高 28（面板本身亦登記為區域，故以高度辨識）
    dispatchPoint(toggle.x + toggle.w / 2, toggle.y + toggle.h / 2);
    assert.equal(court.textEntryShowsInput(), false, '點擊切換鈕可關閉顯示');
  } finally { globalThis.document = origDoc; }
});

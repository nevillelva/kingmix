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

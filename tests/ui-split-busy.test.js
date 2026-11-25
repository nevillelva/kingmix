import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── 替身 DOM：web/ui 模組於載入時會讀取 document／window／localStorage（與 cards.test.js 相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

// Canvas 版 render-court.js 的 export 清單（畫面以 registerScreen 登記的 drawCourt／drawReview，其餘為輔助函式）。
const COURT_EXPORTS = [
  'courtItems', 'drawCourt', 'drawReview', 'ffItem', 'reviewPending',
];

test('render-court（Canvas）匯出之名稱符合契約', async () => {
  const mod = await import('../web/ui/render-court.js');
  assert.deepEqual(Object.keys(mod).sort(), [...COURT_EXPORTS].sort());
});

test('拆出的檔案各自提供 Canvas 版函式（朝堂、奏摺、朝政行動）', async () => {
  const memorial = await import('../web/ui/render-memorial.js');
  const quarter = await import('../web/ui/render-quarter.js');
  const actions = await import('../web/ui/render-actions.js');
  const pressure = await import('../web/ui/render-pressure.js');
  for (const [mod, names] of [
    [memorial, ['memorialItem', 'secondItem', 'chooseSecond', 'skipSecond', 'visibleOptions', 'affectedList']],
    [quarter, ['recordQuarterSnapshot', 'showQuarterCard']],
    [actions, ['ACTION_LIMIT', 'agency', 'actionsLeft', 'useAction', 'actionsItem', 'crownChoiceItem', 'slotsItems', 'agencyAct', 'slotAct']],
    [pressure, ['prefecturePressureText', 'courtMinisterText', 'pressureLines']],
  ]) {
    for (const n of names) {
      assert.equal(typeof mod[n], n === 'ACTION_LIMIT' ? 'number' : 'function', `${n} missing`);
    }
  }
});

test('B9：奏摺選項與戰報列不再共用 data-i（DOM 標記已改為 Canvas 命中區）', () => {
  const read = (f) => readFileSync(new URL(`../web/ui/${f}`, import.meta.url), 'utf8');
  for (const f of ['render-court.js', 'render-memorial.js', 'render-campaign.js']) {
    assert.doesNotMatch(read(f), /data-i\b|dataset\.i\b|\[data-i\]/, `${f} still uses data-i`);
  }
  assert.doesNotMatch(read('render-court.js'), /innerHTML|querySelector/, 'render-court.js should not touch DOM');
  assert.doesNotMatch(read('render-memorial.js'), /innerHTML|querySelector/, 'render-memorial.js should not touch DOM');
});

test('shouldCommit：同一局且同一回合才裁決', async () => {
  const { shouldCommit, turnKey } = await import('../web/ui/fx.js');
  const s = { year: 3, month: 5, alive: true };
  const snap = { state: s, turn: turnKey(s) };
  assert.equal(shouldCommit(s, snap), true);
  assert.equal(shouldCommit({ ...s }, snap), false, '新局（state 參考不同）應放棄');
  assert.equal(shouldCommit({ ...s, month: 6 }, { state: s, turn: turnKey(s) }), false, '月份已變應放棄');
  assert.equal(shouldCommit(s, { state: s, turn: '3-4' }), false, '回合鍵不符應放棄');
  assert.equal(shouldCommit(null, snap), false);
  assert.equal(shouldCommit(s, null), false);
});

test('stampThen：蓋章期間 pendingAction 為 stamp，無動效時直接執行且不殘留狀態', async () => {
  const { U } = await import('../web/ui/store.js');
  const { stampThen } = await import('../web/ui/fx.js');
  U.state = { year: 1, month: 1, alive: true };
  U.pendingAction = null;
  let ran = 0;
  // 替身環境 reduceMotion 可能為假，但 el 為 null 時必直接執行 fn。
  stampThen(null, () => { ran += 1; });
  assert.equal(ran, 1);
  assert.equal(U.pendingAction, null);
});

test('玩家操作入口：蓋章進行中（pendingAction 非 null）直接忽略，不改動局面', async () => {
  const { U } = await import('../web/ui/store.js');
  const GF = await import('../web/ui/game-flow.js');
  const { createInitialState } = await import('../src/state.js');
  U.state = createInitialState('busy-guard');
  U.pendingAction = 'stamp';
  const before = JSON.stringify(U.state);
  const ev = { id: 'x', options: [] };
  const opt = { key: 'a', label: 'a', effects: {} };
  GF.chooseOption(opt, ev);
  GF.startEventCampaign({ ...opt, effects: { war: {} } }, ev);
  GF.campAct('camp-tactic', 'x');
  GF.chooseDC('noop');
  GF.fastForward();
  assert.equal(JSON.stringify(U.state), before, '忙碌時不應推進局面');
  U.pendingAction = null;
});

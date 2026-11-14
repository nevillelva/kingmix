import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastForwardPause, FF_THRESHOLDS } from '../src/fastforward.js';

const base = () => ({ alive: true, stats: { treasury: 200, people: 80, power: 100 }, campaign: null, dongchang: { cases: [] } });

test('無事發生時可以快進', () => {
  assert.equal(fastForwardPause(base()), null);
});

test('駕崩、親征、東廠把柄會停下，一般奏摺不停', () => {
  assert.equal(fastForwardPause({ ...base(), alive: false }), 'death');
  assert.equal(fastForwardPause({ ...base(), campaign: { status: 'active' } }), 'campaign');
  assert.equal(fastForwardPause({ ...base(), dongchang: { cases: [{ status: 'leverage' }] } }), 'leverage');
  assert.equal(fastForwardPause(base()), null);
});

test('國庫、民心、皇權低於門檻時停下', () => {
  const s = (k, v) => { const st = base(); st.stats[k] = v; return st; };
  assert.equal(fastForwardPause(s('treasury', FF_THRESHOLDS.treasury - 1)), 'treasury');
  assert.equal(fastForwardPause(s('people', FF_THRESHOLDS.people - 1)), 'people');
  assert.equal(fastForwardPause(s('power', FF_THRESHOLDS.power - 1)), 'power');
});

import { deferLeverage, flushDeferredLeverage } from '../src/fastforward.js';
import { createInitialState } from '../src/state.js';

test('稍後處理：暫緩的把柄不再停下快進，且不擋奏摺（status 非 leverage）', () => {
  const s = createInitialState('ff-defer');
  s.dongchang.cases.push({ id: 'DC1', officialId: 'o3', status: 'leverage', level: 2 });
  assert.equal(fastForwardPause(s), 'leverage');
  assert.equal(deferLeverage(s, 'DC1'), true);
  assert.equal(s.dongchang.cases[0].status, 'deferred');
  assert.equal(fastForwardPause(s), null);
  assert.equal(s.dongchang.cases.filter((c) => c.status !== 'closed').length, 1, '暫緩中的案件仍佔進行中案數');
});

test('稍後處理：只能暫緩 leverage 狀態的案件，其餘拒絕且不改動', () => {
  const s = createInitialState('ff-defer-bad');
  s.dongchang.cases.push({ id: 'DC1', officialId: 'o3', status: 'investigating' });
  assert.equal(deferLeverage(s, 'DC1'), false);
  assert.equal(deferLeverage(s, 'NOPE'), false);
  assert.equal(s.dongchang.cases[0].status, 'investigating');
});

test('快進結束後 flushDeferredLeverage 還原為 leverage 並回傳案件（不再於同一快進中重新停下）', () => {
  const s = createInitialState('ff-flush');
  s.dongchang.cases.push({ id: 'DC1', officialId: 'o3', status: 'leverage', level: 1 });
  s.dongchang.cases.push({ id: 'DC2', officialId: 'o4', status: 'leverage', level: 3 });
  deferLeverage(s, 'DC1');
  const shown = flushDeferredLeverage(s);
  assert.deepEqual(shown.map((c) => c.id), ['DC1']);
  assert.equal(s.dongchang.cases[0].status, 'leverage');
  assert.equal(s.dongchang.cases[0].deferredTurn, undefined);
  assert.equal(fastForwardPause(s), 'leverage', '純判斷函式仍認為待決把柄會停（停下與否由 runFastForward 決定）');
  assert.deepEqual(flushDeferredLeverage(s), [], '無暫緩案件時回傳空陣列');
});

import { runFastForward, queuePendingLeverage } from '../src/fastforward.js';

// 測試用的每月推進：只累計回合數，可選擇在指定月份新增把柄。
const stepper = (opts = {}) => (st) => {
  st.turn = (st.turn || 0) + 1;
  if (opts.addAt && opts.addAt.includes(st.turn)) {
    st.dongchang.cases.push({ id: `NEW${st.turn}`, officialId: 'o5', status: 'leverage', level: 1 });
  }
};
const withCases = (ids) => {
  const s = createInitialState('ff-run-' + ids.join('-'));
  s.dongchang.cases = ids.map((id, i) => ({ id, officialId: 'o' + (i + 3), status: 'leverage', level: 1 }));
  s.turn = 0;
  return s;
};

test('兩件待決把柄：快進 12 個月仍全部完成，兩件皆入列並於結束時交還玩家', () => {
  const s = withCases(['DC1', 'DC2']);
  const r = runFastForward(s, 12, stepper());
  assert.equal(r.done, 12);
  assert.equal(r.reason, null);
  assert.deepEqual(r.back.map((c) => c.id).sort(), ['DC1', 'DC2']);
  assert.ok(s.dongchang.cases.every((c) => c.status === 'leverage'), '結束後回到待決，交由玩家處置');
});

test('稍後處理後繼續：暫緩的案件不會再停下，快進跑滿 12 個月', () => {
  const s = withCases(['DC1', 'DC2']);
  // 模擬玩家於快進前對第一件按「稍後處理」
  assert.equal(deferLeverage(s, 'DC1'), true);
  const r = runFastForward(s, 12, stepper());
  assert.equal(r.done, 12);
  assert.equal(r.reason, null);
  assert.deepEqual(r.back.map((c) => c.id).sort(), ['DC1', 'DC2']);
});

test('快進途中新出現的把柄：第一件停下交玩家，之後的新把柄入列不再停', () => {
  const s = withCases([]);
  const r = runFastForward(s, 12, stepper({ addAt: [3, 6] }));
  assert.equal(r.reason, 'leverage');
  assert.equal(r.done, 3, '第三個月新增的把柄於第四個月前停下');
  const s2 = withCases([]);
  const r2 = runFastForward(s2, 12, stepper({ addAt: [2, 5, 9] }));
  assert.equal(r2.reason, 'leverage');
  assert.equal(r2.done, 2);
});

test('新把柄停下後玩家稍後處理，再次快進可跑滿 12 個月（不會因同一把柄 0 個月停下）', () => {
  const s = withCases([]);
  const first = runFastForward(s, 12, stepper({ addAt: [1, 2] }));
  assert.equal(first.reason, 'leverage');
  assert.equal(first.done, 1);
  // 玩家對 NEW1 稍後處理後再快進
  assert.equal(deferLeverage(s, 'NEW1'), true);
  const second = runFastForward(s, 12, stepper());
  assert.equal(second.reason, null, '暫緩的把柄不應讓第二次快進在第一個月前停下');
  assert.equal(second.done, 12);
});

test('不因把柄卡住：queuePendingLeverage 只入列 leverage 狀態，回傳數量', () => {
  const s = withCases(['DC1', 'DC2']);
  s.dongchang.cases[1].status = 'investigating';
  assert.equal(queuePendingLeverage(s), 1);
  assert.equal(s.dongchang.cases[0].status, 'deferred');
  assert.equal(s.dongchang.cases[1].status, 'investigating');
});

test('其他停下條件（國庫過低）仍會停下，不受把柄佇列影響', () => {
  const s = withCases(['DC1']);
  s.stats.treasury = FF_THRESHOLDS.treasury - 1;
  const r = runFastForward(s, 12, stepper());
  assert.equal(r.reason, 'treasury');
  assert.equal(r.done, 0);
  assert.deepEqual(r.back.map((c) => c.id), ['DC1']);
});

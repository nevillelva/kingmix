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

test('快進結束後 flushDeferredLeverage 還原為 leverage 並回傳案件，之後再次停下', () => {
  const s = createInitialState('ff-flush');
  s.dongchang.cases.push({ id: 'DC1', officialId: 'o3', status: 'leverage', level: 1 });
  s.dongchang.cases.push({ id: 'DC2', officialId: 'o4', status: 'leverage', level: 3 });
  deferLeverage(s, 'DC1');
  const shown = flushDeferredLeverage(s);
  assert.deepEqual(shown.map((c) => c.id), ['DC1']);
  assert.equal(s.dongchang.cases[0].status, 'leverage');
  assert.equal(s.dongchang.cases[0].deferredTurn, undefined);
  assert.equal(fastForwardPause(s), 'leverage');
  assert.deepEqual(flushDeferredLeverage(s), [], '無暫緩案件時回傳空陣列');
});

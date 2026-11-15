// A5：月初準備（prepareMonth）冪等、政策卡每年只抽一次、同種子結果確定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { prepareMonth } from '../src/month-start.js';
import { advanceMonth } from '../src/turn.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

test('prepareMonth 同月重複呼叫不重抽，monthChain 穩定', () => {
  const s = createInitialState('month-start-1');
  prepareMonth(s, events);
  const snap = JSON.stringify(s.monthChain);
  const offer = JSON.stringify(s.policyCards ?? null);
  prepareMonth(s, events);
  prepareMonth(s, events);
  assert.equal(JSON.stringify(s.monthChain), snap);
  assert.equal(JSON.stringify(s.policyCards ?? null), offer);
});

test('prepareMonth 結果只依種子與月份決定（同種子兩次一致）', () => {
  const a = createInitialState('month-start-2');
  const b = createInitialState('month-start-2');
  prepareMonth(a, events);
  prepareMonth(b, events);
  assert.deepEqual(a.monthChain, b.monthChain);
  assert.deepEqual(a.policyCards ?? null, b.policyCards ?? null);
});

test('正月寫入政策卡並記年；跨月後同年不重抽', () => {
  const s = createInitialState('month-start-3');
  s.month = 1; s.year = 3;
  prepareMonth(s, events);
  assert.equal(s.flags.policy_offer_year, 3);
  const offer = JSON.stringify(s.policyCards);
  s.month = 2;
  prepareMonth(s, events);
  assert.equal(JSON.stringify(s.policyCards), offer);
});

test('東廠有待決把柄時本月不呈奏摺', () => {
  const s = createInitialState('month-start-4');
  s.dongchang.cases.push({ id: 'dc1', status: 'leverage', officialId: 'o1' });
  prepareMonth(s, events);
  assert.equal(s.monthChain.first, null);
  assert.equal(s.monthChain.second, null);
});

test('月推進後自動進入新月的準備（key 與年月同步）', () => {
  const s = createInitialState('month-start-5');
  prepareMonth(s, events);
  const k1 = s.monthChain.key;
  advanceMonth(s);
  prepareMonth(s, events);
  assert.notEqual(s.monthChain.key, k1);
  assert.equal(s.monthChain.key, `${s.year}-${s.month}`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotStats, summarizeQuarter, quarterOf } from '../src/quarterly.js';

test('月份對應季度 1..12', () => {
  const expected = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
  expected.forEach((q, i) => assert.equal(quarterOf(1000, i + 1), q, `month ${i + 1}`));
});

test('snapshotStats 只複製數值欄位，且是複本', () => {
  const state = { stats: { treasury: 200, people: 80, label: 'x', nan: NaN } };
  const snap = snapshotStats(state);
  assert.deepEqual(snap, { treasury: 200, people: 80 });
  snap.treasury = 1;
  assert.equal(state.stats.treasury, 200);
  assert.deepEqual(snapshotStats({}), {});
});

test('delta 為季末減季初，正負號正確', () => {
  const s = summarizeQuarter(
    [{ treasury: 100, people: 50 }, { treasury: 120, people: 40 }, { treasury: 130, people: 45 }],
    1000, 2,
  );
  assert.equal(s.quarter, 1);
  assert.deepEqual(s.start, { treasury: 100, people: 50 });
  assert.deepEqual(s.end, { treasury: 130, people: 45 });
  assert.deepEqual(s.delta, { treasury: 30, people: -5 });
});

test('biggestDrop 與 biggestGain 取最大跌幅與最大增幅', () => {
  const s = summarizeQuarter(
    [{ a: 10, b: 10, c: 10, d: 10 }, { a: 4, b: 30, c: 9, d: 10 }],
    1000, 12,
  );
  assert.equal(s.quarter, 4);
  assert.deepEqual(s.biggestDrop, { key: 'a', amount: -6 });
  assert.deepEqual(s.biggestGain, { key: 'b', amount: 20 });
});

test('全部持平或只有增加時 biggestDrop 為 null', () => {
  const flat = summarizeQuarter([{ a: 5 }, { a: 5 }], 1000, 3);
  assert.equal(flat.biggestDrop, null);
  assert.equal(flat.biggestGain, null);
  const up = summarizeQuarter([{ a: 5 }, { a: 9 }], 1000, 3);
  assert.equal(up.biggestDrop, null);
  assert.deepEqual(up.biggestGain, { key: 'a', amount: 4 });
});

test('空陣列回傳 null', () => {
  assert.equal(summarizeQuarter([], 1000, 1), null);
  assert.equal(summarizeQuarter(undefined, 1000, 1), null);
});

test('缺少的 key 視為不變（沿用上一個值）', () => {
  const s = summarizeQuarter(
    [{ a: 10, b: 20 }, { a: 15 }, { a: 12, b: 25 }],
    1000, 5,
  );
  assert.deepEqual(s.start, { a: 10, b: 20 });
  assert.deepEqual(s.end, { a: 12, b: 25 });
  assert.deepEqual(s.delta, { a: 2, b: 5 });

  const gap = summarizeQuarter([{ a: 10, b: 20 }, { a: 7 }], 1000, 6);
  assert.deepEqual(gap.delta, { a: -3, b: 0 });
  assert.deepEqual(gap.biggestDrop, { key: 'a', amount: -3 });
  assert.equal(gap.biggestGain, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, ACTION_LIMIT, SLOT_COST_ENABLED, slotCost, canTakeSlot } from '../src/slots.js';

test('成本為整數：午後與夜間每個選項預設 1', () => {
  for (const name of ['afternoon', 'night']) {
    for (const o of SLOTS[name].opts) {
      const c = slotCost(name, o[0]);
      assert.equal(Number.isInteger(c), true);
      assert.equal(c, 1);
    }
  }
});

test('未知時段或選項成本為 0', () => {
  assert.equal(slotCost('morning', 'audience'), 0);
  assert.equal(slotCost('afternoon', 'rest'), 0);
  assert.equal(slotCost('night', 'audience'), 0);
});

test('SLOT_COST_ENABLED 為 true，且行動上限為 2（與 web ACTION_LIMIT 相同）', () => {
  assert.equal(SLOT_COST_ENABLED, true);
  assert.equal(ACTION_LIMIT, 2);
});

test('canTakeSlot：剩餘行動足夠時可選，已用滿則不可選', () => {
  const alive = { alive: true };
  assert.equal(canTakeSlot(alive, 'afternoon', 0), true);
  assert.equal(canTakeSlot(alive, 'afternoon', 1), true);
  assert.equal(canTakeSlot(alive, 'afternoon', 2), false);
  assert.equal(canTakeSlot(alive, 'night', 2), false);
});

test('canTakeSlot：未知時段或已結束的局不可選', () => {
  assert.equal(canTakeSlot({ alive: true }, 'morning', 0), false);
  assert.equal(canTakeSlot({ alive: false }, 'night', 0), false);
});

test('canTakeSlot 為純函式：同輸入同結果，且不修改 state', () => {
  const st = { alive: true, tag: 'x' };
  const before = JSON.stringify(st);
  assert.equal(canTakeSlot(st, 'afternoon', 1), canTakeSlot(st, 'afternoon', 1));
  assert.equal(JSON.stringify(st), before);
});

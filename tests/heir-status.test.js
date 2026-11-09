import { test } from 'node:test';
import assert from 'node:assert/strict';
import { illnessLabel } from '../src/heir-status.js';

test('病中皇子顯示剩餘月數', () => {
  assert.equal(illnessLabel({ ill: 6 }), '染疾中（剩餘 6 月）');
  assert.equal(illnessLabel({ ill: 1 }), '染疾中（剩餘 1 月）');
});

test('無病況（缺欄位、0、負值、非數字）不顯示', () => {
  assert.equal(illnessLabel({}), '');
  assert.equal(illnessLabel({ ill: 0 }), '');
  assert.equal(illnessLabel({ ill: -2 }), '');
  assert.equal(illnessLabel({ ill: 'x' }), '');
  assert.equal(illnessLabel(null), '');
});

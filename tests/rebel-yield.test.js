import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyPrefectureYield, REBEL_YIELD_MULT, YIELD_TREASURY, YIELD_PEOPLE } from '../src/economy.js';

// 叛亂州府產出減半為【可回退的設計預設】（報告建議值，見 economy.js REBEL_YIELD_MULT）。
function stateWith(seed, { rebelId = null, yieldOf = 2 } = {}) {
  const s = createInitialState(seed);
  s.stats.treasury = 500;
  s.stats.people = 50;
  for (const p of s.prefectures) {
    p.yield = yieldOf;
    p.rebel = p.id === rebelId;
  }
  return s;
}

function deltas(s) {
  const t0 = s.stats.treasury;
  const p0 = s.stats.people;
  applyPrefectureYield(s);
  return { treasury: s.stats.treasury - t0, people: s.stats.people - p0 };
}

test('REBEL_YIELD_MULT 為報告建議的 0.5 預設', () => {
  assert.equal(REBEL_YIELD_MULT, 0.5);
});

test('無叛亂時各府產出照常結算（六府 × 產出 × 每單位入庫）', () => {
  const d = deltas(stateWith('rebel-y-none', { yieldOf: 2 }));
  assert.ok(Math.abs(d.treasury - 6 * 2 * YIELD_TREASURY) <= 0.06, `treasury delta ${d.treasury}`);
});

test('叛亂府的入庫貢獻減半：比無叛亂時少約一半該府貢獻', () => {
  const base = deltas(stateWith('rebel-y-cmp', { yieldOf: 2 }));
  const one = deltas(stateWith('rebel-y-cmp', { rebelId: 'jingzhao', yieldOf: 2 }));
  const contribution = 2 * YIELD_TREASURY; // 該府未減半前的入庫貢獻
  const lost = base.treasury - one.treasury;
  assert.ok(Math.abs(lost - contribution * 0.5) <= 0.02, `lost ${lost} expected ~${contribution * 0.5}`);
});

test('叛亂府的民心貢獻同樣減半（以高於 1 的產出計）', () => {
  const base = deltas(stateWith('rebel-y-ppl', { yieldOf: 3 }));
  const one = deltas(stateWith('rebel-y-ppl', { rebelId: 'hedong', yieldOf: 3 }));
  const contribution = (3 - 1) * YIELD_PEOPLE;
  const lost = base.people - one.people;
  assert.ok(Math.abs(lost - contribution * 0.5) <= 0.02, `people lost ${lost} expected ~${contribution * 0.5}`);
});

test('非叛亂府不受影響：僅叛亂府的差額，其餘府的產出不變', () => {
  const base = deltas(stateWith('rebel-y-other', { yieldOf: 2 }));
  const one = deltas(stateWith('rebel-y-other', { rebelId: 'yangzhou', yieldOf: 2 }));
  // 差額只來自一府；若波及他府，差額會達一整府（0.1）以上的兩倍
  assert.ok(base.treasury - one.treasury < 2 * YIELD_TREASURY * 2 * 0.5 + 0.02);
});

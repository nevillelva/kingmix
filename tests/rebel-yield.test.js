import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applyPrefectureYield, REBEL_YIELD_MULT, YIELD_TREASURY, YIELD_PEOPLE } from '../src/economy.js';

// 依使用者決定：叛亂州府不減產（REBEL_YIELD_MULT = 1.0），叛亂府與非叛亂府產出相同。
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

test('REBEL_YIELD_MULT 為 1.0（叛亂不減產，回到基準）', () => {
  assert.equal(REBEL_YIELD_MULT, 1.0);
});

test('無叛亂時各府產出照常結算（六府 × 產出 × 每單位入庫）', () => {
  const d = deltas(stateWith('rebel-y-none', { yieldOf: 2 }));
  assert.ok(Math.abs(d.treasury - 6 * 2 * YIELD_TREASURY) <= 0.06, `treasury delta ${d.treasury}`);
});

test('叛亂府的入庫貢獻與非叛亂相同：總差額為零（乘數 1）', () => {
  const base = deltas(stateWith('rebel-y-cmp', { yieldOf: 2 }));
  const one = deltas(stateWith('rebel-y-cmp', { rebelId: 'jingzhao', yieldOf: 2 }));
  assert.ok(Math.abs(base.treasury - one.treasury) <= 0.02, `treasury differs: ${base.treasury} vs ${one.treasury}`);
});

test('叛亂府的民心貢獻與非叛亂相同（以高於 1 的產出計）', () => {
  const base = deltas(stateWith('rebel-y-ppl', { yieldOf: 3 }));
  const one = deltas(stateWith('rebel-y-ppl', { rebelId: 'hedong', yieldOf: 3 }));
  const contribution = (3 - 1) * YIELD_PEOPLE;
  assert.ok(Math.abs(base.people - one.people) <= 0.02, `people differs by ${base.people - one.people}`);
  assert.ok(Math.abs(one.people - contribution * 6) <= 0.07, `people delta ${one.people}`);
});

test('叛亂府與非叛亂府一視同仁：單府叛亂時，全體六府產出之合計不變', () => {
  const base = deltas(stateWith('rebel-y-other', { yieldOf: 2 }));
  const one = deltas(stateWith('rebel-y-other', { rebelId: 'yangzhou', yieldOf: 2 }));
  assert.ok(Math.abs(base.treasury - one.treasury) <= 0.02);
});

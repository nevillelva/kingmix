// 月結流程 endOfMonth（src/month.js）、無上限陣列上限（src/caps.js）與相關收斂（B6／B8）的測試。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, setStat } from '../src/state.js';
import { endOfMonth } from '../src/month.js';
import { monthlyDrift } from '../src/diplomacy.js';
import { monthlyTick, advanceMonth } from '../src/turn.js';
import { autoAppoint } from '../src/selection.js';
import { tryAccession } from '../src/succession.js';
import { makeRng } from '../src/rng.js';
import { pushCapped, trimCapped, WARNINGS_CAP, DIPLOMACY_LOG_CAP } from '../src/caps.js';
import { chronicleLine } from '../src/chronicle.js';
import { END_WORD, LEGACY_END } from '../web/ui/labels.js';

// 原月迴圈（無頭模擬改版前的順序）：drift → tick → advance → 吏部 → 繼位。
// 僅用於比對 endOfMonth 的結果是否一致。
function legacyMonth(state) {
  const { year, month, seed } = state;
  monthlyDrift(state, year, month);
  monthlyTick(state, makeRng([seed, year, month, 'tick']));
  advanceMonth(state);
  autoAppoint(state);
  if (!state.alive && state.endReason !== 'short_end') tryAccession(state);
  return state;
}

const snapshot = (s) => JSON.stringify({
  turn: s.turn, year: s.year, month: s.month, alive: s.alive, endReason: s.endReason,
  stats: s.stats, officials: s.officials.map((o) => [o.id, o.loyalty, o.office]),
  chronicle: s.chronicle, heirs: s.heirs.map((h) => h.id), generation: s.dynasty.generation,
});

test('endOfMonth matches the legacy month loop over 24 months (same seed)', () => {
  const a = createInitialState('month-eq', { policy: 'agrarian' });
  const b = createInitialState('month-eq', { policy: 'agrarian' });
  for (let m = 0; m < 24; m++) {
    endOfMonth(a);
    legacyMonth(b);
    assert.equal(snapshot(a), snapshot(b), `month ${m + 1}: state diverged`);
  }
  assert.deepEqual(a.stats, b.stats);
});

test('endOfMonth calls onBeforeAdvance once, before the month pointer moves', () => {
  const s = createInitialState('before-adv', { policy: 'agrarian' });
  const seen = [];
  endOfMonth(s, { onBeforeAdvance: (st) => seen.push({ month: st.month, turn: st.turn }) });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { month: 1, turn: 0 });
  assert.equal(s.month, 2);
});

test('endOfMonth does not re-enthrone after a short-mode end', () => {
  const s = createInitialState('short-end', { policy: 'agrarian' });
  s.alive = false;
  s.endReason = 'short_end';
  const before = s.chronicle.length;
  endOfMonth(s);
  assert.equal(s.alive, false, 'short_end must not revive the emperor');
  assert.equal(s.chronicle.length, before, 'no generation record is written for short_end');
});

test('endOfMonth records the year-end annal only for living emperors', () => {
  const s = createInitialState('annal', { policy: 'agrarian' });
  s.month = 12;
  s.year = 3;
  endOfMonth(s);
  assert.equal(s.annals.length, 1);
  assert.equal(s.annals[0].year, 3);
  assert.equal(typeof s.annals[0].treasury, 'number');
});

test('pushCapped keeps only the newest max items and returns the same array', () => {
  const arr = [];
  for (let i = 0; i < 10; i++) assert.equal(pushCapped(arr, i, 4), arr);
  assert.deepEqual(arr, [6, 7, 8, 9]);
  assert.deepEqual(trimCapped([1, 2, 3], 5), [1, 2, 3]);
});

test('monthlyTick trims state.warnings and state.diplomacyLog to their caps', () => {
  const s = createInitialState('cap-test', { policy: 'agrarian' });
  s.warnings = Array.from({ length: WARNINGS_CAP + 37 }, (_, i) => ({ turn: i, key: 'treasury', reason: 'floor' }));
  s.diplomacyLog = Array.from({ length: DIPLOMACY_LOG_CAP + 5 }, (_, i) => ({ turn: i, action: 'scout', neighbor: 'x', ok: true }));
  monthlyTick(s, makeRng(['cap-tick']));
  assert.equal(s.warnings.length, WARNINGS_CAP);
  assert.equal(s.warnings.at(-1).turn, WARNINGS_CAP + 36, 'newest warning is kept');
  assert.equal(s.diplomacyLog.length, DIPLOMACY_LOG_CAP);
});

test('monthly loyalty is rounded to two decimals', () => {
  const s = createInitialState('loyalty-round', { policy: 'agrarian' });
  setStat(s, 'health', 90);
  for (let i = 0; i < 6; i++) monthlyTick(s, makeRng(['loy', i]));
  for (const o of s.officials) {
    assert.equal(Math.round(o.loyalty * 100) / 100, o.loyalty, `${o.id} loyalty ${o.loyalty} not rounded`);
  }
});

test('resigned and assassinated read as 禪位 and 遇刺 in both chronicle and labels', () => {
  assert.equal(END_WORD.resigned, '禪位');
  assert.equal(END_WORD.assassinated, '遇刺');
  assert.equal(LEGACY_END.resigned, '禪位');
  assert.equal(LEGACY_END.assassinated, '遇刺');
  assert.equal(chronicleLine({ generation: 2, endedInYear: 9, age: 40, endReason: 'resigned' }).tag, '禪位');
  assert.equal(chronicleLine({ generation: 2, endedInYear: 9, age: 40, endReason: 'assassinated' }).tag, '遇刺');
});

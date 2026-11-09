import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { holdExam, examRemaining, EXAM_INTERVAL_TURNS } from '../src/exam.js';
import { MAX_OFFICIALS } from '../src/turn.js';

const rngFor = (st) => makeRng([st.seed, 'exam', st.year, st.month]);

test('開科：從未開科者可立即開，招募 1–2 名新進士', () => {
  const st = createInitialState('exam-1');
  assert.equal(examRemaining(st), 0);
  const before = st.officials.length;
  const r = holdExam(st, rngFor(st));
  assert.equal(r.ok, true);
  assert.ok(r.added.length >= 1 && r.added.length <= 2);
  assert.equal(st.officials.length, before + r.added.length);
  for (const id of r.added) {
    const o = st.officials.find((x) => x.id === id);
    assert.ok(o.personName, '新進士應有姓名');
    assert.ok(o.traits.length >= 2, '新進士應有 2–3 個特質');
    assert.equal(o.office, null);
  }
});

test('開科：每 24 個月一次，冷卻期內拒絕且不改動狀態', () => {
  const st = createInitialState('exam-2');
  assert.equal(holdExam(st, rngFor(st)).ok, true);
  st.turn += 10;
  const snap = JSON.stringify(st.officials);
  const r = holdExam(st, rngFor(st));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cooldown');
  assert.equal(r.remaining, EXAM_INTERVAL_TURNS - 10);
  assert.equal(JSON.stringify(st.officials), snap);
  st.turn += EXAM_INTERVAL_TURNS - 10;
  assert.equal(examRemaining(st), 0);
  assert.equal(holdExam(st, rngFor(st)).ok, true);
});

test('開科：朝中已滿官員上限時拒絕', () => {
  const st = createInitialState('exam-3');
  while (st.officials.length < MAX_OFFICIALS) st.officials.push({ ...st.officials[0], id: `f${st.officials.length}` });
  const r = holdExam(st, rngFor(st));
  assert.deepEqual(r, { ok: false, reason: 'full' });
});

test('開科：新進士 id 不與既有官員衝突，且同種子結果一致', () => {
  const a = createInitialState('exam-4');
  const b = createInitialState('exam-4');
  const ra = holdExam(a, rngFor(a));
  const rb = holdExam(b, rngFor(b));
  assert.deepEqual(ra, rb);
  assert.equal(new Set(a.officials.map((o) => o.id)).size, a.officials.length);
});

test('開科：死亡後不可開科', () => {
  const st = createInitialState('exam-5');
  st.alive = false;
  assert.deepEqual(holdExam(st, rngFor(st)), { ok: false, reason: 'dead' });
});

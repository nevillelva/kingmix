import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampSave, resolveConflict } from '../src/conflict.js';

test('stampSave 第一次寫入：saveVersion 為 1，savedAt 為傳入時間', () => {
  const s = { year: 1 };
  const r = stampSave(s, 1000);
  assert.equal(r, s);
  assert.equal(s.saveVersion, 1);
  assert.equal(s.savedAt, 1000);
});

test('stampSave 版本單調遞增', () => {
  const s = { saveVersion: 7, savedAt: 5 };
  stampSave(s, 2000);
  assert.equal(s.saveVersion, 8);
  stampSave(s, 3000);
  assert.equal(s.saveVersion, 9);
  assert.equal(s.savedAt, 3000);
});

test('stampSave 對非法 saveVersion 回到從 1 起算', () => {
  const s = { saveVersion: 'x' };
  stampSave(s, 1);
  assert.equal(s.saveVersion, 1);
});

test('stampSave 拒絕非物件與非有限時間', () => {
  assert.throws(() => stampSave(null, 1), TypeError);
  assert.throws(() => stampSave([], 1), TypeError);
  assert.throws(() => stampSave({}, NaN), TypeError);
  assert.throws(() => stampSave({}, '1'), TypeError);
});

test('resolveConflict：版本較高者為勝者並需確認', () => {
  const local = { saveVersion: 5, savedAt: 100 };
  const remote = { saveVersion: 3, savedAt: 900 };
  assert.deepEqual(resolveConflict(local, remote),
    { winner: 'local', reason: 'newer_version', needsPrompt: true });
  assert.deepEqual(resolveConflict(remote, local),
    { winner: 'remote', reason: 'newer_version', needsPrompt: true });
});

test('resolveConflict：版本相同時以 savedAt 決定勝者', () => {
  const local = { saveVersion: 4, savedAt: 200 };
  const remote = { saveVersion: 4, savedAt: 100 };
  assert.deepEqual(resolveConflict(local, remote),
    { winner: 'local', reason: 'newer_savedAt', needsPrompt: true });
  assert.deepEqual(resolveConflict(remote, local),
    { winner: 'remote', reason: 'newer_savedAt', needsPrompt: true });
});

test('resolveConflict：版本與時間戳相同且內容相同為 same，不需確認', () => {
  const a = { saveVersion: 2, savedAt: 50, year: 3, seed: 'x' };
  const b = { saveVersion: 2, savedAt: 50, year: 3, seed: 'x' };
  assert.deepEqual(resolveConflict(a, b), { winner: 'same', reason: 'identical', needsPrompt: false });
});

test('resolveConflict：版本與時間戳相同但內容不同為分岔，需確認', () => {
  const a = { saveVersion: 2, savedAt: 50, year: 3 };
  const b = { saveVersion: 2, savedAt: 50, year: 4 };
  const r = resolveConflict(a, b);
  assert.equal(r.needsPrompt, true);
  assert.equal(r.reason, 'fork_same_stamp');
});

test('resolveConflict：兩邊不同時 needsPrompt 必為 true', () => {
  const cases = [
    [{ saveVersion: 1, savedAt: 1 }, { saveVersion: 2, savedAt: 1 }],
    [{ saveVersion: 1, savedAt: 9 }, { saveVersion: 1, savedAt: 1 }],
    [{ saveVersion: 1, savedAt: 1, a: 1 }, { saveVersion: 1, savedAt: 1, a: 2 }],
  ];
  for (const [l, r] of cases) assert.equal(resolveConflict(l, r).needsPrompt, true);
});

test('resolveConflict：舊存檔（無版本欄位）視為版本 0', () => {
  const legacy = { year: 1 };
  const stamped = { saveVersion: 1, savedAt: 10, year: 1 };
  assert.deepEqual(resolveConflict(legacy, stamped),
    { winner: 'remote', reason: 'newer_version', needsPrompt: true });
});

test('resolveConflict：只有一方存在時不需確認，存在者為勝者', () => {
  const s = { saveVersion: 1, savedAt: 1 };
  assert.deepEqual(resolveConflict(s, null), { winner: 'local', reason: 'no_remote', needsPrompt: false });
  assert.deepEqual(resolveConflict(undefined, s), { winner: 'remote', reason: 'no_local', needsPrompt: false });
  assert.deepEqual(resolveConflict(null, null), { winner: 'same', reason: 'none', needsPrompt: false });
});

test('流程：本機蓋章後，雲端仍為舊版本時本機勝出', () => {
  const remote = { saveVersion: 2, savedAt: 100, year: 1 };
  const local = { saveVersion: 2, savedAt: 100, year: 1 };
  stampSave(local, 300);
  assert.equal(resolveConflict(local, remote).winner, 'local');
  assert.equal(resolveConflict(local, remote).needsPrompt, true);
});

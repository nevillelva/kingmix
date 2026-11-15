// M1：新年覆蓋層的 localStorage 鍵清理（開新局／載入存檔時只保留當前種子）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneNewYearKeys } from '../web/ui/newyear-keys.js';

function fakeStorage(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _m: m,
  };
}

test('pruneNewYearKeys 刪除非當前種子的新年鍵，保留當前種子與其他無關鍵', () => {
  globalThis.localStorage = fakeStorage({
    'kingmix.newyear.111': '1200',
    'kingmix.newyear.222': '1201',
    'kingmix.newyear.333': '1202',
    'kingmix.save': '{}',
  });
  const removed = pruneNewYearKeys('222');
  assert.equal(removed, 2);
  assert.deepEqual([...localStorage._m.keys()].sort(), ['kingmix.newyear.222', 'kingmix.save']);
});

test('pruneNewYearKeys 在無 localStorage 時不拋錯', () => {
  delete globalThis.localStorage;
  assert.equal(pruneNewYearKeys('1'), 0);
});

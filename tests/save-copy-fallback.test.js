import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../web/ui/state-io.js', import.meta.url), 'utf8');

test('export has a copy-save-code fallback wired into both failure paths', () => {
  assert.match(src, /export function saveCopyFallback\(/);
  assert.match(src, /複製存檔碼/);
  assert.match(src, /saveCopyFallback\(text, '未完成匯出/);
  assert.match(src, /saveCopyFallback\(text, '下載失敗/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyze } from '../scripts/check-cycles.js';

const SCRIPT = fileURLToPath(new URL('../scripts/check-cycles.js', import.meta.url));

test('web/ui 無模組循環依賴（靜態解析 import 圖）', () => {
  const { uiCycles } = analyze();
  assert.deepEqual(uiCycles.map((c) => c.files), [], 'web/ui 仍有循環依賴');
});

test('npm run check:cycles 所用的檢查腳本結束碼為 0', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

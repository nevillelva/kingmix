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

// ── 雲端衝突對話框的可達性（web/ui/state-io.js）。CLOUD_SAVE_ENABLED 於出貨版本保持 false；
// 此測試將原始碼複本的旗標改為 true（匯入路徑改為絕對檔案 URL），驗證 checkCloudConflict 會呼叫 askConflict 並掛上對話框。
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STATE_IO = new URL('../web/ui/state-io.js', import.meta.url);
const ioSrc = readFileSync(STATE_IO, 'utf8');

test('出貨版本的 CLOUD_SAVE_ENABLED 為 false', () => {
  assert.match(ioSrc, /export const CLOUD_SAVE_ENABLED = false;/);
});

test('旗標開啟時，衝突判定會要求玩家確認並顯示衝突對話框', async () => {
  const appended = [];
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  const fakeDoc = { getElementById: () => null, createElement: () => stub(), body: { appendChild: (n) => appended.push(n) },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.document = fakeDoc;
  globalThis.window = globalThis;
  const local = { year: 2, saveVersion: 2, savedAt: 100, seed: 1 };
  const remote = { year: 3, saveVersion: 5, savedAt: 200, seed: 1 };
  globalThis.localStorage = { getItem: () => JSON.stringify({ seed: 1, state: local }), setItem() {}, removeItem() {} };

  // 複本：旗標改為 true，相對匯入改寫為絕對 URL，並以 data: URL 載入。
  let src = ioSrc.replace('export const CLOUD_SAVE_ENABLED = false;', 'export const CLOUD_SAVE_ENABLED = true;');
  src = src.replace(/from '(\.\.?\/[^']+)'/g, (_, spec) => `from '${new URL(spec, STATE_IO).href}'`);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  assert.equal(mod.CLOUD_SAVE_ENABLED, true);

  // 雲端存檔與本機不同 → resolveConflict 需要玩家確認。
  const { resolveConflict } = await import('../src/conflict.js');
  assert.equal(resolveConflict(local, remote).needsPrompt, true);

  // 注入雲端快照後走 checkCloudConflict，對話框應掛上 body。
  const U = (await import(new URL('./store.js', STATE_IO).href)).U;
  U.cloud.snap = { exists: true, data: () => ({ seed: 1, state: remote }) };
  mod.checkCloudConflict(); // 不等待：對話框等待玩家選擇
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(appended.length >= 1, 'askConflict 應掛上對話框');
});

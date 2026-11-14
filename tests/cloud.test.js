import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_ENABLED, cloudPut, cloudGet } from '../src/cloud.js';

test('雲端存檔預設關閉', () => {
  assert.equal(CLOUD_ENABLED, false);
});

test('停用時 cloudPut 回傳 disabled，且不發出網路請求', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network must not be used'); };
  try {
    const r = await cloudPut('kingmix-save-v1', '{"version":2}');
    assert.deepEqual(r, { ok: false, error: 'disabled' });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('停用時 cloudGet 回傳 disabled，且不發出網路請求', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network must not be used'); };
  try {
    const r = await cloudGet('kingmix-save-v1');
    assert.deepEqual(r, { ok: false, error: 'disabled' });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('remoteFromText 解析 v2 雲端存檔並保留版本資訊', async () => {
  const { remoteFromText } = await import('../src/cloud.js');
  const body = JSON.stringify({ version: 2, savedAt: '2026-01-01T00:00:00.000Z', seed: 'abc', state: { year: 2, saveVersion: 3, savedAt: 42 } });
  const r = remoteFromText(body);
  assert.equal(r.ok, true);
  assert.equal(r.seed, 'abc');
  assert.equal(r.state.saveVersion, 3);
  assert.equal(r.state.savedAt, 42);
});

test('remoteFromText 對損毀或非存檔文字回傳錯誤碼', async () => {
  const { remoteFromText } = await import('../src/cloud.js');
  assert.deepEqual(remoteFromText('{bad'), { ok: false, error: 'invalid_json' });
  assert.deepEqual(remoteFromText('[]'), { ok: false, error: 'invalid_shape' });
});

test('remoteFromText 接受 v1 舊格式（缺 version 欄位）', async () => {
  const { remoteFromText } = await import('../src/cloud.js');
  const r = remoteFromText(JSON.stringify({ seed: 's', state: { year: 1 } }));
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
});

test('CLOUD_KEY 與本機鍵名一致', async () => {
  const { CLOUD_KEY } = await import('../src/cloud.js');
  assert.equal(CLOUD_KEY, 'kingmix-save-v1');
});

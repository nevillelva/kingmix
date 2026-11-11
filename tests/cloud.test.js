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

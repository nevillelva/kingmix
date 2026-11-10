import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_VERSION, serializeSave, parseSave, exportSave, importSave } from '../src/save.js';

const fixedClock = { now: () => '2026-01-02T03:04:05.000Z' };
const sample = () => ({
  seed: 'abc123',
  alive: true,
  turn: 14,
  stats: { treasury: 500, people: 60 },
  officials: [{ id: 'o1', loyalty: 40 }],
});

test('serializeSave wraps state with version, savedAt and seed', () => {
  const s = sample();
  const wrapped = serializeSave(s, fixedClock);
  assert.equal(wrapped.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 2);
  assert.equal(wrapped.savedAt, '2026-01-02T03:04:05.000Z');
  assert.equal(wrapped.seed, 'abc123');
  assert.deepEqual(wrapped.state, s);
});

test('round trip: serialize then parse returns equal state', () => {
  const s = sample();
  const text = JSON.stringify(serializeSave(s, fixedClock));
  const r = parseSave(text);
  assert.equal(r.ok, true);
  assert.equal(r.version, SAVE_VERSION);
  assert.equal(r.seed, 'abc123');
  assert.deepEqual(r.state, s);
});

test('v1 legacy {seed, state} migrates to v2 with version 1 recorded', () => {
  const s = sample();
  const legacy = JSON.stringify({ seed: s.seed, state: s });
  const r = parseSave(legacy);
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
  assert.deepEqual(r.state, s);
  assert.equal(r.seed, 'abc123');
});

test('v1 bare state object (no version, no wrapper) migrates', () => {
  const s = sample();
  const r = parseSave(JSON.stringify(s));
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
  assert.deepEqual(r.state, s);
});

test('future version is rejected with future_version', () => {
  const text = JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 'x', seed: 's', state: sample() });
  assert.deepEqual(parseSave(text), { ok: false, error: 'future_version' });
});

test('invalid JSON is rejected with invalid_json', () => {
  assert.deepEqual(parseSave('{not json'), { ok: false, error: 'invalid_json' });
  assert.deepEqual(parseSave(''), { ok: false, error: 'invalid_json' });
  assert.deepEqual(parseSave(undefined), { ok: false, error: 'invalid_json' });
});

test('object lacking seed is rejected with missing_seed', () => {
  const s = sample();
  delete s.seed;
  assert.deepEqual(parseSave(JSON.stringify(s)), { ok: false, error: 'missing_seed' });
  const wrapped = JSON.stringify({ version: 2, savedAt: 'x', state: s });
  assert.deepEqual(parseSave(wrapped), { ok: false, error: 'missing_seed' });
});

test('export then import round trip preserves state', () => {
  const s = sample();
  const text = exportSave(s, fixedClock);
  assert.ok(text.includes('\n'), 'export is pretty-printed');
  const r = importSave(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  assert.equal(r.version, SAVE_VERSION);
});

test('importSave rejects non-boolean alive', () => {
  const s = { ...sample(), alive: 'yes' };
  assert.deepEqual(importSave(JSON.stringify(s)), { ok: false, error: 'invalid_alive' });
});

test('importSave accepts state without alive field', () => {
  const s = sample();
  delete s.alive;
  assert.equal(importSave(JSON.stringify(s)).ok, true);
});

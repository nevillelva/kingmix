// 存檔遷移、狀態驗證與自動存檔寫入失敗回報（B2／B3）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import {
  SAVE_VERSION, STATE_SCHEMA_VERSION, parseSave, migrateState, validateState,
  restoreSave, finalizeLoaded, writeAutoSave, encodeAutoSave,
} from '../src/save.js';

const freshState = () => createInitialState('migrate-seed-1');

test('舊格式 {seed, state} 經 parseSave + migrateState 得有效狀態', () => {
  const s = freshState();
  const legacy = JSON.stringify({ seed: s.seed, state: s });
  const r = parseSave(legacy);
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
  const migrated = migrateState(r.state);
  assert.deepEqual(validateState(migrated), []);
  assert.equal(migrated.schemaVersion, STATE_SCHEMA_VERSION);
});

test('舊格式經 restoreSave 亦為有效狀態，且 seed 保留', () => {
  const s = freshState();
  const r = restoreSave(JSON.stringify({ seed: s.seed, state: s }));
  assert.equal(r.ok, true);
  assert.equal(r.seed, s.seed);
  assert.equal(r.state.seed, s.seed);
  assert.equal(r.version, 1);
});

test('缺欄位 state 經 migrateState 後 validateState 無錯', () => {
  const broken = freshState();
  delete broken.stats.treasury;
  delete broken.stats.population;
  delete broken.wars;
  delete broken.chronicle;
  delete broken.dynasty;
  delete broken.schemaVersion;
  assert.notDeepEqual(validateState(broken), []);
  const fixed = migrateState(broken);
  assert.deepEqual(validateState(fixed), []);
  assert.equal(fixed.stats.treasury, createInitialState('migrate-seed-1').stats.treasury);
  assert.equal(fixed.schemaVersion, STATE_SCHEMA_VERSION);
});

test('migrateState 不覆寫既有值，且不修改傳入物件', () => {
  const s = freshState();
  s.stats.treasury = 12345;
  const before = JSON.stringify(s);
  const out = migrateState(s);
  assert.equal(out.stats.treasury, 12345);
  assert.equal(JSON.stringify(s), before);
});

test('validateState 偵測必要欄位錯誤並回傳代碼清單', () => {
  const s = freshState();
  s.alive = 'yes';
  s.stats.people = 'many';
  s.officials = {};
  const errs = validateState(s);
  assert.ok(errs.includes('invalid_alive'));
  assert.ok(errs.includes('invalid_stat_people'));
  assert.ok(errs.includes('invalid_officials'));
  assert.deepEqual(validateState(null), ['not_object']);
});

test('validateState 對較新的 schemaVersion 回報 future_schema', () => {
  const s = freshState();
  s.schemaVersion = STATE_SCHEMA_VERSION + 1;
  assert.ok(validateState(s).includes('future_schema'));
});

test('損毀 JSON 不 throw，回傳 ok:false', () => {
  for (const bad of ['{not json', '', 'null', '[1,2]', '{"version":2,"state":"x"}']) {
    assert.doesNotThrow(() => restoreSave(bad));
    const r = restoreSave(bad);
    assert.equal(r.ok, false, `expected failure for ${JSON.stringify(bad)}`);
    assert.ok(typeof r.error === 'string' && r.error.length > 0);
  }
});

test('finalizeLoaded 對 state 缺欄位的 parse 結果仍回傳有效狀態', () => {
  const s = freshState();
  delete s.stats.literature;
  const r = finalizeLoaded({ ok: true, state: s, seed: s.seed, version: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.state.stats.literature, createInitialState('migrate-seed-1').stats.literature);
});

test('writeAutoSave 在 storage 拋錯時回傳 false，不拋出例外', () => {
  const throwing = { setItem() { throw new Error('QuotaExceededError'); } };
  let ok;
  assert.doesNotThrow(() => { ok = writeAutoSave(throwing, 'kingmix-save-v1', 's', freshState()); });
  assert.equal(ok, false);
  assert.equal(writeAutoSave(undefined, 'kingmix-save-v1', 's', freshState()), false);
});

test('writeAutoSave 成功時寫入 v2 包裝並回傳 true', () => {
  const store = new Map();
  const mock = { setItem(k, v) { store.set(k, v); } };
  const s = freshState();
  assert.equal(writeAutoSave(mock, 'kingmix-save-v1', s.seed, s), true);
  const parsed = JSON.parse(store.get('kingmix-save-v1'));
  assert.equal(parsed.version, SAVE_VERSION);
  assert.equal(parsed.seed, s.seed);
  assert.equal(parsed.state.seed, s.seed);
  assert.equal(encodeAutoSave(s.seed, s, { now: () => 'T' }).includes('"savedAt":"T"'), true);
});

test('B6：舊存檔中文 endReason「禪位」遷移為英文代碼 resigned（含世代紀錄）', () => {
  const s = freshState();
  s.alive = false;
  s.endReason = '禪位';
  s.chronicle = [{ generation: 1, endedInYear: 10, age: 50, endReason: '禪位', wars: 0 }];
  const m = migrateState(s);
  assert.equal(m.endReason, 'resigned');
  assert.equal(m.chronicle[0].endReason, 'resigned');
  assert.equal(s.endReason, '禪位', '原物件不被修改');
});

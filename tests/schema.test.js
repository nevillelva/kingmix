// 狀態結構宣告（schema.js）：預設值工廠、只補缺、冪等，以及與各模組 ensureX 預設的一致性（A6）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA, SCHEMA_FIELDS, SCHEMA_VERSION, applySchemaDefaults, defaultOf, matchesType,
} from '../src/schema.js';
import { STATE_SCHEMA_VERSION, migrateState } from '../src/save.js';
import { createInitialState } from '../src/state.js';
import { ensureEconomy, createPrefectures } from '../src/economy.js';
import { ensureTour } from '../src/tour.js';
import { diplomacyOf } from '../src/diplomacy.js';
import { tickHarem } from '../src/harem.js';

const bare = () => ({ seed: 'schema-seed', year: 1, month: 1 });

// 移除所有宣告欄位（模擬舊存檔）
function stripSchemaFields(state) {
  for (const f of SCHEMA_FIELDS) delete state[f];
  return state;
}

// 與欄位型別相容、但不等於預設值的哨兵值
function sentinelFor(name) {
  const types = SCHEMA[name].type;
  if (types.includes('object')) return { keep: true };
  if (types.includes('array')) return ['keep'];
  if (types.includes('string')) return 'keep';
  return null;
}

test('SCHEMA_VERSION 與 save.js 的 STATE_SCHEMA_VERSION 一致', () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(STATE_SCHEMA_VERSION, SCHEMA_VERSION);
});

test('每個宣告欄位的預設值符合其型別，且每次呼叫回傳新物件', () => {
  const s = bare();
  for (const name of SCHEMA_FIELDS) {
    const a = defaultOf(name, s);
    const b = defaultOf(name, s);
    assert.ok(matchesType(name, a), `${name} 預設值型別不符`);
    if (a !== null && typeof a === 'object') {
      assert.notEqual(a, b, `${name} 預設值應為新物件，不可共用參照`);
    }
  }
});

test('未宣告的欄位名稱拋錯', () => {
  assert.throws(() => defaultOf('no_such_field', bare()), /unknown schema field/);
  assert.throws(() => matchesType('no_such_field', 1), /unknown schema field/);
});

test('applySchemaDefaults 補齊缺漏欄位（harem 為 fill:false，不補）', () => {
  const s = applySchemaDefaults(bare());
  for (const name of SCHEMA_FIELDS) {
    if (SCHEMA[name].fill === false) {
      assert.equal(s[name], undefined, `${name} 不應被自動補上`);
    } else {
      assert.ok(matchesType(name, s[name]), `${name} 補齊後型別不符`);
    }
  }
  assert.equal(s.harem, undefined);
});

test('applySchemaDefaults 不覆寫既有值（含 null）', () => {
  const s = bare();
  for (const name of SCHEMA_FIELDS) s[name] = sentinelFor(name);
  const before = structuredClone(s);
  applySchemaDefaults(s);
  for (const name of SCHEMA_FIELDS) {
    assert.deepEqual(s[name], before[name], `${name} 被覆寫`);
  }
});

test('applySchemaDefaults 冪等：重複呼叫結果相同', () => {
  const s = applySchemaDefaults(bare());
  const once = structuredClone(s);
  applySchemaDefaults(s);
  assert.deepEqual(s, once);
});

test('migrateState 經由 applySchemaDefaults 補齊舊存檔缺漏的宣告欄位', () => {
  const old = stripSchemaFields(createInitialState('schema-seed'));
  const out = migrateState(old);
  for (const name of SCHEMA_FIELDS) {
    if (SCHEMA[name].fill === false) continue;
    assert.ok(matchesType(name, out[name]), `${name} 遷移後型別不符`);
  }
  assert.equal(out.schemaVersion, STATE_SCHEMA_VERSION);
});

test('migrateState 不會替舊存檔補上 harem（tickHarem 以其缺漏為休眠條件）', () => {
  const out = migrateState(stripSchemaFields(createInitialState('schema-seed')));
  assert.equal(out.harem, undefined);
  const before = structuredClone(out);
  tickHarem(out);
  assert.deepEqual(out, before);
});

test('ensureEconomy 的實際預設與 schema 一致（economy 與 prefectures）', () => {
  const s = stripSchemaFields(createInitialState('schema-seed'));
  ensureEconomy(s);
  assert.deepEqual(s.economy, defaultOf('economy', s));
  assert.deepEqual(s.prefectures, defaultOf('prefectures', s));
  assert.deepEqual(s.prefectures, createPrefectures('schema-seed'));
});

test('ensureTour 的實際預設與 schema 一致（location 與 tour）', () => {
  const s = stripSchemaFields(createInitialState('schema-seed'));
  ensureTour(s);
  assert.deepEqual(s.location, defaultOf('location', s));
  assert.deepEqual(s.tour, defaultOf('tour', s));
});

test('diplomacyOf 的實際預設與 schema 一致（diplomacy）', () => {
  const s = stripSchemaFields(createInitialState('schema-seed'));
  assert.deepEqual(diplomacyOf(s), defaultOf('diplomacy', s));
});

test('applySchemaDefaults 不改變已存在的任何欄位（新開局狀態）', () => {
  const s = createInitialState('schema-seed');
  const before = structuredClone(s);
  applySchemaDefaults(s);
  for (const key of Object.keys(before)) {
    assert.deepEqual(s[key], before[key], `${key} 被改動`);
  }
});

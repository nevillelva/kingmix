// 玩法深度擴充基礎：schema v3 遷移、flag_not 條件、ruleMod、模擬策略骨架、共用訴求佇列。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { SCHEMA_VERSION, SCHEMA } from '../src/schema.js';
import { migrateState, restoreSave, validateState, STATE_SCHEMA_VERSION } from '../src/save.js';
import { isEligible } from '../src/events.js';
import { ruleMod } from '../src/rule-mods.js';
import { defaultSimPolicy, nonePolicy, applySimPolicy } from '../src/sim-policy.js';
import { queueView, enqueue, openItems, resolve, cap } from '../src/demand-queue.js';
import { makeRng } from '../src/rng.js';

const NEW_FIELDS = { partisan: {}, intel: {}, edicts: {}, canalLog: [] };

test('schema v3：新欄位宣告為空預設', () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(STATE_SCHEMA_VERSION, 3);
  for (const [name, val] of Object.entries(NEW_FIELDS)) {
    assert.ok(SCHEMA[name], `${name} 未宣告`);
    assert.deepEqual(SCHEMA[name].default({}), val);
  }
});

test('v2 舊存檔遷移：補上新欄位、升為 v3、既有欄位不變', () => {
  const s = createInitialState('foundation-v2-1');
  const before = structuredClone(s);
  s.schemaVersion = 2;
  for (const k of Object.keys(NEW_FIELDS)) delete s[k];
  const text = JSON.stringify({ version: 2, savedAt: '2026-01-01T00:00:00Z', seed: s.seed, state: s });
  const r = restoreSave(text);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.schemaVersion, 3);
  for (const [k, v] of Object.entries(NEW_FIELDS)) assert.deepEqual(r.state[k], v);
  assert.deepEqual(validateState(r.state), []);
  for (const k of Object.keys(before)) {
    if (k === 'schemaVersion' || k in NEW_FIELDS) continue;
    assert.deepEqual(r.state[k], before[k], `${k} 被改動`);
  }
});

test('v2 遷移不覆寫已存在的新欄位值', () => {
  const s = createInitialState('foundation-v2-2');
  s.schemaVersion = 2;
  s.edicts = { x: { add: 1 } };
  const m = migrateState(s);
  assert.deepEqual(m.edicts, { x: { add: 1 } });
});

test('events：flag_not 旗標為假或未設定時成立，為真時不成立', () => {
  const ev = { id: 'e', when: { flag_not: 'done' } };
  assert.equal(isEligible({ stats: {}, flags: {} }, ev, null), true);
  assert.equal(isEligible({ stats: {}, flags: { done: false } }, ev, null), true);
  assert.equal(isEligible({ stats: {} }, ev, null), true);
  assert.equal(isEligible({ stats: {}, flags: { done: true } }, ev, null), false);
});

test('ruleMod：無祖訓時回傳 base', () => {
  const s = createInitialState('foundation-rule-1');
  assert.equal(ruleMod(s, 'tax', 7), 7);
  assert.equal(ruleMod({}, 'tax', 7), 7);
  assert.equal(ruleMod({ edicts: {} }, 'tax', 0), 0);
});

test('ruleMod：有祖訓時套用 (base + add) * mul，缺漏欄位視為 0 與 1', () => {
  const st = { edicts: { tax: { add: 2, mul: 1.5 }, army: { add: -1 }, grain: { mul: 2 } } };
  assert.equal(ruleMod(st, 'tax', 10), 18);
  assert.equal(ruleMod(st, 'army', 10), 9);
  assert.equal(ruleMod(st, 'grain', 10), 20);
});

test('sim-policy：預設策略為 slots 且參與；none 不參與，原樣回傳且不呼叫 rng', () => {
  assert.equal(defaultSimPolicy().participates, true);
  assert.equal(nonePolicy().participates, false);
  const s = createInitialState('foundation-sim-1');
  const snap = structuredClone(s);
  let rngCalls = 0;
  const ctx = { seed: 'x', year: 1, month: 1, rng: () => { rngCalls += 1; return 0.5; } };
  assert.equal(applySimPolicy(s, nonePolicy(), ctx), s);
  assert.equal(rngCalls, 0);
  assert.deepEqual(s, snap);
});

test('demand-queue：enqueue 依序編號、狀態為 open，欄位順序為 id、欄位、status', () => {
  const h = { demands: [], nextDemandId: 5 };
  const q = queueView(h, 'demands', 'nextDemandId');
  const a = enqueue(q, { consortId: 'c1', turn: 3 });
  const b = enqueue(q, { consortId: 'c2', turn: 4 });
  assert.equal(a.id, 5);
  assert.equal(b.id, 6);
  assert.equal(h.nextDemandId, 7);
  assert.deepEqual(Object.keys(a), ['id', 'consortId', 'turn', 'status']);
  assert.equal(openItems(q).length, 2);
});

test('demand-queue：resolve 只作用於 open 項目，且只能裁決一次', () => {
  const h = { demands: [], nextDemandId: 1 };
  const q = queueView(h, 'demands', 'nextDemandId');
  enqueue(q, { turn: 0 });
  assert.equal(resolve(q, 1, 'granted', { resolvedTurn: 9 }).status, 'granted');
  assert.equal(h.demands[0].resolvedTurn, 9);
  assert.equal(resolve(q, 1, 'denied'), null);
  assert.equal(resolve(q, 99, 'denied'), null);
  assert.equal(openItems(q).length, 0);
});

test('demand-queue：cap 只保留最後 max 筆，且以取代方式寫回底層陣列', () => {
  const h = { demands: [], nextDemandId: 1 };
  const q = queueView(h, 'demands', 'nextDemandId');
  for (let i = 0; i < 5; i += 1) enqueue(q, { n: i });
  cap(q, 3);
  assert.deepEqual(h.demands.map((d) => d.n), [2, 3, 4]);
  cap(q, 10);
  assert.equal(h.demands.length, 3);
});

test('demand-queue：純工具不消耗 rng（同種子結果一致）', () => {
  const a = makeRng(['x'])();
  const h = { demands: [], nextDemandId: 1 };
  enqueue(queueView(h, 'demands', 'nextDemandId'), { turn: 0 });
  assert.equal(makeRng(['x'])(), a);
});

// 時段制接入引擎：行動配額依時段分配、早朝六部順序、prepareMonth 整合、schema v2 遷移。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { prepareMonth } from '../src/month-start.js';
import { ACTION_LIMIT, PERIOD_QUOTA, canTakeSlot, ensureAgency, periodLeft, periodSpent, spendSlot } from '../src/slots.js';
import { MINISTRY_ORDER, ministryRank, orderMorningPair } from '../src/ministry-order.js';
import { serializeSave, restoreSave, migrateState, validateState, STATE_SCHEMA_VERSION, exportSave } from '../src/save.js';
import { SCHEMA_VERSION } from '../src/schema.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

// ── 配額 ──

test('每月配額：午後與夜間各 1，合計等於月上限', () => {
  assert.equal(PERIOD_QUOTA.afternoon, 1);
  assert.equal(PERIOD_QUOTA.night, 1);
  assert.equal(PERIOD_QUOTA.afternoon + PERIOD_QUOTA.night, ACTION_LIMIT);
});

test('spendSlot：同一時段本月只能用一次，第二次被拒且不記帳', () => {
  const s = createInitialState('ts-period-1');
  assert.equal(spendSlot(s, 'afternoon', 'audience').ok, true);
  assert.equal(periodSpent(s, 'afternoon'), 1);
  assert.equal(periodLeft(s, 'afternoon'), 0);
  const before = JSON.stringify(s.agency);
  assert.equal(spendSlot(s, 'afternoon', 'garden').ok, false);
  assert.equal(JSON.stringify(s.agency), before);
});

test('時段配額與總額共同限制：午後、夜間各一次後月額已滿', () => {
  const s = createInitialState('ts-total-1');
  assert.equal(spendSlot(s, 'afternoon', 'audience').ok, true);
  assert.equal(spendSlot(s, 'night', 'harem').ok, true);
  assert.equal(ensureAgency(s).used, 2);
  assert.equal(canTakeSlot(s, 'afternoon', s.agency.used), false);
  assert.equal(canTakeSlot(s, 'night', s.agency.used), false);
});

test('朝政行動佔用總額：已用 1 次時，夜間仍可用一次；總額滿則不可', () => {
  const s = createInitialState('ts-shared-1');
  ensureAgency(s).used = 1; // 模擬朝政行動已消耗一次
  assert.equal(spendSlot(s, 'night', 'dc').ok, true);
  assert.equal(ensureAgency(s).used, 2);
  assert.equal(spendSlot(s, 'afternoon', 'review').ok, false);
});

test('spendSlot 拒絕未知時段或選項，不記帳', () => {
  const s = createInitialState('ts-unknown-1');
  assert.equal(spendSlot(s, 'morning', 'audience').ok, false);
  assert.equal(spendSlot(s, 'afternoon', 'rest').ok, false);
  assert.equal(s.agency?.used ?? 0, 0);
});

test('已結束的局不可選時段', () => {
  const s = createInitialState('ts-dead-1');
  s.alive = false;
  assert.equal(spendSlot(s, 'afternoon', 'audience').ok, false);
});

test('ensureAgency 跨月重建，舊月的用量不沿用；同月冪等', () => {
  const s = createInitialState('ts-month-1');
  spendSlot(s, 'afternoon', 'audience');
  const same = ensureAgency(s);
  assert.equal(same.used, 1);
  s.month = s.month === 12 ? 1 : s.month + 1;
  const next = ensureAgency(s);
  assert.equal(next.used, 0);
  assert.equal(periodSpent(s, 'afternoon'), 0);
  assert.equal(next.key, `${s.year}-${s.month}`);
});

test('ensureAgency 保留同月桶內的其他欄位（如派系施壓旗標）', () => {
  const s = createInitialState('ts-faction-1');
  ensureAgency(s).faction = true;
  assert.equal(ensureAgency(s).faction, true);
});

test('無本月用量時，canTakeSlot 允許首次選擇（配額不誤拒）', () => {
  const s = createInitialState('ts-free-1');
  assert.equal(canTakeSlot(s, 'afternoon', 0), true);
});

// ── 六部順序 ──

test('六部順序：吏、戶、禮、兵、刑、工，依序排列', () => {
  assert.deepEqual([...MINISTRY_ORDER], ['吏部', '戶部', '禮部', '兵部', '刑部', '工部']);
  const ranks = ['吏部尚書', '戶部尚書', '禮部侍郎', '兵部侍郎', '刑部侍郎', '工部尚書'].map(ministryRank);
  assert.deepEqual(ranks, [0, 1, 2, 3, 4, 5]);
});

test('下屬寺併入所屬部：太常寺、鴻臚寺歸禮部，大理寺歸刑部', () => {
  assert.equal(ministryRank('太常寺卿'), ministryRank('禮部'));
  assert.equal(ministryRank('鴻臚寺卿'), ministryRank('禮部'));
  assert.equal(ministryRank('大理寺'), ministryRank('刑部'));
});

test('非六部排在六部之後，無 speaker 排最後', () => {
  assert.ok(ministryRank('御史') > ministryRank('工部尚書'));
  assert.ok(ministryRank(null) > ministryRank('御史'));
  assert.ok(ministryRank(undefined) > ministryRank('御史'));
});

test('orderMorningPair：次則部序在前則對調，否則不動，且不改輸入', () => {
  const a = { id: 'a', speaker: '工部尚書' };
  const b = { id: 'b', speaker: '戶部尚書' };
  const [x, y] = orderMorningPair(a, b);
  assert.equal(x.id, 'b');
  assert.equal(y.id, 'a');
  assert.equal(a.id, 'a');
  const [p, q] = orderMorningPair(b, a);
  assert.equal(p.id, 'b');
  assert.equal(q.id, 'a');
});

test('orderMorningPair：同部序或只有一則時維持原順序', () => {
  const a = { id: 'a', speaker: '戶部尚書' };
  const b = { id: 'b', speaker: '戶部侍郎' };
  assert.deepEqual(orderMorningPair(a, b).map((e) => e.id), ['a', 'b']);
  const ids = (pair) => pair.map((e) => (e ? e.id : null));
  assert.deepEqual(ids(orderMorningPair(a, null)), ['a', null]);
  assert.deepEqual(ids(orderMorningPair(null, b)), [null, 'b']);
});

// ── prepareMonth 整合 ──

test('prepareMonth 建立本月行動桶，且呈現順序依六部排列', () => {
  let checked = 0;
  for (let i = 0; i < 40; i++) {
    const s = createInitialState(`ts-prep-${i}`);
    prepareMonth(s, events);
    assert.equal(s.agency.key, `${s.year}-${s.month}`);
    const byId = (id) => (id ? events.find((e) => e.id === id) : null);
    const f = byId(s.monthChain.first);
    const sec = byId(s.monthChain.second);
    if (f && sec) {
      checked++;
      assert.ok(ministryRank(f.speaker) <= ministryRank(sec.speaker), `seed ts-prep-${i} 順序錯誤`);
    }
  }
  assert.ok(checked > 0, '應至少有一個種子同時有兩則奏摺');
});

test('prepareMonth 仍冪等：同月重複呼叫不改變 monthChain 與行動桶', () => {
  const s = createInitialState('ts-prep-idem');
  prepareMonth(s, events);
  const mc = JSON.stringify(s.monthChain);
  spendSlot(s, 'afternoon', 'audience');
  prepareMonth(s, events);
  assert.equal(JSON.stringify(s.monthChain), mc);
  assert.equal(s.agency.used, 1);
});

// ── schema v2 與存檔遷移 ──

test('schemaVersion 已升為 3（至少 2），新局帶有 agency 欄位', () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(STATE_SCHEMA_VERSION, 3);
  const s = createInitialState('ts-schema-1');
  assert.equal(validateState(migrateState(s)).length, 0);
});

test('舊存檔（schemaVersion 1，agency 缺 periods）遷移後可載入，並補上時段用量', () => {
  const s = createInitialState('ts-legacy-1');
  s.schemaVersion = 1;
  s.agency = { key: `${s.year}-${s.month}`, used: 1 };
  const text = JSON.stringify({ version: 2, savedAt: '2026-01-01T00:00:00Z', seed: s.seed, state: s });
  const r = restoreSave(text);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(r.state.agency.used, 1);
  assert.deepEqual(r.state.agency.periods, { afternoon: 0, night: 0 });
});

test('舊版 v1 裸存檔（無 version、無 schemaVersion、無 agency）仍可載入', () => {
  const s = createInitialState('ts-legacy-2');
  delete s.schemaVersion;
  delete s.agency;
  const r = restoreSave(JSON.stringify({ seed: s.seed, state: s }));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.schemaVersion, STATE_SCHEMA_VERSION);
  assert.equal(r.state.agency, null);
});

test('新版存檔往返一致：agency 與 periods 保留', () => {
  const s = createInitialState('ts-roundtrip-1');
  prepareMonth(s, events);
  spendSlot(s, 'night', 'harem');
  const text = exportSave(s);
  const r = restoreSave(text);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.agency.used, 1);
  assert.equal(r.state.agency.periods.night, 1);
  assert.deepEqual(serializeSave(r.state, { now: () => 'x' }).state.agency, r.state.agency);
});

test('較新的 schemaVersion 仍回報 future_schema', () => {
  const s = createInitialState('ts-future-1');
  s.schemaVersion = STATE_SCHEMA_VERSION + 1;
  assert.ok(validateState(s).includes('future_schema'));
});

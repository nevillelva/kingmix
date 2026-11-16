// 網頁端事件池併入出身專屬事件（web/ui/event-pool.js）：寒門出身含 8 則、其他出身不含、存檔往返一致、事件查找成功。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 替身 DOM：web/ui 模組載入時會讀取 document／window／localStorage（與 curriculum-ui.test.js 相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}

const { createInitialState } = await import('../src/state.js');
const { applyOrigin, ORIGINS, UNLOCKABLE_ORIGINS, withOriginEvents } = await import('../src/origin.js');
const { HANMEN_EVENTS } = await import('../src/origin-events-data.js');
const { U } = await import('../web/ui/store.js');
const { gameEventPool, currentEventPool, findPoolEvent } = await import('../web/ui/event-pool.js');

const baseEvents = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const hanmenIds = HANMEN_EVENTS.map((e) => e.id);
const hanmenState = (seed = 'web-origin') => applyOrigin(createInitialState(seed), 'hanmen');
const baseSnapshot = JSON.stringify(baseEvents);

test('寒門出身：網頁事件池併入 8 則寒門專屬事件（E601–E608），且數量與獨立檔一致', () => {
  const pool = gameEventPool(baseEvents, hanmenState());
  assert.equal(pool.length, baseEvents.length + 8);
  assert.equal(HANMEN_EVENTS.length, 8);
  for (const id of hanmenIds) assert.ok(pool.some((e) => e.id === id), id);
  assert.deepEqual(hanmenIds, ['E601', 'E602', 'E603', 'E604', 'E605', 'E606', 'E607', 'E608']);
});

test('網頁與模擬器採同一函式：事件池結果與 withOriginEvents 完全相同', () => {
  const state = hanmenState();
  assert.deepEqual(gameEventPool(baseEvents, state), withOriginEvents(baseEvents, state.origin));
});

test('其他出身（含預設、無出身）不併入寒門事件，事件池與基礎事件庫為同一陣列', () => {
  for (const o of [...ORIGINS, ...UNLOCKABLE_ORIGINS.filter((x) => x.id !== 'hanmen')]) {
    const pool = gameEventPool(baseEvents, applyOrigin(createInitialState('web-origin'), o.id));
    assert.equal(pool, baseEvents, o.id);
    assert.equal(pool.some((e) => hanmenIds.includes(e.id)), false, o.id);
  }
  const bare = createInitialState('web-origin');
  assert.equal(gameEventPool(baseEvents, bare), baseEvents);
});

test('合併不改動基礎事件庫（U.events 與原始資料不變）', () => {
  gameEventPool(baseEvents, hanmenState());
  assert.equal(baseEvents.length, JSON.parse(baseSnapshot).length);
  assert.equal(JSON.stringify(baseEvents), baseSnapshot);
});

test('存檔往返：寒門局序列化後讀回，事件池仍含 8 則寒門事件', () => {
  const saved = JSON.parse(JSON.stringify(hanmenState('round-trip')));
  assert.equal(saved.origin, 'hanmen');
  const loaded = gameEventPool(baseEvents, saved);
  assert.equal(loaded.length, baseEvents.length + 8);
  assert.deepEqual(loaded.map((e) => e.id), gameEventPool(baseEvents, hanmenState('round-trip')).map((e) => e.id));
});

test('事件查找：寒門局可依 id 找到寒門事件；非寒門局找不到', () => {
  U.events = baseEvents;
  U.state = hanmenState();
  assert.ok(currentEventPool().length === baseEvents.length + 8);
  for (const id of hanmenIds) assert.equal(findPoolEvent(id)?.id, id, id);
  assert.equal(findPoolEvent('E501')?.id, 'E501');

  U.state = applyOrigin(createInitialState('web-origin'), 'dichangzi');
  for (const id of hanmenIds) assert.equal(findPoolEvent(id), undefined, id);
  assert.equal(U.events.length, baseEvents.length);

  U.events = [];
  U.state = null;
});

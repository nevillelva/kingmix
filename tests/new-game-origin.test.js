import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNewGame } from '../src/new-game.js';
import { originEventDefs, withOriginEvents, withAllOriginEvents, ORIGINS } from '../src/origin.js';
import { galleryRegistry } from '../src/gallery.js';
import { prepareMonth } from '../src/month-start.js';
import { HANMEN_EVENTS } from '../src/origin-events-data.js';

const BASE = [{ id: 'E001', title: '甲', when: {}, options: [] }];

test('寒門開局：出身於建立狀態時即套用（早於月初準備），並帶入寒門事件池', () => {
  const { state, notes } = buildNewGame({ seed: 'hm-1', origin: 'hanmen', policies: ['agrarian'], modeKey: 'long' });
  assert.deepEqual(notes, []);
  assert.equal(state.origin, 'hanmen');
  assert.equal(state.flags['origin:hanmen'], true);
  const pool = withOriginEvents(BASE, state.origin);
  assert.equal(pool.filter((e) => HANMEN_EVENTS.some((h) => h.id === e.id)).length, HANMEN_EVENTS.length);
});

test('首月準備以含出身事件的池進行，月初可抽到寒門事件（不再漏掉首月）', () => {
  const { state } = buildNewGame({ seed: 'hm-2', origin: 'hanmen', policies: ['agrarian'], modeKey: 'long' });
  const pool = withOriginEvents(BASE, state.origin);
  prepareMonth(state, pool);
  const key = `${state.year}-${state.month}`;
  assert.equal(state.monthChain?.key, key, '首月奏摺已於開局準備');
  const pickedFromPool = [state.monthChain.first, state.monthChain.second].filter(Boolean);
  for (const id of pickedFromPool) assert.ok(pool.some((e) => e.id === id), `抽中事件 ${id} 須來自含出身事件的池`);
});

test('無出身時行為不變：不套用出身、池即為基礎事件庫', () => {
  const { state } = buildNewGame({ seed: 'hm-3', policies: ['agrarian'], modeKey: 'long' });
  assert.equal(state.origin, undefined);
  assert.equal(state.origin ? withOriginEvents(BASE, state.origin) : BASE, BASE);
});

test('出身專屬事件於圖鑑：全部出身的事件皆列入事件條目，依 id 去重', () => {
  const merged = withAllOriginEvents(BASE);
  const total = new Set(merged.map((e) => e.id)).size;
  assert.equal(total, merged.length, '無重複 id');
  const hanmen = originEventDefs('hanmen');
  assert.equal(hanmen.length, HANMEN_EVENTS.length);
  for (const h of hanmen) assert.ok(merged.some((e) => e.id === h.id), `圖鑑含 ${h.id}`);
  const reg = galleryRegistry(merged);
  assert.equal(reg.event.length, merged.length);
  assert.ok(ORIGINS.length >= 1);
});

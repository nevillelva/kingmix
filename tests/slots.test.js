import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS } from '../src/slots.js';

test('夜間為真正二選一：選項僅後宮與東廠密報，「休息」不是卡片選項', () => {
  const night = SLOTS.night;
  assert.equal(night.pick, '二選一');
  assert.deepEqual(night.opts.map((o) => o[0]), ['harem', 'dc']);
  assert.deepEqual(night.opts.map((o) => o[1]), ['後宮', '東廠密報']);
  assert.ok(!night.opts.some((o) => o[0] === 'rest'));
});

test('夜間：選項映射到既有分頁，且註明未選即休息、不耗行動', () => {
  const byId = Object.fromEntries(SLOTS.night.opts.map((o) => [o[0], o[3]]));
  assert.deepEqual(byId.harem, { tab: 'harem' });
  assert.deepEqual(byId.dc, { tab: 'dc' });
  assert.match(SLOTS.night.note, /本夜不採取行動/);
  assert.match(SLOTS.night.note, /不耗行動/);
});

test('午後為三選一：召見大臣、校閱軍務、幸御花園', () => {
  assert.equal(SLOTS.afternoon.pick, '三選一');
  assert.deepEqual(SLOTS.afternoon.opts.map((o) => o[0]), ['audience', 'review', 'garden']);
  assert.deepEqual(SLOTS.afternoon.opts.map((o) => o[1]), ['召見大臣', '校閱軍務', '幸御花園']);
});

test('午後選項映射到既有分頁或外交面板', () => {
  const byId = Object.fromEntries(SLOTS.afternoon.opts.map((o) => [o[0], o[3]]));
  assert.deepEqual(byId.audience, { tab: 'officials' });
  assert.deepEqual(byId.review, { panel: 'diplo' });
  assert.deepEqual(byId.garden, { tab: 'harem' });
});

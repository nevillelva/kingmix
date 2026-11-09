import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { COLLECTIONS, collectItem, collectionProgress, itemFlag, collectFromSet, PICK_SIZE } from '../src/collections.js';
import { applyOption } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import { EVENT_MAX_PER_RUN } from '../src/events.js';

test('three sets with the expected sizes', () => {
  assert.equal(COLLECTIONS.jiuding.items.length, 9);
  assert.equal(COLLECTIONS.sibao.items.length, 4);
  assert.equal(COLLECTIONS.mingju.items.length, 3);
});

test('collecting items updates progress derived from flags', () => {
  const s = createInitialState('c');
  collectItem(s, 'mingju_1');
  assert.equal(s.flags[itemFlag('mingju_1')], true);
  assert.deepEqual(
    { have: collectionProgress(s, 'mingju').have, complete: collectionProgress(s, 'mingju').complete },
    { have: 1, complete: false },
  );
});

test('duplicate collection is a no-op', () => {
  const s = createInitialState('c');
  collectItem(s, 'mingju_1');
  assert.deepEqual(collectItem(s, 'mingju_1'), { added: false, completed: null });
  assert.equal(collectionProgress(s, 'mingju').have, 1);
});

test('completing a set grants its permanent bonus exactly once', () => {
  const s = createInitialState('c');
  const before = s.stats.charm;
  collectItem(s, 'mingju_1');
  collectItem(s, 'mingju_2');
  const last = collectItem(s, 'mingju_3');
  assert.equal(last.completed, 'mingju');
  assert.equal(s.stats.charm, before + 30);
  assert.deepEqual(s.collections.bonuses, ['mingju']);
  assert.equal(collectItem(s, 'mingju_3').completed, null);
  assert.equal(s.stats.charm, before + 30);
});

test('bonus respects stat bounds', () => {
  const s = createInitialState('c');
  s.stats.literature = 490;
  for (const item of COLLECTIONS.sibao.items) collectItem(s, item);
  assert.equal(s.stats.literature, 500);
});

test('an item set externally through the existing setFlag path counts as collected', () => {
  const s = createInitialState('c');
  s.flags[itemFlag('sibao_wen')] = true;
  assert.equal(collectionProgress(s, 'sibao').have, 1);
});

test('unknown items and sets throw', () => {
  const s = createInitialState('c');
  assert.throws(() => collectItem(s, 'nope'));
  assert.throws(() => collectionProgress(s, 'nope'));
});

// ---- 事件效果 collect：事件可送出收藏，集齊才給加成 ----

test('collectFromSet grants PICK_SIZE items per call and completes the set', () => {
  const s = createInitialState('cf1');
  const rng = makeRng(['cf1']);
  const before = s.stats.power;
  for (let i = 0; i < PICK_SIZE.jiuding; i++) collectFromSet(s, 'jiuding', rng);
  assert.equal(collectionProgress(s, 'jiuding').have, 9);
  assert.equal(s.stats.power, before + 20, 'bonus applied once on completion');
  assert.deepEqual(s.collections.bonuses, ['jiuding']);
});

test('collectFromSet on a complete set is a no-op', () => {
  const s = createInitialState('cf2');
  for (const item of COLLECTIONS.sibao.items) collectItem(s, item);
  const before = s.stats.literature;
  assert.deepEqual(collectFromSet(s, 'sibao', makeRng(['cf2'])), []);
  assert.equal(s.stats.literature, before);
});

test('collectFromSet only draws items not yet owned', () => {
  const s = createInitialState('cf3');
  collectItem(s, 'sibao_wen');
  collectItem(s, 'sibao_wu');
  const got = collectFromSet(s, 'sibao', makeRng(['cf3']));
  assert.equal(got.length, PICK_SIZE.sibao);
  assert.equal(collectionProgress(s, 'sibao').have, 4);
  assert.ok(got.every((r) => r.added));
});

test('an event option with effect collect works through applyOption', () => {
  const s = createInitialState('cf4');
  applyOption(s, { effects: { collect: 'mingju' } }, makeRng(['cf4']));
  assert.equal(collectionProgress(s, 'mingju').have, PICK_SIZE.mingju);
});

test('pick sizes let one event (capped per run) complete every set', () => {
  for (const [id, set] of Object.entries(COLLECTIONS)) {
    assert.ok(PICK_SIZE[id] * EVENT_MAX_PER_RUN >= set.items.length, `${id} cannot complete under the cap`);
  }
});

test('the collection events in events.json cover every set', () => {
  const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
  const sets = events.flatMap((e) => e.options.filter((o) => o.effects?.collect).map((o) => o.effects.collect));
  assert.deepEqual([...new Set(sets)].sort(), Object.keys(COLLECTIONS).sort());
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { COLLECTIONS, collectItem, collectionProgress, itemFlag } from '../src/collections.js';

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

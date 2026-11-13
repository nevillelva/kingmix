import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { isEligible, EVENT_MAX_PER_RUN } from '../src/events.js';
import { ownsItem, collectItem, itemFlag, COLLECTIONS } from '../src/collections.js';
import { applyOption } from '../src/turn.js';
import { runSimulation, isStateGated } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = new Map(events.map((e) => [e.id, e]));
const always = () => 0;
const ev = (when) => ({ id: 'TEST', when });
const ITEMS = new Set(Object.values(COLLECTIONS).flatMap((c) => c.items));

test('has_item: false until the item is collected, then true', () => {
  const s = createInitialState('item-a');
  assert.equal(isEligible(s, ev({ has_item: 'sibao_bi' }), always), false);
  collectItem(s, 'sibao_bi');
  assert.equal(isEligible(s, ev({ has_item: 'sibao_bi' }), always), true);
  assert.equal(isEligible(s, ev({ has_item: 'sibao_wen' }), always), false, 'other items stay unowned');
});

test('has_item: an item granted through the existing setFlag path counts as owned', () => {
  const s = createInitialState('item-b');
  s.flags[itemFlag('jiuding_4')] = true;
  assert.equal(ownsItem(s, 'jiuding_4'), true);
  assert.equal(isEligible(s, ev({ has_item: 'jiuding_4' }), always), true);
});

test('has_item: a collect effect grants items that later has_item checks see', () => {
  const s = createInitialState('item-c');
  applyOption(s, { key: 'A', effects: { collect: 'mingju' } }, makeRng(['grant']));
  const owned = COLLECTIONS.mingju.items.filter((i) => ownsItem(s, i));
  assert.equal(owned.length, 1, 'a mingju collect grants one item');
  assert.equal(isEligible(s, ev({ has_item: owned[0] }), always), true);
});

test('has_item: unknown items throw instead of silently failing', () => {
  const s = createInitialState('item-d');
  assert.throws(() => ownsItem(s, 'jade'), /unknown collection item/);
  assert.throws(() => isEligible(s, ev({ has_item: 'mingju_9' }), always), /unknown collection item/);
});

test('has_item counts as a state gate for fairness weighting', () => {
  assert.equal(isStateGated({ when: { has_item: 'mingju_1' } }), true);
});

test('every has_item condition in data/events.json names a real collection item', () => {
  for (const e of events) {
    if (e.when && 'has_item' in e.when) assert.ok(ITEMS.has(e.when.has_item), `${e.id} has_item ${e.when.has_item}`);
  }
});

test('E471–E500 exist, use only known effect keys, and at least half are state-gated', () => {
  const added = [];
  for (let n = 471; n <= 500; n++) {
    const e = byId.get(`E${n}`);
    assert.ok(e, `E${n} must exist`);
    added.push(e);
  }
  assert.ok(added.filter(isStateGated).length * 2 >= added.length);
  const allowed = new Set(['treasury', 'agriculture', 'benevolence', 'people', 'armament', 'charm', 'health', 'military', 'power', 'heaven', 'literature', 'commerce', 'prestige', 'collect']);
  for (const e of added) for (const o of e.options) {
    for (const k of Object.keys(o.effects)) assert.ok(allowed.has(k), `${e.id} uses unknown effect ${k}`);
  }
});

test('no event fires more than the per-run cap in sampled runs', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const r = runSimulation({ seed: `cap-${seed}`, months: 480, events });
    for (const [id, n] of Object.entries(r.triggered)) {
      if (id === 'DC') continue; // 東廠動作計數，非事件
      assert.ok(n <= EVENT_MAX_PER_RUN, `${id} ran ${n} times in seed ${seed}`);
    }
  }
});

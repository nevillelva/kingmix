import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { isEligible } from '../src/events.js';
import { ITEMS, listInventory, giveItem, addItem, hasItem, GIFT_LOYALTY_OFFICIAL, GIFT_FAVOR_CONSORT } from '../src/items.js';
import { applyOption } from '../src/turn.js';
import { runSimulation } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const base = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const itemEvents = JSON.parse(readFileSync(new URL('../data/events-items.json', import.meta.url), 'utf8')).events;
const always = () => 0;
const ev = (when) => ({ id: 'TEST', when });
const ITEM_IDS = new Set(ITEMS.map((i) => i.id));

function withOfficial(s) {
  s.officials = [{ id: 'o1', loyalty: 50, abilities: {}, traits: [] }];
  return s;
}
function withConsort(s) {
  s.consorts = [{ id: 'c1', favor: 50 }];
  return s;
}

test('ITEMS: at least three kinds with unique ids and names', () => {
  assert.ok(ITEMS.length >= 3);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  assert.equal(new Set(ITEMS.map((i) => i.name)).size, ITEMS.length);
  for (const i of ITEMS) assert.ok(i.name && i.desc, `${i.id} needs name and desc`);
});

test('addItem / hasItem / listInventory track counts and mirror col: flags', () => {
  const s = createInitialState('items-a');
  assert.equal(hasItem(s, 'yujian'), false);
  addItem(s, 'yujian');
  addItem(s, 'yujian', 2);
  assert.equal(hasItem(s, 'yujian'), true);
  assert.equal(s.flags['col:yujian'], true, 'ownership mirrored to col: flag');
  const inv = listInventory(s);
  assert.deepEqual(inv.find((x) => x.id === 'yujian'), { id: 'yujian', name: '御賜寶劍', count: 3 });
  assert.equal(inv.find((x) => x.id === 'danyao').count, 0);
});

test('addItem rejects unknown items and bad counts', () => {
  const s = createInitialState('items-b');
  assert.throws(() => addItem(s, 'jade'), /unknown item/);
  assert.throws(() => addItem(s, 'yujian', 0), /invalid count/);
  assert.throws(() => hasItem(s, 'jade'), /unknown item/);
});

test('giveItem to an official raises loyalty, decrements stock, and clears the flag at zero', () => {
  const s = withOfficial(createInitialState('items-c'));
  addItem(s, 'zihua');
  const r = giveItem(s, 'zihua', 'official', 'o1');
  assert.deepEqual([r.ok, r.reason], [true, 'ok']);
  assert.equal(s.officials[0].loyalty, 50 + GIFT_LOYALTY_OFFICIAL);
  assert.equal(hasItem(s, 'zihua'), false);
  assert.equal(s.flags['col:zihua'], undefined, 'flag removed once the last piece is given');
});

test('giveItem to a consort raises favor, capped at 100', () => {
  const s = withConsort(createInitialState('items-d'));
  s.consorts[0].favor = 98;
  addItem(s, 'danyao', 2);
  giveItem(s, 'danyao', 'consort', 'c1');
  assert.equal(s.consorts[0].favor, 100);
  assert.equal(hasItem(s, 'danyao'), true, 'one piece remains');
  assert.ok(GIFT_FAVOR_CONSORT > 0);
});

test('giveItem failures leave state untouched', () => {
  const s = withOfficial(withConsort(createInitialState('items-e')));
  const before = JSON.stringify(s);
  assert.deepEqual(
    [giveItem(s, 'yujian', 'official', 'o1').reason, giveItem(s, 'yujian', 'consort', 'c1').reason],
    ['not_owned', 'not_owned'],
  );
  addItem(s, 'yujian');
  const snap = JSON.stringify(s);
  assert.equal(giveItem(s, 'yujian', 'palace', 'o1').reason, 'bad_target_kind');
  assert.equal(giveItem(s, 'yujian', 'official', 'nobody').reason, 'no_target');
  assert.equal(giveItem(s, 'yujian', 'consort', 'nobody').reason, 'no_target');
  assert.equal(JSON.stringify(s), snap, 'failed gifts do not change the state');
  assert.notEqual(snap, before);
});

test('an item granted by setFlag (col: flag, no inventory count) counts as owned and can be given', () => {
  const s = withOfficial(createInitialState('items-f'));
  applyOption(s, { key: 'A', effects: { setFlag: 'col:yujian' } }, makeRng(['grant-item']));
  assert.equal(hasItem(s, 'yujian'), true);
  assert.equal(listInventory(s).find((x) => x.id === 'yujian').count, 1);
  assert.equal(giveItem(s, 'yujian', 'official', 'o1').ok, true);
  assert.equal(hasItem(s, 'yujian'), false);
});

test('event flag conditions see owned items', () => {
  const s = createInitialState('items-g');
  assert.equal(isEligible(s, ev({ flag: 'col:danyao' }), always), false);
  addItem(s, 'danyao');
  assert.equal(isEligible(s, ev({ flag: 'col:danyao' }), always), true);
});

test('the item event file has exactly E517–E526, unique and clear of events.json ids', () => {
  const ids = itemEvents.map((e) => e.id);
  const expected = Array.from({ length: 10 }, (_, i) => `E${517 + i}`);
  assert.deepEqual(ids, expected);
  const taken = new Set(base.map((e) => e.id));
  for (const id of ids) assert.equal(taken.has(id), false, `${id} collides with data/events.json`);
});

test('item events match the events.json schema and use only known keys and item ids', () => {
  const stats = new Set(['treasury', 'agriculture', 'benevolence', 'people', 'armament', 'charm', 'health', 'military', 'power', 'heaven', 'literature', 'commerce', 'prestige']);
  const extra = new Set(['official_loyalty_add', 'investigate_lowest', 'setFlag']);
  for (const e of itemEvents) {
    for (const k of ['id', 'name', 'speaker', 'narrative', 'when', 'options']) assert.ok(k in e, `${e.id} missing ${k}`);
    assert.ok(Array.isArray(e.options) && e.options.length >= 2, `${e.id} needs at least two options`);
    for (const [k, v] of Object.entries(e.when)) {
      assert.notEqual(k, 'has_item', `${e.id} must use flag, not has_item (ownsItem rejects item ids)`);
      if (k === 'flag') assert.ok(ITEM_IDS.has(v.replace(/^col:/, '')), `${e.id} flag ${v}`);
    }
    for (const o of e.options) {
      for (const k of ['key', 'label', 'tone', 'effects']) assert.ok(k in o, `${e.id} option missing ${k}`);
      for (const [k, v] of Object.entries(o.effects)) {
        if (k === 'setFlag') assert.ok(ITEM_IDS.has(v.replace(/^col:/, '')), `${e.id} setFlag ${v}`);
        else assert.ok(stats.has(k) || extra.has(k), `${e.id} unknown effect ${k}`);
        if (stats.has(k)) assert.equal(typeof v, 'number', `${e.id} ${k} must be numeric`);
      }
    }
  }
});

test('every item event is reachable: each fires at least once in 40 headless seeds of 40 years', () => {
  const all = [...base, ...itemEvents];
  const hit = new Map(itemEvents.map((e) => [e.id, 0]));
  for (let seed = 1; seed <= 40; seed++) {
    const r = runSimulation({ seed: `items-test-${seed}`, months: 480, events: all });
    for (const id of hit.keys()) if (r.triggered[id]) hit.set(id, hit.get(id) + 1);
  }
  for (const [id, n] of hit) assert.ok(n >= 1, `${id} never fired in 40 seeds`);
});

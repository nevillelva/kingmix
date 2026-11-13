import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGINS, applyOrigin, originEvents } from '../src/origin.js';
import { createInitialState, BOUNDS } from '../src/state.js';
import { isEligible } from '../src/events.js';

const { events: originEventList } = JSON.parse(readFileSync(new URL('../data/events-origin.json', import.meta.url), 'utf8'));
const always = () => 0; // chance 條件以 0 通過（rng() < val 恆真）

test('ORIGINS: four origins with id, name, desc, pros, cons, statMods and unique ids', () => {
  assert.equal(ORIGINS.length, 4);
  assert.equal(new Set(ORIGINS.map((o) => o.id)).size, 4);
  for (const o of ORIGINS) {
    assert.equal(typeof o.name, 'string');
    assert.equal(typeof o.desc, 'string');
    assert.ok(Array.isArray(o.pros) && o.pros.length >= 1);
    assert.ok(Array.isArray(o.cons) && o.cons.length >= 1);
    for (const key of Object.keys(o.statMods)) assert.ok(key in BOUNDS, `unknown stat ${key} in ${o.id}`);
  }
});

test('ORIGINS: each origin has a positive and a negative stat modifier (pros and cons are real)', () => {
  for (const o of ORIGINS) {
    const vals = Object.values(o.statMods);
    assert.ok(vals.some((v) => v > 0), `${o.id} has no positive modifier`);
    assert.ok(vals.some((v) => v < 0), `${o.id} has no negative modifier`);
  }
});

test('applyOrigin: applies stat modifiers, sets state.origin and the origin flag', () => {
  for (const o of ORIGINS) {
    const base = createInitialState(7);
    const before = { ...base.stats };
    const state = applyOrigin(createInitialState(7), o.id);
    assert.equal(state.origin, o.id);
    assert.equal(state.flags[`origin:${o.id}`], true);
    for (const [key, delta] of Object.entries(o.statMods)) {
      const expected = Math.min(BOUNDS[key][1], Math.max(BOUNDS[key][0], before[key] + delta));
      assert.equal(state.stats[key], expected, `${o.id} ${key}`);
    }
  }
});

test('applyOrigin: returns the same state object and clamps to bounds without warnings', () => {
  const state = createInitialState(3);
  state.stats.benevolence = 5; // 150 之外另設低值，確認下限截斷
  const out = applyOrigin(state, 'jungong');
  assert.equal(out, state);
  assert.equal(state.stats.benevolence, 0);
  assert.equal(state.warnings.length, 0);
});

test('applyOrigin: unknown origin throws', () => {
  assert.throws(() => applyOrigin(createInitialState(1), 'nope'), /unknown origin/);
  assert.throws(() => originEvents('nope'), /unknown origin/);
});

test('createInitialState: no origin option leaves the state unchanged; opts.origin applies it', () => {
  const plain = createInitialState(42);
  assert.equal('origin' in plain, false);
  assert.equal(Object.keys(plain.flags).some((k) => k.startsWith('origin:')), false);
  const withOrigin = createInitialState(42, { origin: 'waifan' });
  assert.equal(withOrigin.origin, 'waifan');
  assert.equal(withOrigin.stats.armament, plain.stats.armament + 50);
});

test('originEvents: four ids per origin, all E501–E516, no overlap between origins', () => {
  const all = [];
  for (const o of ORIGINS) {
    const ids = originEvents(o.id);
    assert.equal(ids.length, 4, o.id);
    all.push(...ids);
  }
  assert.equal(new Set(all).size, 16);
  for (const id of all) assert.match(id, /^E5(0[1-9]|1[0-6])$/);
});

test('origin events file: 16 events matching originEvents, schema like data/events.json', () => {
  const fileIds = originEventList.map((e) => e.id).sort();
  const apiIds = ORIGINS.flatMap((o) => originEvents(o.id)).sort();
  assert.deepEqual(fileIds, apiIds);
  for (const e of originEventList) {
    assert.equal(typeof e.name, 'string');
    assert.equal(typeof e.speaker, 'string');
    assert.equal(typeof e.narrative, 'string');
    assert.ok(e.when && typeof e.when === 'object');
    assert.ok(Array.isArray(e.options) && e.options.length >= 2 && e.options.length <= 3, e.id);
    for (const o of e.options) {
      assert.equal(typeof o.key, 'string');
      assert.equal(typeof o.label, 'string');
      assert.equal(typeof o.tone, 'string');
      for (const [key, val] of Object.entries(o.effects)) {
        assert.ok(key in BOUNDS, `${e.id} unknown effect ${key}`);
        assert.equal(typeof val, 'number');
      }
    }
  }
});

test('origin events: each event is gated by its own origin flag only', () => {
  for (const o of ORIGINS) {
    for (const id of originEvents(o.id)) {
      const ev = originEventList.find((e) => e.id === id);
      assert.equal(ev.when.flag, `origin:${o.id}`, id);
      const without = createInitialState(9);
      assert.equal(isEligible(without, ev, always), false, `${id} must not fire without its origin`);
      const other = ORIGINS.find((x) => x.id !== o.id);
      assert.equal(isEligible(applyOrigin(createInitialState(9), other.id), ev, always), false, `${id} must not fire for ${other.id}`);
      assert.equal(isEligible(applyOrigin(createInitialState(9), o.id), ev, always), true, `${id} must fire for ${o.id}`);
    }
  }
});

test('origin events: every option effect is applicable through the existing clamp (setStat)', () => {
  for (const e of originEventList) {
    for (const o of e.options) {
      for (const key of Object.keys(o.effects)) assert.ok(BOUNDS[key], `${e.id}.${o.key} ${key}`);
    }
  }
});

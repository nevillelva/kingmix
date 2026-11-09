import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectSize, effectChipText, SIZE_THRESHOLDS } from '../src/effect-display.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

test('size buckets follow the per-stat thresholds (小 ≤ small, 中 ≤ mid, 大 above)', () => {
  assert.equal(effectSize('treasury', 30), '小');
  assert.equal(effectSize('treasury', -30), '小');
  assert.equal(effectSize('treasury', 31), '中');
  assert.equal(effectSize('treasury', -60), '中');
  assert.equal(effectSize('treasury', -61), '大');
  assert.equal(effectSize('benevolence', 3), '小');
  assert.equal(effectSize('benevolence', 6), '大');
});

test('unknown stats fall back to the default thresholds; zero and non-numbers show nothing', () => {
  assert.equal(effectSize('some_new_key', 1), '小');
  assert.equal(effectSize('some_new_key', 4), '中');
  assert.equal(effectSize('some_new_key', 9), '大');
  assert.equal(effectSize('treasury', 0), null);
  assert.equal(effectSize('treasury', '5'), null);
  assert.equal(effectSize('treasury', NaN), null);
});

test('chip text shows direction and size only, never the exact number', () => {
  assert.equal(effectChipText('treasury', -80, '國庫'), '國庫 ▼大');
  assert.equal(effectChipText('agriculture', 20, '農業'), '農業 ▲中');
  assert.equal(effectChipText('people', 0, '民心'), null);
  for (const [k, v] of [['treasury', -80], ['charm', 4], ['prestige', 2]]) {
    assert.doesNotMatch(effectChipText(k, v, 'X'), /\d/);
  }
});

test('every numeric option effect in events.json maps to a size (no stat is left unsized)', () => {
  for (const e of events) {
    for (const o of e.options) {
      for (const [k, v] of Object.entries(o.effects || {})) {
        if (typeof v !== 'number' || v === 0) continue;
        assert.ok(effectSize(k, v), `${e.id}.${k}=${v} has no size`);
      }
    }
  }
});

test('thresholds are sane: small < mid for every configured stat', () => {
  for (const [k, [small, mid]] of Object.entries(SIZE_THRESHOLDS)) {
    assert.ok(small > 0 && small < mid, `${k} thresholds ${small}/${mid} must satisfy 0 < small < mid`);
  }
});

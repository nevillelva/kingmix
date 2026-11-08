import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed } from '../src/rng.js';

test('same parts produce identical sequences', () => {
  const a = makeRng(['s1', 1, 1, 'events']);
  const b = makeRng(['s1', 1, 1, 'events']);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('different parts diverge', () => {
  assert.notEqual(hashSeed(['s1', 1, 1]), hashSeed(['s1', 1, 2]));
  assert.notEqual(makeRng(['s1'])(), makeRng(['s2'])());
});

test('values lie in [0, 1)', () => {
  const r = makeRng(['range']);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

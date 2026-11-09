import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loyaltySafeInfluence } from '../src/officials.js';
import { FACTION_BASE } from '../src/state.js';
import { tyrannyStatus, addTyranny, TYRANNY_QINGLIU_THRESHOLD } from '../src/dongchang.js';
import { createInitialState } from '../src/state.js';

test('忠誠安全線：達安全線時月結漂移不為負，低於則流失', () => {
  for (const ambition of [0, 20, 45, 70]) {
    const line = loyaltySafeInfluence(ambition);
    const driftAt = (inf) => (inf - FACTION_BASE) / 100 - ambition / 200;
    assert.ok(Math.abs(driftAt(line)) < 1e-9, `野心 ${ambition} 於安全線不流失`);
    assert.ok(driftAt(line - 1) < 0, `野心 ${ambition} 低於安全線會流失`);
  }
});

test('暴政量表：回報數值、上限與清流下降門檻', () => {
  const st = createInitialState('ty-1');
  assert.deepEqual(tyrannyStatus(st), { value: 0, max: 100, threshold: TYRANNY_QINGLIU_THRESHOLD, qingliuDrainOn: false });
  addTyranny(st, TYRANNY_QINGLIU_THRESHOLD);
  assert.equal(tyrannyStatus(st).qingliuDrainOn, true);
  addTyranny(st, 500);
  assert.equal(tyrannyStatus(st).value, 100);
});

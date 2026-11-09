import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';

const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;

test('headless output reports collection progress for all three sets', () => {
  const r = runSimulation({ seed: 'col-shape', months: 24, events });
  for (const id of ['jiuding', 'sibao', 'mingju']) {
    const c = r.collections[id];
    assert.equal(c.id, id);
    assert.equal(typeof c.have, 'number');
    assert.equal(typeof c.complete, 'boolean');
  }
});

test('every collection set can be completed within 60 headless runs (not a dead feature)', () => {
  const done = { jiuding: 0, sibao: 0, mingju: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const r = runSimulation({ seed: `col-reach-${seed}`, months: 600, events });
    for (const k of Object.keys(done)) if (r.collections[k].complete) done[k]++;
  }
  for (const [k, n] of Object.entries(done)) assert.ok(n >= 1, `${k} never completed in 60 runs`);
});

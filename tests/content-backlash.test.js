import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';
import { EVENT_MAX_PER_RUN } from '../src/events.js';

// 回流後果與危機奏摺鏈：E904–E933（30 則）。E914–E923 為 E904–E913 的連鎖後續，不另由 when 抽中。
const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = new Map(events.map((e) => [e.id, e]));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `E${a + i}`);
const NEW_IDS = range(904, 933);
const CRISIS_FOLLOWUPS = range(914, 923);
const SEEDS = 40;
const YEARS_MONTHS = 480;

test('all 30 backlash events exist once, with narrative, speaker and three options', () => {
  for (const id of NEW_IDS) {
    const e = byId.get(id);
    assert.ok(e, `${id} missing from data/events.json`);
    assert.equal(events.filter((x) => x.id === id).length, 1, `${id} must be unique`);
    assert.ok(e.name && e.speaker && e.narrative, `${id} needs name, speaker, narrative`);
    assert.equal(e.options.length, 3, `${id} should have three options`);
  }
});

test('crisis follow-ups E914–E923 are only reached through chain links from E904–E913', () => {
  const chained = new Set();
  for (const id of range(904, 913)) {
    for (const o of byId.get(id).options) if (o.effects?.chain) chained.add(o.effects.chain);
  }
  for (const id of CRISIS_FOLLOWUPS) {
    assert.ok(chained.has(id), `${id} must be the target of a chain link`);
    assert.ok(byId.has(id), `${id} missing`);
  }
  for (const id of chained) assert.ok(byId.has(id), `chain target ${id} must exist`);
});

test('new events keep a probability or timing gate so they do not fire every month', () => {
  for (const id of [...range(904, 913), ...range(924, 933)]) {
    const w = byId.get(id).when;
    assert.ok(w && typeof w === 'object', `${id} needs a when clause`);
    assert.ok(w.chance !== undefined || w.every_years !== undefined, `${id} needs chance or every_years`);
  }
});

test(`no new event exceeds EVENT_MAX_PER_RUN (${EVENT_MAX_PER_RUN}) in a run, over ${SEEDS} seeds x 40 years`, () => {
  const seen = new Map(NEW_IDS.map((id) => [id, 0]));
  let worst = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { triggered } = runSimulation({ seed: `backlash-${seed}`, months: YEARS_MONTHS, events });
    for (const id of NEW_IDS) {
      const n = triggered[id] || 0;
      if (n > 0) seen.set(id, seen.get(id) + 1);
      worst = Math.max(worst, n);
    }
  }
  assert.ok(worst <= EVENT_MAX_PER_RUN, `a new event fired ${worst} times in one run`);
  const reached = NEW_IDS.filter((id) => seen.get(id) > 0).length;
  assert.ok(reached >= 20, `only ${reached}/30 new events fired over ${SEEDS} seeds`);
});

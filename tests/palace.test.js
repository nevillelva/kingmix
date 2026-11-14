import { eventsRange } from './_events-range.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingMarks, acknowledgeMark, seasonFor } from '../src/palace.js';
import { buildFacility, advanceConstruction, FACILITIES, FACILITY_IDS } from '../src/facilities.js';
import { createInitialState } from '../src/state.js';
import { isEligible } from '../src/events.js';
import { runSimulation } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const { events: mainEvents } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const palaceEvents = eventsRange(565, 572);

const base = (treasury = 500) => {
  const s = createInitialState(11);
  s.stats.treasury = treasury;
  return s;
};

test('pendingMarks flags affordable upgrades and skips buildings under construction', () => {
  const s = base(70);
  const marks = pendingMarks(s);
  assert.ok(marks.some((m) => m.buildingId === 'medical' && m.reason === 'affordable'));
  assert.ok(!marks.some((m) => m.buildingId === 'garden'), 'garden costs 80 and must not be marked');

  const building = buildFacility(base(1000), 'library').state;
  assert.ok(!pendingMarks(building).some((m) => m.buildingId === 'library'));
});

test('pendingMarks reports completed work until acknowledged', () => {
  let s = buildFacility(base(1000), 'armory').state;
  for (let i = 0; i < FACILITIES.armory.levels[0].months; i++) advanceConstruction(s);
  assert.deepEqual(pendingMarks(s).find((m) => m.buildingId === 'armory'), { buildingId: 'armory', reason: 'completed' });
  const cleared = acknowledgeMark(s, 'armory');
  assert.ok(!pendingMarks(cleared).some((m) => m.reason === 'completed'));
  assert.ok(s.facilityDone.armory, 'acknowledgeMark must not mutate input');
});

test('pendingMarks only uses known palace building ids', () => {
  for (const m of pendingMarks(base(100000))) assert.ok(FACILITY_IDS.includes(m.buildingId));
});

test('seasonFor maps months to seasons', () => {
  const at = (month) => seasonFor({ month });
  assert.equal(at(1), 'spring');
  assert.equal(at(3), 'spring');
  assert.equal(at(4), 'summer');
  assert.equal(at(7), 'autumn');
  assert.equal(at(10), 'winter');
  assert.equal(at(12), 'winter');
  assert.throws(() => seasonFor({ month: 13 }));
});

test('palace events have E565-E572, unique ids, and no collision with events.json', () => {
  const ids = palaceEvents.map((e) => e.id);
  assert.deepEqual(ids, ['E565', 'E566', 'E567', 'E568', 'E569', 'E570', 'E571', 'E572']);
  const main = new Set(mainEvents.map((e) => e.id));
  for (const id of ids) assert.equal(mainEvents.filter((e) => e.id === id).length, 1, `${id} must appear once in events.json`);
  for (const e of palaceEvents) {
    assert.ok(e.name && e.speaker && e.narrative, `${e.id} missing text`);
    assert.ok(e.options.length >= 2, `${e.id} needs options`);
    for (const o of e.options) assert.ok(o.key && o.label && o.tone && o.effects, `${e.id} option malformed`);
  }
});

test('palace event conditions are all understood by the engine', () => {
  const s = base();
  for (const e of palaceEvents) {
    assert.doesNotThrow(() => isEligible(s, e, makeRng(['palace', e.id])), e.id);
  }
});

test('every palace event is reachable across 200 seeds x 40 years', () => {
  const fired = Object.fromEntries(palaceEvents.map((e) => [e.id, 0]));
  for (let seed = 1; seed <= 200; seed++) {
    const r = runSimulation({ seed, months: 480, events: palaceEvents });
    for (const id of Object.keys(fired)) fired[id] += r.triggered[id] ?? 0;
  }
  for (const [id, n] of Object.entries(fired)) assert.ok(n > 0, `${id} never fired`);
});

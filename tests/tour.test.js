import { eventsRange } from './_events-range.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { serializeSave, parseSave } from '../src/save.js';
import { PREFECTURE_DEFS } from '../src/economy.js';
import {
  PREFECTURES, PREFECTURE_EVENTS, TOUR_BUSY_MONTHS, TOUR_COST, MORALE_INIT,
  tourTo, tourEvents, prefectureStatus, currentLocation,
} from '../src/tour.js';
import { isEligible, eventAllowed, recordEvent, EVENT_MAX_PER_RUN } from '../src/events.js';
import { applyOption, afterOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';
import { ensureCity } from '../src/city.js';

const mainEvents = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const tourEventList = eventsRange(547, 564);
const byId = Object.fromEntries(tourEventList.map((e) => [e.id, e]));

test('PREFECTURES mirror the six 府 of economy.js with map coordinates', () => {
  assert.equal(PREFECTURES.length, 6);
  assert.deepEqual(PREFECTURES.map((p) => p.id), PREFECTURE_DEFS.map((d) => d.id));
  for (const p of PREFECTURES) {
    assert.equal(typeof p.name, 'string');
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('location defaults to the capital and persists through the save object', () => {
  const s = createInitialState('tour-save');
  assert.equal(currentLocation(s), 'jingzhao');
  tourTo(s, 'yizhou');
  const restored = parseSave(JSON.stringify(serializeSave(s, { now: () => '2026-01-01T00:00:00.000Z' })));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.location, 'yizhou');
  assert.equal(restored.state.prefectures.find((p) => p.id === 'yizhou').visited, true);
  assert.equal(restored.state.prefectures.find((p) => p.id === 'yizhou').morale, MORALE_INIT + 8);
});

test('legacy state without tour fields loads with lazy defaults', () => {
  const s = createInitialState('tour-legacy');
  delete s.location;
  delete s.tour;
  for (const p of ensureCity(s)) { delete p.morale; delete p.visited; }
  assert.equal(currentLocation(s), 'jingzhao');
  assert.equal(prefectureStatus(s)[0].morale, MORALE_INIT);
});

test('tourTo moves the emperor, changes the prefecture stats and costs treasury', () => {
  const s = createInitialState('tour-move');
  const before = { treasury: s.stats.treasury, people: s.stats.people };
  const r = tourTo(s, 'jiangning');
  assert.deepEqual([r.ok, r.reason], [true, null]);
  assert.equal(r.state, s);
  assert.equal(s.location, 'jiangning');
  assert.equal(s.stats.treasury, before.treasury - TOUR_COST);
  assert.equal(s.stats.people, before.people + 1);
  const st = prefectureStatus(s).find((p) => p.id === 'jiangning');
  assert.equal(st.visited, true);
  assert.equal(st.morale, MORALE_INIT + 8);
  assert.equal(st.defense, 52);
});

test('tourTo refuses unknown, current, busy and unaffordable targets without changing state', () => {
  const s = createInitialState('tour-refuse');
  assert.equal(tourTo(s, 'nowhere').reason, 'unknown');
  assert.equal(tourTo(s, 'jingzhao').reason, 'here');
  assert.equal(tourTo(s, 'hedong').ok, true);
  assert.equal(tourTo(s, 'yizhou').reason, 'busy');
  assert.equal(s.location, 'hedong');
  const broke = createInitialState('tour-broke');
  broke.stats.treasury = TOUR_COST - 1;
  assert.equal(tourTo(broke, 'hedong').reason, 'treasury');
  assert.equal(broke.location, 'jingzhao');
});

test('touring takes time: another tour is allowed after TOUR_BUSY_MONTHS', () => {
  const s = createInitialState('tour-time');
  tourTo(s, 'hedong');
  for (let i = 0; i < TOUR_BUSY_MONTHS; i++) advanceMonth(s);
  assert.equal(tourTo(s, 'yizhou').ok, true);
});

test('tourTo does not touch officials, bonds or event history', () => {
  const s = createInitialState('tour-isolated');
  const officials = JSON.stringify(s.officials);
  const history = JSON.stringify(s.eventHistory ?? null);
  tourTo(s, 'denglai');
  assert.equal(JSON.stringify(s.officials), officials);
  assert.equal(JSON.stringify(s.eventHistory ?? null), history);
});

test('event file: 18 unique ids E547–E564 with no collision in data/events.json', () => {
  assert.equal(tourEventList.length, 18);
  const ids = tourEventList.map((e) => e.id);
  assert.deepEqual(ids, Array.from({ length: 18 }, (_, i) => `E${547 + i}`));
  const mainIds = new Set(mainEvents.map((e) => e.id));
  for (const id of ids) assert.equal(mainEvents.filter((e) => e.id === id).length, 1, `${id} must appear once in events.json`);
});

test('event schema matches data/events.json', () => {
  const keysOf = (o) => Object.keys(o).sort().join(',');
  const topKeys = new Set(mainEvents.map((e) => keysOf(e).replace(/,kind/, '')));
  for (const e of tourEventList) {
    assert.ok(topKeys.has(keysOf(e)) || keysOf(e) === 'id,name,narrative,options,speaker,when', keysOf(e));
    assert.ok(e.options.length >= 2);
    for (const o of e.options) assert.deepEqual(Object.keys(o).sort(), ['effects', 'key', 'label', 'tone']);
  }
});

test('each prefecture owns three events whose at_prefecture matches', () => {
  for (const [pref, ids] of Object.entries(PREFECTURE_EVENTS)) {
    assert.equal(ids.length, 3);
    for (const id of ids) assert.equal(byId[id].when.at_prefecture, pref);
  }
});

test('at_prefecture gates events on the emperor location', () => {
  const s = createInitialState('tour-gate');
  const ev = byId.E547;
  s.stats.agriculture = 100; // 其餘條件常真
  s.stats.treasury = 500;
  const rngFixed = () => 0; // chance 0.5 通過
  assert.equal(isEligible(s, ev, rngFixed), true);
  tourTo(s, 'hedong');
  assert.equal(isEligible(s, ev, rngFixed), false);
  assert.deepEqual(tourEvents(s), PREFECTURE_EVENTS.hedong);
});

// 迷你模擬：逐月跑完，每季巡幸輪轉六府，並在所在府擇一地方事件（與主事件共用冷卻與上限）。
function runTourSim(seed, years) {
  const s = createInitialState(seed);
  const counts = {};
  const order = PREFECTURES.map((p) => p.id);
  let next = 0;
  for (let m = 0; m < years * 12; m++) {
    if (m % 3 === 0) {
      for (let k = 0; k < order.length; k++) {
        const target = order[next % order.length];
        next++;
        if (tourTo(s, target).ok) break;
      }
    }
    const rng = makeRng([seed, m, 'tour-sim']);
    const pick = tourEvents(s).map((id) => byId[id]).filter((e) => isEligible(s, e, rng) && eventAllowed(s, e.id));
    if (pick.length) {
      const e = pick[Math.floor(rng() * pick.length)];
      const option = e.options[Math.floor(rng() * e.options.length)];
      applyOption(s, option, makeRng([seed, m, 'opt']));
      afterOption(s, e, option);
      recordEvent(s, e.id);
      counts[e.id] = (counts[e.id] || 0) + 1;
    }
    monthlyTick(s, makeRng([seed, m, 'tick']));
    advanceMonth(s);
  }
  return { s, counts };
}

test('every local event is reachable while touring (200 seeds x 40 years)', () => {
  const reached = new Map(tourEventList.map((e) => [e.id, 0]));
  let maxPerRun = 0;
  for (let i = 0; i < 200; i++) {
    const { counts } = runTourSim(`tour-cov-${i}`, 40);
    for (const [id, n] of Object.entries(counts)) {
      reached.set(id, reached.get(id) + 1);
      maxPerRun = Math.max(maxPerRun, n);
    }
  }
  for (const [id, seeds] of reached) assert.ok(seeds > 0, `${id} never reachable`);
  assert.ok(maxPerRun <= EVENT_MAX_PER_RUN);
});

test('touring keeps treasury within bounds and never breaks the 8-per-run cap (200 seeds x 40 years)', () => {
  let minTreasury = Infinity;
  for (let i = 0; i < 200; i++) {
    const { s, counts } = runTourSim(`tour-bal-${i}`, 40);
    minTreasury = Math.min(minTreasury, s.stats.treasury);
    for (const n of Object.values(counts)) assert.ok(n <= EVENT_MAX_PER_RUN);
  }
  assert.ok(minTreasury >= 0);
});

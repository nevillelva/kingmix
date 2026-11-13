import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryProgress, galleryRegistry, GALLERY_CATEGORIES, NAMED_OFFICIALS, BATTLE_MILESTONES } from '../src/gallery.js';
import { LEGACY_CAP } from '../src/legacy.js';
import { createInitialState } from '../src/state.js';

const run = (i) => ({ seed: i, endReason: 'death', years: 10, finalTitle: '承續基業之主' });
const EVENTS = [{ id: 'E001', title: '甲' }, { id: 'E002', title: '乙' }];

test('empty state and empty history: nothing unlocked except none', () => {
  const p = galleryProgress({ officials: [], wars: [], eventHistory: { counts: {} } }, [], EVENTS);
  assert.equal(p.total.unlocked, 0);
  for (const c of GALLERY_CATEGORIES) assert.equal(p.categories[c].unlocked, 0);
  assert.equal(p.categories.emperor.total, LEGACY_CAP);
  assert.equal(p.categories.event.total, 2);
  assert.equal(p.categories.battle.total, BATTLE_MILESTONES.length);
  assert.equal(p.categories.official.total, NAMED_OFFICIALS.length);
});

test('missing arguments are safe', () => {
  const p = galleryProgress(undefined, undefined);
  assert.equal(p.total.unlocked, 0);
  assert.equal(p.categories.event.total, 0);
  assert.deepEqual(p.unlocked, []);
});

test('emperor entries unlock one per legacy run, capped at LEGACY_CAP', () => {
  const runs = Array.from({ length: 3 }, (_, i) => run(i));
  const p = galleryProgress({}, runs);
  assert.equal(p.categories.emperor.unlocked, 3);
  assert.deepEqual(p.unlocked.filter((e) => e.category === 'emperor').map((e) => e.slot), [1, 2, 3]);
  const many = Array.from({ length: LEGACY_CAP + 5 }, (_, i) => run(i));
  assert.equal(galleryProgress({}, many).categories.emperor.unlocked, LEGACY_CAP);
});

test('official unlocks when a named official is on the roster', () => {
  const state = createInitialState(7);
  const p = galleryProgress(state, []);
  assert.equal(p.categories.official.unlocked, NAMED_OFFICIALS.length);
  const without = { ...state, officials: state.officials.filter((o) => o.name !== '知府') };
  assert.equal(galleryProgress(without, []).categories.official.unlocked, NAMED_OFFICIALS.length - 1);
});

test('event unlocks only when its count is positive', () => {
  const state = { eventHistory: { counts: { E001: 2, E002: 0 } } };
  const p = galleryProgress(state, [], EVENTS);
  assert.equal(p.categories.event.unlocked, 1);
  assert.equal(p.unlocked.find((e) => e.category === 'event').eventId, 'E001');
});

test('battle milestones count only won battles', () => {
  const wars = [
    ...Array.from({ length: 5 }, () => ({ won: true })),
    ...Array.from({ length: 9 }, () => ({ won: false })),
  ];
  const p = galleryProgress({ wars }, []);
  assert.equal(p.categories.battle.unlocked, 2); // 1 役、5 役
  const none = galleryProgress({ wars: [{ won: false }] }, []);
  assert.equal(none.categories.battle.unlocked, 0);
});

test('total aggregates categories and unlocked list matches count', () => {
  const state = { ...createInitialState(3), eventHistory: { counts: { E001: 1 } }, wars: [{ won: true }] };
  const p = galleryProgress(state, [run(0)], EVENTS);
  const sum = GALLERY_CATEGORIES.reduce((n, c) => n + p.categories[c].unlocked, 0);
  assert.equal(p.total.unlocked, sum);
  assert.equal(p.unlocked.length, sum);
  assert.equal(p.total.total, GALLERY_CATEGORIES.reduce((n, c) => n + p.categories[c].total, 0));
});

test('galleryProgress does not mutate its inputs', () => {
  const state = { ...createInitialState(5), eventHistory: { counts: { E001: 1 } }, wars: [{ won: true }] };
  const snapshot = structuredClone(state);
  const runs = [run(1)];
  const runsSnap = structuredClone(runs);
  galleryProgress(state, runs, EVENTS);
  assert.deepEqual(state, snapshot);
  assert.deepEqual(runs, runsSnap);
});

test('registry is deterministic and has four categories', () => {
  const a = galleryRegistry(EVENTS);
  const b = galleryRegistry(EVENTS);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), [...GALLERY_CATEGORIES].sort());
});

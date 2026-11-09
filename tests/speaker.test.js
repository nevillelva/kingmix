import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { pickSpeaker } from '../src/speaker.js';

const EV = { id: 'E001', speaker: '戶部尚書' };

test('speaker is drawn from the existing officials pool and is deterministic', () => {
  const state = createInitialState('speaker-seed');
  const names = new Set(state.officials.map((o) => o.personName || o.name));
  const a = pickSpeaker(state, EV);
  const b = pickSpeaker(state, EV);
  assert.deepEqual(a, b);
  assert.equal(a.role, '戶部尚書');
  assert.ok(names.has(a.name), `${a.name} must be an official in the pool`);
  assert.ok(state.officials.some((o) => o.id === a.officialId));
});

test('same seed and same month give the same speaker; a different event may give a different one', () => {
  const s1 = createInitialState('speaker-seed');
  const s2 = createInitialState('speaker-seed');
  assert.equal(pickSpeaker(s1, EV).name, pickSpeaker(s2, EV).name);
  const seen = new Set();
  for (let i = 1; i <= 30; i++) seen.add(pickSpeaker(s1, { id: `E${i}`, speaker: '御史' }).name);
  assert.ok(seen.size > 1, 'speakers should vary across events');
});

test('speaker choice does not depend on the month only through the pool; month changes the draw', () => {
  const state = createInitialState('speaker-month');
  const picks = new Set();
  for (let m = 1; m <= 12; m++) {
    state.month = m;
    picks.add(pickSpeaker(state, EV).name);
  }
  assert.ok(picks.size > 1);
});

test('with an empty officials pool the role title is used and nothing throws', () => {
  const r = pickSpeaker({ seed: 'x', year: 1, month: 1, officials: [] }, EV);
  assert.deepEqual(r, { role: '戶部尚書', name: '戶部尚書', officialId: null });
});

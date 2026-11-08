import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { eventAllowed, recordEvent, EVENT_COOLDOWN, EVENT_MAX_PER_RUN } from '../src/events.js';

test('event respects 24-month cooldown', () => {
  const s = createInitialState('1');
  recordEvent(s, 'E001');
  assert.equal(eventAllowed(s, 'E001'), false);
  s.year += 2; // 24 個月後
  assert.equal(eventAllowed(s, 'E001'), true);
  assert.equal(EVENT_COOLDOWN, 24);
});

test('event respects per-run cap', () => {
  const s = createInitialState('1');
  for (let i = 0; i < EVENT_MAX_PER_RUN; i++) {
    recordEvent(s, 'E002');
    s.year += 3; // 跨過冷卻期
  }
  assert.equal(eventAllowed(s, 'E002'), false);
  assert.equal(eventAllowed(s, 'E003'), true);
});

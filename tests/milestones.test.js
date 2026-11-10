import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { milestoneFor, MILESTONES } from '../src/milestones.js';

const at = (year, age) => { const s = createInitialState('ms'); s.year = year; s.age = age; return s; };

test('MILESTONES thresholds are declared with ids and titles', () => {
  assert.deepEqual(MILESTONES.map((m) => m.id), ['twilight', 'prosperity', 'revival', 'accession']);
  assert.ok(MILESTONES.every((m) => typeof m.title === 'string' && m.title.length > 0));
});

test('first year of reign is 即位', () => {
  assert.deepEqual(milestoneFor(at(1, 18)), { id: 'accession', title: '即位' });
  assert.deepEqual(milestoneFor(at(5, 22)), { id: 'accession', title: '即位' });
});

test('year 6 onward is 中興', () => {
  assert.deepEqual(milestoneFor(at(6, 23)), { id: 'revival', title: '中興' });
  assert.deepEqual(milestoneFor(at(14, 31)), { id: 'revival', title: '中興' });
});

test('year 15 onward is 盛世', () => {
  assert.deepEqual(milestoneFor(at(15, 32)), { id: 'prosperity', title: '盛世' });
});

test('age 60 or above is 晚年, which takes priority over 盛世', () => {
  assert.deepEqual(milestoneFor(at(20, 60)), { id: 'twilight', title: '晚年' });
  assert.deepEqual(milestoneFor(at(3, 61)), { id: 'twilight', title: '晚年' });
});

test('age 59 in year 20 is still 盛世', () => {
  assert.deepEqual(milestoneFor(at(20, 59)), { id: 'prosperity', title: '盛世' });
});

test('milestoneFor is pure: does not mutate state', () => {
  const s = at(7, 25);
  const before = JSON.stringify(s);
  milestoneFor(s);
  assert.equal(JSON.stringify(s), before);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { posthumousTitle, buildScroll, topAxis, POSTHUMOUS } from '../src/posthumous.js';

test('each top axis maps to its 諡號 character', () => {
  const s = createInitialState('p');
  for (const [axis, { char }] of Object.entries(POSTHUMOUS)) {
    assert.equal(topAxis({ military: 0, civil: 0, benevolence: 0, legacy: 0, [axis]: 99 }), axis);
    assert.ok(['武', '文', '仁', '承'].includes(char));
  }
  assert.ok(posthumousTitle(s).name.endsWith('皇帝'));
});

test('military leader gets 武', () => {
  const s = createInitialState('p');
  s.wars = Array.from({ length: 10 }, () => ({ won: true }));
  const t = posthumousTitle(s);
  assert.equal(t.axis, 'military');
  assert.equal(t.char, '武');
  assert.equal(t.name, '武皇帝');
});

test('ties resolve deterministically in axis order', () => {
  assert.equal(topAxis({ military: 50, civil: 50, benevolence: 50, legacy: 50 }), 'military');
  assert.equal(topAxis({ military: 10, civil: 40, benevolence: 40, legacy: 40 }), 'civil');
});

test('the same state always yields the same 諡號', () => {
  const s = createInitialState('p');
  assert.deepEqual(posthumousTitle(s), posthumousTitle(s));
});

test('every axis has a non-empty Traditional Chinese epithet', () => {
  for (const { epithet } of Object.values(POSTHUMOUS)) assert.ok(epithet.length >= 4);
});

test('buildScroll lists all four axes and the posthumous name', () => {
  const s = createInitialState('p');
  const scroll = buildScroll(s);
  assert.equal(scroll.axes.length, 4);
  assert.equal(scroll.heading, `實錄・${scroll.posthumous.name}`);
  assert.ok(scroll.lines[0].includes(scroll.posthumous.char));
});

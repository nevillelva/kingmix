import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { tickHarem, familyHead, taihouOpposes, WAIJIA_THRESHOLD, TAIHOU_OPPOSE } from '../src/harem.js';

function withConsorts(seed, families) {
  const s = createInitialState(seed);
  families.forEach((family, i) => s.consorts.push({ id: `c${i + 1}`, family }));
  return s;
}

function runMonths(s, n) {
  for (let i = 0; i < n; i++) {
    tickHarem(s);
    s.turn += 1;
    s.month = (s.month % 12) + 1;
    if (s.month === 1) s.year += 1;
  }
  return s;
}

test('with no consorts the harem tick changes nothing', () => {
  const s = createInitialState('t');
  const before = JSON.stringify(s);
  tickHarem(s);
  assert.equal(JSON.stringify(s), before);
});

test('family demands are deterministic for the same seed', () => {
  const a = runMonths(withConsorts('same', ['qingliu', 'hanmen']), 60);
  const b = runMonths(withConsorts('same', ['qingliu', 'hanmen']), 60);
  assert.deepEqual(a.harem.demands, b.harem.demands);
  assert.ok(a.harem.demands.length > 0);
});

test('a family with many open demands becomes 外戚坐大 and maps to its head consort', () => {
  const s = withConsorts('waijia', ['hanmen', 'hanmen', 'hanmen']);
  runMonths(s, 120);
  assert.ok(s.harem.waijia.hanmen >= WAIJIA_THRESHOLD);
  // 家族代表為該家族最早入宮者
  assert.deepEqual(s.harem.dominant, { family: 'hanmen', consortId: 'c1' });
  assert.equal(familyHead(s, 'hanmen').id, 'c1');
});

test('太后 gains power while a family is 外戚坐大 and then opposes decisions', () => {
  const s = withConsorts('taihou', ['hanmen', 'hanmen']);
  assert.equal(taihouOpposes(s, 'heir'), false);
  runMonths(s, 400);
  assert.ok(s.harem.taihou.power >= TAIHOU_OPPOSE);
  assert.equal(taihouOpposes(s, 'heir'), true);
  assert.equal(taihouOpposes(s, 'harem'), true);
});

test('taihouOpposes rejects unknown decision kinds', () => {
  assert.throws(() => taihouOpposes(createInitialState('t'), 'war'), /unknown decision kind/);
});

test('harem never changes faction influence or stats (no 主線 side effects yet)', () => {
  const s = withConsorts('isolated', ['qingliu', 'hanmen']);
  const factions = { ...s.factions };
  const stats = { ...s.stats };
  runMonths(s, 200);
  assert.deepEqual(s.factions, factions);
  assert.deepEqual(s.stats, stats);
});

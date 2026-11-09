import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { pickSecondMemorial, SECOND_MEMORIAL_CHANCE, runSimulation } from '../src/sim.js';
import { recordEvent, EVENT_COOLDOWN, EVENT_MAX_PER_RUN } from '../src/events.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

const SEEDS = Array.from({ length: 20 }, (_, i) => `m2-${i}`);

test('第 2 則機率為 50%', () => {
  assert.equal(SECOND_MEMORIAL_CHANCE, 0.5);
});

test('第 2 則的機率閘門只用 [seed,year,month,morning2] 的第一個亂數', () => {
  // 閘門值小於 0.5 才有第 2 則；大於等於 0.5 必定沒有（與事件抽選無關）
  for (const seed of SEEDS.slice(0, 5)) {
    for (let m = 1; m <= 12; m++) {
      const s = createInitialState(seed);
      s.month = m;
      const gate = makeRng([seed, s.year, m, 'morning2'])();
      const r = pickSecondMemorial(s, events, makeRng([seed, s.year, m, 'morning2']), null);
      if (gate >= 0.5) assert.equal(r, null);
    }
  }
});

test('第 2 則與第 1 則不重複（exclude）', () => {
  // 以 exclude 指定任一合格事件，回傳結果都不得是該事件
  for (const seed of SEEDS) {
    const s = createInitialState(seed);
    const pick = pickSecondMemorial(s, events, makeRng([seed, s.year, s.month, 'morning2']), null);
    if (!pick) continue;
    const r = pickSecondMemorial(s, events, makeRng([seed, s.year, s.month, 'morning2']), pick.id);
    assert.ok(!r || r.id !== pick.id);
  }
});

test('第 2 則同樣遵守事件冷卻', () => {
  // 把所有可選事件都標為剛發生，第 2 則應一律為 null
  const s = createInitialState('cool');
  for (const e of events) recordEvent(s, e.id);
  for (const seed of SEEDS) {
    const r = pickSecondMemorial(s, events, makeRng([seed, s.year, s.month, 'morning2']), null);
    assert.equal(r, null);
  }
  assert.equal(EVENT_COOLDOWN, 24);
});

test('第 2 則遵守每局上限', () => {
  const s = createInitialState('cap');
  // 每個事件都已達每局上限
  for (const e of events) s.eventHistory = { counts: { ...(s.eventHistory?.counts || {}), [e.id]: EVENT_MAX_PER_RUN }, last: {} };
  for (const seed of SEEDS) {
    assert.equal(pickSecondMemorial(s, events, makeRng([seed, s.year, s.month, 'morning2']), null), null);
  }
});

test('600 個月模擬無錯誤（兩則奏摺皆可跑完）', () => {
  for (const seed of ['morning-600-a', 'morning-600-b']) {
    const r = runSimulation({ seed, months: 600, events });
    assert.ok(r.log.length > 0);
    assert.ok(r.month >= 1 && r.month <= 12);
    const firsts = r.log.filter((x) => !x.morning2);
    assert.ok(firsts.length >= 1);
  }
});

test('模擬中第 2 則會出現，且每月至多一則第 2 則', () => {
  const r = runSimulation({ seed: 'morning-count', months: 600, events });
  const m2 = r.log.filter((x) => x.morning2);
  assert.ok(m2.length > 0, '應有第 2 則');
  const keys = m2.map((x) => `${x.year}-${x.month}`);
  assert.equal(new Set(keys).size, keys.length);
});

test('同一 seed 的模擬決定性不變', () => {
  const a = runSimulation({ seed: 'morning-det', months: 120, events });
  const b = runSimulation({ seed: 'morning-det', months: 120, events });
  assert.deepEqual(a, b);
});

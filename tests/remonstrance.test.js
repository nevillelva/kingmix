import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { recordSharedEvent, BOND_THRESHOLD } from '../src/bonds.js';
import { applyOption, bondedRemonstrant, REMONSTRANCE_ACCEPT_LOYALTY } from '../src/turn.js';
import { isEligible, eventAllowed } from '../src/events.js';
import { chronicleLine } from '../src/chronicle.js';
import { runSimulation } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const E420 = events.find((e) => e.id === 'E420');
const ACCEPT = E420.options.find((o) => o.key === 'A');
const REJECT = E420.options.find((o) => o.key === 'B');

// 讓 id 為 o1 的朝臣解鎖君臣相得，並設定其忠誠。
function bond(state, id, loyalty) {
  for (let i = 0; i < BOND_THRESHOLD; i++) recordSharedEvent(state, id, `S${i}`);
  state.officials.find((o) => o.id === id).loyalty = loyalty;
  return state;
}

test('死諫 requires a bonded court official whose loyalty is below the gate', () => {
  const rng = makeRng(['死諫', 1]);
  const none = createInitialState('rem-none');
  assert.equal(isEligible(none, E420, rng), false, 'no bonded official');

  const high = bond(createInitialState('rem-high'), 'o1', 75);
  assert.equal(isEligible(high, E420, makeRng(['x'])), false, 'bonded but loyal enough');

  const low = bond(createInitialState('rem-low'), 'o1', 40);
  assert.equal(isEligible(low, E420, makeRng(['x'])), true);
});

test('a governor is never the subject of 死諫 even if bonded and disloyal', () => {
  const s = createInitialState('rem-gov');
  const gov = s.officials.find((o) => o.prefecture === 'jingzhao');
  for (let i = 0; i < BOND_THRESHOLD; i++) recordSharedEvent(s, gov.id, `S${i}`);
  gov.loyalty = 10;
  assert.equal(bondedRemonstrant(s), null);
  assert.equal(isEligible(s, E420, makeRng(['x'])), false);
});

test('bondedRemonstrant picks the lowest-loyalty bonded court official', () => {
  const s = bond(createInitialState('rem-pick'), 'o1', 55);
  bond(s, 'o2', 30);
  assert.equal(bondedRemonstrant(s).id, 'o2');
});

test('accepting a remonstrance raises the official loyalty and writes to the chronicle', () => {
  const s = bond(createInitialState('rem-accept'), 'o1', 40);
  applyOption(s, ACCEPT, makeRng(['a']));
  assert.equal(s.officials.find((o) => o.id === 'o1').loyalty, 40 + REMONSTRANCE_ACCEPT_LOYALTY);
  const entry = s.chronicle.at(-1);
  assert.equal(entry.kind, 'remonstrance');
  assert.equal(entry.outcome, 'accepted');
  assert.equal(chronicleLine(entry).tag, '納諫');
});

test('rejecting a remonstrance kills the official, removes him from office, and records it', () => {
  const s = bond(createInitialState('rem-reject'), 'o1', 40);
  const before = s.officials.length;
  applyOption(s, REJECT, makeRng(['r']));
  assert.equal(s.officials.length, before - 1);
  assert.ok(!s.officials.some((o) => o.id === 'o1'));
  assert.equal(s.chronicle.at(-1).outcome, 'died');
  const line = chronicleLine(s.chronicle.at(-1));
  assert.equal(line.tag, '死諫');
  assert.ok(line.text.includes('死諫'));
});

test('死諫 fires about 1–3 times per 600-month run, and never past the per-event cap', () => {
  let total = 0;
  const N = 120;
  for (let seed = 1; seed <= N; seed++) {
    const r = runSimulation({ seed: `rem-rate-${seed}`, months: 600, events });
    const n = r.triggered.E420 || 0;
    assert.ok(n <= 8, `E420 ran ${n} times in seed ${seed}`);
    total += n;
  }
  const avg = total / N;
  assert.ok(avg >= 1 && avg <= 3, `average ${avg} per run`);
});

test('the death event respects the per-run cap helper', () => {
  const s = bond(createInitialState('rem-cap'), 'o1', 40);
  s.eventHistory = { counts: { E420: 8 }, last: {} };
  assert.equal(eventAllowed(s, 'E420'), false);
});

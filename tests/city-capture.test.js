import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { ensureCity } from '../src/city.js';
import { chronicleLine } from '../src/chronicle.js';
import {
  ensureCapture, captureChance, canAttackCity, attackCity, captureStatus, captureText,
  CAPTURE_MIN, CAPTURE_MAX, CAPTURE_TREASURY, FAIL_ARMAMENT_LOSS, FAIL_MILITARY_LOSS, REBEL_MORALE,
} from '../src/city-capture.js';

const TARGET = 'hedong';

// 建立一局，將目標府設為叛亂（民心低於 REBEL_MORALE）。
function rebelState(seed) {
  const s = createInitialState(seed);
  ensureCapture(s);
  s.prefectures.find((p) => p.id === TARGET).morale = 10;
  s.prefectures.find((p) => p.id === TARGET).rebel = true; // 叛亂須經月結判定（見 siege-triggers.test.js）
  return s;
}

function withForces(s, { armament, military, defense }) {
  s.stats.armament = armament;
  s.stats.military = military;
  s.prefectures.find((p) => p.id === TARGET).defense = defense;
  return s;
}

// 在固定候選種子中找出第一個符合條件的結果（確定性：同樣的候選序列永遠得到同樣的種子）。
function findSeed(make, predicate) {
  for (let i = 0; i < 300; i++) {
    const seed = `cap-${i}`;
    const s = make(seed);
    const r = attackCity(s, TARGET);
    if (predicate(r, s)) return seed;
  }
  throw new Error('no seed satisfies predicate');
}

test('captureChance stays within 15%–85% at both extremes', () => {
  const weak = withForces(rebelState('cap-weak'), { armament: 0, military: 0, defense: 100 });
  const strong = withForces(rebelState('cap-strong'), { armament: 5000, military: 2000, defense: 0 });
  assert.equal(captureChance(weak, TARGET), CAPTURE_MIN);
  assert.equal(captureChance(strong, TARGET), CAPTURE_MAX);
  for (const [a, m, d] of [[0, 0, 0], [300, 80, 50], [800, 200, 90], [10, 500, 10]]) {
    const p = captureChance(withForces(rebelState('cap-mid'), { armament: a, military: m, defense: d }), TARGET);
    assert.ok(p >= CAPTURE_MIN && p <= CAPTURE_MAX, `chance ${p} out of range`);
  }
});

test('captureChance rises with armament and falls with garrison defense', () => {
  const base = captureChance(withForces(rebelState('cap-mono'), { armament: 300, military: 80, defense: 50 }), TARGET);
  const moreArms = captureChance(withForces(rebelState('cap-mono'), { armament: 400, military: 80, defense: 50 }), TARGET);
  const moreDef = captureChance(withForces(rebelState('cap-mono'), { armament: 300, military: 80, defense: 90 }), TARGET);
  assert.ok(moreArms > base);
  assert.ok(moreDef < base);
});

test('a prefecture that is not in rebellion cannot be attacked and the state is unchanged', () => {
  const s = createInitialState('cap-calm');
  ensureCapture(s);
  const before = JSON.stringify(s);
  const r = attackCity(s, TARGET);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_rebel');
  assert.equal(JSON.stringify(s), before);
  assert.equal(canAttackCity(s, TARGET).reason, 'not_rebel');
});

test('an unknown prefecture id is rejected', () => {
  const s = rebelState('cap-unknown');
  assert.equal(attackCity(s, 'atlantis').reason, 'unknown');
});

test('success occupies the prefecture: treasury gains, morale recovers, chronicle records it', () => {
  const seed = findSeed(
    (sd) => withForces(rebelState(sd), { armament: 1000, military: 300, defense: 50 }),
    (r) => r.won,
  );
  const s = withForces(rebelState(seed), { armament: 1000, military: 300, defense: 50 });
  const treasuryBefore = s.stats.treasury;
  const armamentBefore = s.stats.armament;
  const r = attackCity(s, TARGET);
  assert.equal(r.ok, true);
  assert.equal(r.won, true);
  assert.equal(s.stats.treasury, treasuryBefore + CAPTURE_TREASURY);
  assert.equal(s.stats.armament, armamentBefore);
  const pref = s.prefectures.find((p) => p.id === TARGET);
  assert.ok(pref.morale >= REBEL_MORALE, 'captured prefecture is no longer in rebellion');
  assert.equal(attackCity(s, TARGET).ok, false, 'a captured prefecture is not attacked again');
  assert.equal(pref.siegeYear, null);
  const entry = s.chronicle.at(-1);
  assert.equal(entry.kind, 'city_capture');
  assert.equal(entry.prefecture, TARGET);
  assert.equal(chronicleLine(entry).tag, '攻城');
  assert.match(chronicleLine(entry).text, /河東府平定/);
});

test('failure costs armament and troops, leaves the prefecture state unchanged and marks a siege', () => {
  const make = (sd) => withForces(rebelState(sd), { armament: 300, military: 80, defense: 100 });
  const seed = findSeed(make, (r) => !r.won);
  const s = make(seed);
  const pref = s.prefectures.find((p) => p.id === TARGET);
  const armament = s.stats.armament;
  const military = s.stats.military;
  const treasury = s.stats.treasury;
  const morale = pref.morale;
  const chronicleLength = s.chronicle.length;
  const r = attackCity(s, TARGET);
  assert.equal(r.won, false);
  assert.equal(s.stats.armament, armament - FAIL_ARMAMENT_LOSS);
  assert.equal(s.stats.military, military - FAIL_MILITARY_LOSS);
  assert.equal(s.stats.treasury, treasury);
  assert.equal(pref.morale, morale, 'morale of a failed attack is unchanged');
  assert.equal(s.chronicle.length, chronicleLength, 'failure is not written to the chronicle');
  assert.equal(captureStatus(s, TARGET).besieged, true);
});

test('each prefecture can be attacked at most once per year', () => {
  const seed = findSeed(
    (sd) => withForces(rebelState(sd), { armament: 300, military: 80, defense: 100 }),
    (r) => !r.won,
  );
  const s = withForces(rebelState(seed), { armament: 300, military: 80, defense: 100 });
  assert.equal(attackCity(s, TARGET).ok, true);
  const snapshot = JSON.stringify(s);
  const again = attackCity(s, TARGET);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'cooldown');
  assert.equal(JSON.stringify(s), snapshot, 'blocked attack changes nothing');
  s.month = 12;
  assert.equal(canAttackCity(s, TARGET).reason, 'cooldown', 'same year, later month is still blocked');
});

test('the annual limit resets in the next year', () => {
  const seed = findSeed(
    (sd) => withForces(rebelState(sd), { armament: 300, military: 80, defense: 100 }),
    (r) => !r.won,
  );
  const s = withForces(rebelState(seed), { armament: 300, military: 80, defense: 100 });
  attackCity(s, TARGET);
  s.year += 1;
  assert.equal(canAttackCity(s, TARGET).ok, true);
  assert.equal(captureStatus(s, TARGET).besieged, false, 'siege marker clears in the next year');
});

test('results are deterministic: the same seed and state give the same outcome', () => {
  const make = (sd) => withForces(rebelState(sd), { armament: 320, military: 90, defense: 60 });
  for (const seed of ['cap-det-a', 'cap-det-b', 'cap-det-c']) {
    const a = make(seed);
    const b = make(seed);
    const ra = attackCity(a, TARGET);
    const rb = attackCity(b, TARGET);
    assert.deepEqual(ra, rb);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  }
});

test('outcome texts are 40–80 characters', () => {
  for (const won of [true, false]) {
    const len = [...captureText('河東府', won)].length;
    assert.ok(len >= 40 && len <= 80, `length ${len} for won=${won}`);
  }
});

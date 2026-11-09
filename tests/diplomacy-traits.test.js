import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { ourStrength } from '../src/war.js';
import { startCampaign, pickTactic, reconnoiter, MAX_ROUNDS, SCOUT_POWER_BONUS } from '../src/campaign.js';
import { isEligible, hasOfficialTrait, optionOpen, isAvailable } from '../src/events.js';
import { TRAITS, getTrait } from '../src/people.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const TRAIT_IDS = new Set(TRAITS.map((t) => t.id));
const spec = (strength) => ({ strength, reward: {}, loss: {} });

// 勢均力敵的己方平均戰力（與 campaign.test.js 相同的基準）。
function evenStrength() {
  let sum = 0;
  for (let i = 0; i < 200; i++) sum += ourStrength(createInitialState(`m${i}`), makeRng(['m', i]));
  return sum / 200;
}

function campaignWin(seed, strength, scout) {
  const s = createInitialState(`scout${seed}`);
  startCampaign(s, spec(strength));
  if (scout) reconnoiter(s);
  const pick = makeRng(['scout-pick', seed]);
  for (let k = 0; k < MAX_ROUNDS; k++) {
    const res = pickTactic(s, ['assault', 'hold', 'ambush'][Math.floor(pick() * 3)]);
    if (res.finished) return res.finished.won;
  }
  throw new Error('campaign did not end');
}

test('scouting is a real modifier: the bonus is applied after reconnoiter, not before', () => {
  const s = createInitialState('scout-bonus');
  startCampaign(s, spec(200));
  const a = pickTactic(s, 'assault').round;
  const s2 = createInitialState('scout-bonus');
  startCampaign(s2, spec(200));
  reconnoiter(s2);
  const b = pickTactic(s2, 'assault').round;
  assert.ok(SCOUT_POWER_BONUS > 1);
  assert.ok(b.ours > a.ours, 'scouted round should have higher our-power');
});

test('scouting raises the campaign win rate at even and slightly stronger enemies', () => {
  const even = evenStrength();
  for (const mult of [1.0, 1.1]) {
    const N = 1500;
    let plain = 0;
    let scouted = 0;
    for (let i = 0; i < N; i++) {
      if (campaignWin(i, even * mult, false)) plain++;
      if (campaignWin(i, even * mult, true)) scouted++;
    }
    assert.ok(scouted > plain, `mult ${mult}: scouted ${scouted} should exceed plain ${plain}`);
  }
});

test('official_trait event condition is true only when a current official holds the trait', () => {
  const s = createInitialState('trait-cond');
  const rng = makeRng(['x']);
  s.officials[0].traits = ['honest'];
  for (const o of s.officials.slice(1)) o.traits = ['bold'];
  assert.equal(hasOfficialTrait(s, 'honest'), true);
  assert.equal(hasOfficialTrait(s, 'greedy'), false);
  assert.equal(isEligible(s, { id: 'T', when: { official_trait: 'honest' } }, rng), true);
  assert.equal(isEligible(s, { id: 'T', when: { official_trait: 'greedy' } }, rng), false);
});

test('option gate: an option with official_trait is open only while a holder exists', () => {
  const s = createInitialState('trait-gate');
  const gated = { key: 'C', when: { official_trait: 'honest' }, effects: {} };
  s.officials.forEach((o) => { o.traits = ['bold']; });
  assert.equal(optionOpen(s, gated), false);
  s.officials[0].traits = ['honest'];
  assert.equal(optionOpen(s, gated), true);
  assert.equal(optionOpen(s, { key: 'A', effects: {} }), true, 'options without when stay open');
  assert.equal(optionOpen(s, { key: 'X', when: { unknown_key: 1 }, effects: {} }), false, 'unknown conditions never open');
});

test('new trait-gated events reference real traits and gate their own option', () => {
  const ids = ['E901', 'E902', 'E903'];
  for (const id of ids) {
    const e = events.find((x) => x.id === id);
    assert.ok(e, `${id} must exist`);
    const gated = e.options.filter((o) => o.when);
    assert.equal(gated.length, 1, `${id} has exactly one trait-gated option`);
    const trait = gated[0].when.official_trait;
    assert.ok(TRAIT_IDS.has(trait) && getTrait(trait), `${id} gate must be a real trait`);
    assert.ok(e.options.filter((o) => !o.when).length >= 2, `${id} keeps at least two open options`);
    assert.ok(isAvailable(e));
  }
});

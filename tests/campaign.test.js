import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { ourStrength, TACTICS } from '../src/war.js';
import {
  startCampaign, pickTactic, reconnoiter, offerPeace, GRAIN_RATIO, MAX_ROUNDS,
} from '../src/campaign.js';
import { evaluateDynasty } from '../src/ending.js';
import { NEIGHBORS, diplomacyOf } from '../src/diplomacy.js';

const spec = (strength) => ({ strength, reward: { prestige: 2 }, loss: { armament: -20 } });

// 以初始狀態的己方平均戰力作為「勢均力敵」基準。
function evenStrength() {
  let sum = 0;
  for (let i = 0; i < 200; i++) sum += ourStrength(createInitialState(`m${i}`), makeRng(['m', i]));
  return sum / 200;
}

function playOut(seed, strength, pick) {
  const s = createInitialState(`c${seed}`);
  startCampaign(s, spec(strength));
  const rng = makeRng(['pick', seed]);
  for (let k = 0; k < MAX_ROUNDS; k++) {
    const res = pickTactic(s, pick(rng, k));
    if (res.finished) return { s, won: res.finished.won };
  }
  throw new Error('campaign did not end');
}

test('starting a campaign sets grain from agriculture', () => {
  const s = createInitialState('c');
  const { campaign } = startCampaign(s, spec(200));
  assert.equal(campaign.grain, Math.floor(s.stats.agriculture * GRAIN_RATIO));
  assert.equal(s.campaign.status, 'active');
});

test('each tactic consumes its grain cost', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  const before = s.campaign.grain;
  pickTactic(s, 'hold');
  assert.equal(s.campaign.grain, before - TACTICS.hold.grain);
});

test('a campaign ends within three rounds and records a war in the same shape', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  let finished = null;
  for (let k = 0; k < MAX_ROUNDS && !finished; k++) finished = pickTactic(s, 'assault').finished;
  assert.ok(finished, 'campaign should end');
  assert.equal(s.campaign, null);
  const rec = s.wars.at(-1);
  assert.equal(typeof rec.won, 'boolean');
  assert.equal(rec.strength, 200);
  assert.equal(rec.turn, s.turn);
  assert.equal(typeof rec.power, 'number');
  assert.equal(rec.mode, 'campaign');
});

test('campaign results count in the dynasty evaluation', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(1));
  for (let k = 0; k < MAX_ROUNDS; k++) if (pickTactic(s, 'hold').finished) break;
  const wins = s.wars.filter((w) => w.won).length;
  assert.equal(evaluateDynasty(s).axes.military, Math.max(0, Math.min(100, wins * 5 - (s.wars.length - wins) * 3)));
});

test('campaigns are deterministic for the same seed and choices', () => {
  const run = () => {
    const s = createInitialState('same');
    startCampaign(s, spec(190));
    const out = [];
    for (const t of ['assault', 'hold', 'ambush']) {
      if (!s.campaign) break;
      out.push(pickTactic(s, t).round);
    }
    return { out, wars: s.wars };
  };
  assert.deepEqual(run(), run());
});

test('starved grain weakens the round', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  s.campaign.grain = 0;
  const res = pickTactic(s, 'assault');
  assert.equal(res.round.starved, true);
});

test('reconnaissance is allowed once, before the first round', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  assert.equal(reconnoiter(s).ok, true);
  assert.equal(s.campaign.intel, 'scouted');
  assert.equal(reconnoiter(s).ok, false);
  pickTactic(s, 'hold');
  assert.equal(reconnoiter(s).ok, false);
});

test('an unknown tactic is rejected without consuming grain', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  const before = s.campaign.grain;
  assert.equal(pickTactic(s, 'charge').ok, false);
  assert.equal(s.campaign.grain, before);
});

test('peace talks need one round first and end the campaign deterministically', () => {
  const s = createInitialState('c');
  startCampaign(s, spec(200));
  assert.equal(offerPeace(s).ok, false);
  pickTactic(s, 'hold');
  const r = offerPeace(s, () => {});
  assert.equal(r.ok, true);
  assert.equal(s.campaign, null);
  assert.equal(s.wars.at(-1).outcome, r.finished.outcome);
  assert.ok(['peace', 'talks_failed'].includes(r.finished.outcome));
});

test('a neighbor campaign uses diplomacy and refuses allies', () => {
  const s = createInitialState('c');
  diplomacyOf(s).west.allied = true;
  assert.equal(startCampaign(s, spec(200), { neighborId: 'west' }).ok, false);
  const ok = startCampaign(s, spec(200), { neighborId: 'north' });
  assert.equal(ok.ok, true);
  assert.equal(ok.campaign.neighborId, 'north');
  assert.ok(NEIGHBORS.some((n) => n.id === 'north'));
});

test('calibration: even strength lands 55 to 70 percent for an unskilled player, strong enemy under 40', () => {
  const even = evenStrength();
  const N = 200;
  const pickRandom = (rng) => ['assault', 'hold', 'ambush'][Math.floor(rng() * 3)];
  let evenWins = 0;
  let strongWins = 0;
  for (let i = 0; i < N; i++) {
    if (playOut(i, even, pickRandom).won) evenWins++;
    if (playOut(i, even * 1.25, pickRandom).won) strongWins++;
  }
  const evenRate = evenWins / N;
  const strongRate = strongWins / N;
  assert.ok(evenRate >= 0.55 && evenRate <= 0.7, `even win rate ${evenRate}`);
  assert.ok(strongRate < 0.4, `strong win rate ${strongRate}`);
});

test('calibration: fixed tactics and the best hybrid stay within 55 to 70 percent at even strength', () => {
  const even = evenStrength();
  const N = 200;
  const tactics = ['assault', 'hold', 'ambush'];
  const rateOf = (seq, strength) => {
    let wins = 0;
    for (let i = 0; i < N; i++) if (playOut(i, strength, (_rng, k) => seq[k]).won) wins++;
    return wins / N;
  };
  for (const t of tactics) {
    const r = rateOf([t, t, t], even);
    assert.ok(r >= 0.55 && r <= 0.7, `fixed ${t} win rate ${r}`);
  }
  let best = 0;
  let bestStrong = 0;
  for (const a of tactics) for (const b of tactics) for (const c of tactics) {
    const seq = [a, b, c];
    if (a === b && b === c) continue;
    const r = rateOf(seq, even);
    if (r > best) { best = r; bestStrong = rateOf(seq, even * 1.25); }
  }
  assert.ok(best >= 0.55 && best <= 0.7, `best hybrid win rate ${best}`);
  assert.ok(bestStrong < 0.4, `best hybrid strong win rate ${bestStrong}`);
});

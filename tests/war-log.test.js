import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import {
  resolveRound,
  formatBattleLog,
  counterMultiplier,
  COUNTER,
  COUNTER_MULT,
  ENEMY_STANCES,
  TACTICS,
} from '../src/war.js';
import { startCampaign, pickTactic, MAX_ROUNDS } from '../src/campaign.js';
import { nominalStrength } from '../src/war.js';

// 依固定種子打完一場戰役，回傳 { state, finished }。
function runCampaign(seed, tactics) {
  const s = createInitialState(seed);
  startCampaign(s, { strength: nominalStrength(s) * 1.05, reward: {}, loss: {} });
  let finished = null;
  for (let k = 0; k < MAX_ROUNDS && !finished; k++) {
    finished = pickTactic(s, tactics[k % tactics.length]).finished;
  }
  return { state: s, finished };
}

test('battle log is deterministic for a fixed seed', () => {
  const a = runCampaign('log-det', ['assault', 'hold', 'ambush']);
  const b = runCampaign('log-det', ['assault', 'hold', 'ambush']);
  assert.ok(a.finished, 'campaign should finish');
  assert.deepEqual(a.finished.campaign.rounds, b.finished.campaign.rounds);
  assert.deepEqual(formatBattleLog(a.finished), formatBattleLog(b.finished));
});

test('different seeds can produce different logs', () => {
  const logs = new Set();
  for (let i = 0; i < 20; i++) {
    logs.add(JSON.stringify(runCampaign(`log-var-${i}`, ['assault']).finished.campaign.rounds));
  }
  assert.ok(logs.size > 1, 'logs should vary across seeds');
});

test('log length equals the number of rounds fought (plus one outcome line)', () => {
  for (let i = 0; i < 50; i++) {
    const { finished } = runCampaign(`log-len-${i}`, ['assault', 'ambush', 'hold']);
    const rounds = finished.campaign.rounds;
    assert.ok(rounds.length >= 1 && rounds.length <= MAX_ROUNDS);
    const lines = formatBattleLog(finished);
    assert.equal(lines.length, rounds.length + 1, `seed ${i}`);
    assert.ok(lines.at(-1).startsWith('結果：'));
  }
});

test('every stored round carries its loss and matchup fields', () => {
  const { finished } = runCampaign('log-fields', ['assault', 'hold', 'ambush']);
  for (const r of finished.campaign.rounds) {
    assert.ok(ENEMY_STANCES.includes(r.stance));
    assert.equal(r.counter, counterMultiplier(r.tactic, r.stance));
    assert.equal(typeof r.lossOurs, 'number');
    assert.equal(typeof r.lossEnemy, 'number');
    assert.equal(typeof r.line, 'string');
  }
});

test('counter table: listed matchups carry the multiplier, all others stay at 1', () => {
  for (const ours of ENEMY_STANCES) {
    for (const theirs of ENEMY_STANCES) {
      const m = counterMultiplier(ours, theirs);
      if (COUNTER[ours]?.[theirs] !== undefined) {
        assert.equal(m, COUNTER[ours][theirs]);
        assert.notEqual(m, 1);
      } else {
        assert.equal(m, 1, `${ours} vs ${theirs} should keep multiplier 1`);
      }
    }
  }
  assert.equal(counterMultiplier('assault', 'hold'), COUNTER_MULT);
  assert.equal(counterMultiplier('hold', 'ambush'), COUNTER_MULT);
  assert.equal(counterMultiplier('ambush', 'assault'), COUNTER_MULT);
});

test('counter multiplier is applied to our power in resolveRound', () => {
  const ourPower = 500;
  const enemyStrength = 400;
  // 堅守 剋 奇襲：enemyStance = ambush 時應乘上剋制倍率，同一擲骰下 ours 須精確等於 ourPower * 堅守 * 剋制。
  const countered = resolveRound({ ourPower, enemyStrength, tactic: 'hold', rng: makeRng(['cm']), enemyStance: 'ambush' });
  const plain = resolveRound({ ourPower, enemyStrength, tactic: 'hold', rng: makeRng(['cm']), enemyStance: 'hold' });
  assert.equal(countered.counter, COUNTER_MULT);
  assert.equal(plain.counter, 1);
  assert.equal(countered.ours, Math.round(ourPower * TACTICS.hold.power * COUNTER_MULT));
  assert.equal(plain.ours, Math.round(ourPower * TACTICS.hold.power));
});

test('losses follow the fixed rates: loser 10% of own power, winner 5%', () => {
  const r = resolveRound({ ourPower: 1000, enemyStrength: 100, tactic: 'assault', rng: makeRng(['loss-win']), enemyStance: 'assault' });
  assert.equal(r.won, true);
  assert.equal(r.lossOurs, Math.round(r.ours * 0.05));
  assert.equal(r.lossEnemy, Math.round(r.enemy * 0.1));
  const l = resolveRound({ ourPower: 100, enemyStrength: 1000, tactic: 'assault', rng: makeRng(['loss-lose']), enemyStance: 'assault' });
  assert.equal(l.won, false);
  assert.equal(l.lossOurs, Math.round(l.ours * 0.1));
  assert.equal(l.lossEnemy, Math.round(l.enemy * 0.05));
});

test('formatBattleLog returns Chinese text lines and does not mutate its input', () => {
  const { finished } = runCampaign('log-fmt', ['assault', 'hold']);
  const snapshot = JSON.stringify(finished);
  const lines = formatBattleLog(finished);
  assert.equal(JSON.stringify(finished), snapshot);
  assert.match(lines[0], /^第1回合：/);
  assert.ok(lines.every((l) => typeof l === 'string' && l.length > 0));
  assert.deepEqual(formatBattleLog({ rounds: [] }), []);
});

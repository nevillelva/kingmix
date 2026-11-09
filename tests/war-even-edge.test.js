import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { resolveWar, nominalStrength, evenWeight, EVEN_EDGE } from '../src/war.js';
import { startCampaign, pickTactic, MAX_ROUNDS } from '../src/campaign.js';

// 勢均力敵加成的權重：區間內為 1，區間外為 0，邊緣線性遞減。
test('evenWeight is 1 inside 0.9–1.1, 0 at or beyond the outer ramps, and continuous', () => {
  assert.equal(evenWeight(0.9), 1);
  assert.equal(evenWeight(1.0), 1);
  assert.equal(evenWeight(1.1), 1);
  assert.equal(evenWeight(0.8), 0);
  assert.equal(evenWeight(0.5), 0);
  assert.equal(evenWeight(1.2), 0);
  assert.equal(evenWeight(1.3), 0);
  assert.ok(Math.abs(evenWeight(0.85) - 0.5) < 1e-9);
  assert.ok(Math.abs(evenWeight(1.15) - 0.5) < 1e-9);
});

// 強敵區間（ratio ≥ 1.2）與加成前完全相同：同一組擲骰下，敵方有效強度不變。
test('strong enemies (ratio >= 1.3) are unaffected by the even-band edge', () => {
  for (let i = 0; i < 200; i++) {
    const s = createInitialState('strong');
    const nominal = nominalStrength(s);
    const strength = nominal * 1.3;
    const won = resolveWar(createInitialState('strong'), { strength, reward: {}, loss: {} }, makeRng(['strong', i]), () => {});
    // 以未加成的公式重算同一組擲骰，結果必須一致。
    const rng = makeRng(['strong', i]);
    const power = nominal * (0.8 + rng() * 0.4) * 1;
    const enemy = strength * (1 + (rng() * 2 - 1) * 0.3);
    assert.equal(won, power >= enemy, `draw ${i} changed for a strong enemy`);
  }
});

// 單調性：固定擲骰下，敵強度愈高愈不可能獲勝，跨越勢均力敵區間邊界時亦然。
test('even-band edge keeps the monotone property across the band boundaries', () => {
  const s0 = createInitialState('edge');
  const nominal = nominalStrength(s0);
  for (let i = 0; i < 100; i++) {
    let prevWon = true;
    for (let r = 0.7; r <= 1.4; r += 0.01) {
      const won = resolveWar(createInitialState('edge'), { strength: nominal * r, reward: {}, loss: {} }, makeRng(['edge', i]), () => {});
      assert.ok(!(won && !prevWon), `draw ${i}: win reappeared at ratio ${r.toFixed(2)}`);
      prevWon = won;
    }
  }
});

test('the edge is a small, bounded player advantage', () => {
  assert.ok(EVEN_EDGE > 0 && EVEN_EDGE <= 0.1);
});

// 戰役結算也記錄 ratio，定義與事件戰爭相同（敵方基準強度 ÷ 己方名目戰力）。
test('campaign wars record the same nominal ratio as event wars', () => {
  const s = createInitialState('camp-ratio');
  startCampaign(s, { strength: 260, reward: {}, loss: {} });
  let finished = null;
  for (let k = 0; k < MAX_ROUNDS && !finished; k++) finished = pickTactic(s, 'assault').finished;
  assert.ok(finished, 'campaign should end');
  const rec = s.wars.at(-1);
  assert.equal(rec.mode, 'campaign');
  assert.equal(rec.ratio, Math.round((260 / nominalStrength(createInitialState('camp-ratio'))) * 1000) / 1000);
});

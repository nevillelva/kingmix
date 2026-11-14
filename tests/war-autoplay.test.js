import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { serializeSave } from '../src/save.js';
import { startCampaign, pickTactic } from '../src/campaign.js';
import {
  BATTLE_TICK_MS, battleTickMs, nextBattleSpeed, defaultBattlePrefs, normalizeBattlePrefs,
  battleFrames, battleTally, visibleRoundCount,
} from '../src/war-autoplay.js';

function playCampaign(seed) {
  const s = createInitialState(seed);
  const r = startCampaign(s, { strength: 120, reward: {}, loss: {}, title: '測試' });
  assert.equal(r.ok, true, '戰役應可開始');
  const campaign = r.campaign; // 戰役結束後 state.campaign 會清空，故保留參照
  const tactics = ['assault', 'hold', 'ambush'];
  for (let i = 0; i < 10 && s.campaign?.status === 'active'; i++) {
    pickTactic(s, tactics[i % 3]);
  }
  return { state: s, campaign };
}

test('間隔計算：1× 為基準間隔，2× 為一半；非法速度回退為 1×', () => {
  assert.equal(battleTickMs(1), BATTLE_TICK_MS);
  assert.equal(battleTickMs(2), BATTLE_TICK_MS / 2);
  assert.equal(battleTickMs(3), BATTLE_TICK_MS);
  assert.equal(battleTickMs(undefined), BATTLE_TICK_MS);
  assert.equal(nextBattleSpeed(1), 2);
  assert.equal(nextBattleSpeed(2), 1);
});

test('偏好正規化：預設為關閉與 1×，非法值回退', () => {
  assert.deepEqual(defaultBattlePrefs(), { auto: false, speed: 1 });
  assert.deepEqual(normalizeBattlePrefs({ auto: true, speed: 2 }), { auto: true, speed: 2 });
  assert.deepEqual(normalizeBattlePrefs({ auto: 'yes', speed: 5 }), { auto: false, speed: 1 });
  assert.deepEqual(normalizeBattlePrefs(null), { auto: false, speed: 1 });
});

test('回合序列與結算一致：勝負、兵力與戰役計數完全相同', () => {
  const { campaign: c } = playCampaign('autoplay-seq');
  const rounds = c.rounds;
  assert.ok(rounds.length > 0, '應有回合');
  const frames = battleFrames(rounds);
  assert.equal(frames.length, rounds.length);
  frames.forEach((f, i) => {
    assert.equal(f.won, rounds[i].won);
    assert.equal(f.ours, rounds[i].ours);
    assert.equal(f.enemy, rounds[i].enemy);
    assert.equal(f.round, rounds[i].round);
    assert.equal(f.oursPct + f.enemyPct, rounds[i].ours + rounds[i].enemy > 0 ? 100 : 0);
  });
  const tally = battleTally(rounds);
  assert.equal(tally.ourWins, c.ourWins);
  assert.equal(tally.enemyWins, c.enemyWins);
});

test('同 seed 重播：回合序列與既有結算逐項相同（不另行擲骰）', () => {
  const a = playCampaign('autoplay-same').campaign;
  const b = playCampaign('autoplay-same').campaign;
  assert.deepEqual(battleFrames(a.rounds), battleFrames(b.rounds));
  assert.deepEqual(a.rounds, b.rounds);
});

test('自動戰鬥開啟時直接顯示全部回合；關閉時依已播放數顯示', () => {
  assert.equal(visibleRoundCount({ auto: true }, 3, 0), 3);
  assert.equal(visibleRoundCount({ auto: false }, 3, 1), 1);
  assert.equal(visibleRoundCount({ auto: false }, 3, 9), 3);
});

test('偏好不進入存檔：存檔序列化不含偏好欄位，且偏好不寫入 state', () => {
  const { state: s } = playCampaign('autoplay-save');
  const before = JSON.stringify(serializeSave(s, { now: () => 0 }));
  // 模擬介面偏好變更：偏好只存在 UI 狀態物件，不應碰觸 state
  const prefs = normalizeBattlePrefs({ auto: true, speed: 2 });
  assert.equal('battlePrefs' in s, false);
  assert.equal('auto' in s, false);
  assert.equal('speed' in s, false);
  assert.equal(JSON.stringify(serializeSave(s, { now: () => 0 })), before);
  assert.equal(prefs.auto, true);
  assert.ok(!before.includes('battlePrefs'));
  assert.ok(!before.includes('"auto"'));
});

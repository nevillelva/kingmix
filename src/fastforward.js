// 快進（階段 B）：連續推進數月時，遇到需要玩家決定的情況就停下。
// 這裡只判斷「該不該停」，不改變任何數值；推進本身仍走既有的每月流程。

export const FF_THRESHOLDS = Object.freeze({
  treasury: 30,   // 國庫低於此值：財政危機，停
  people: 30,     // 民心低於此值：民變風險，停
  power: 20,      // 皇權低於此值：權臣逼宮風險，停
});

// 回傳停下的原因字串；回傳 null 表示可以繼續快進。
// 奏摺本身不停：快進期間由系統代為批閱（見 autoDecideMemorial，下一個 PR）。
export function fastForwardPause(state) {
  if (!state.alive) return 'death';
  if (state.campaign?.status === 'active') return 'campaign';
  if (state.dongchang?.cases?.some((c) => c.status === 'leverage')) return 'leverage';
  const s = state.stats || {};
  if (s.treasury < FF_THRESHOLDS.treasury) return 'treasury';
  if (s.people < FF_THRESHOLDS.people) return 'people';
  if (s.power < FF_THRESHOLDS.power) return 'power';
  return null;
}

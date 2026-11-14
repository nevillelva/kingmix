// 快進（階段 B）：連續推進數月時，遇到需要玩家決定的情況就停下。
// 這裡只判斷「該不該停」，不改變任何數值；推進本身仍走既有的每月流程。

export const FF_THRESHOLDS = Object.freeze({
  treasury: 30,   // 國庫低於此值：財政危機，停
  people: 30,     // 民心低於此值：民變風險，停
  power: 20,      // 皇權低於此值：權臣逼宮風險，停
});

// 「稍後處理」：玩家在東廠把柄停下時選擇暫緩。案件改為 deferred（不再是 leverage），
// 因此不會再觸發快進停下、也不會擋住奏摺（web 端以 status === 'leverage' 判斷待決案件）；
// 案件仍計入進行中案數。快進結束後呼叫 flushDeferredLeverage 還原為 leverage 並交由玩家處置。
export const DEFERRED_STATUS = 'deferred';

// 回傳 true 表示已暫緩；僅 status 為 leverage 的案件可暫緩，其餘回傳 false 且不改動狀態。
export function deferLeverage(state, leverageId) {
  const c = state.dongchang?.cases?.find((x) => x.id === leverageId);
  if (!c || c.status !== 'leverage') return false;
  c.status = DEFERRED_STATUS;
  c.deferredTurn = state.turn;
  return true;
}

// 快進結束時呼叫：所有暫緩中的把柄還原為 leverage，回傳這些案件（供介面顯示待處置）。
export function flushDeferredLeverage(state) {
  const out = [];
  for (const c of state.dongchang?.cases ?? []) {
    if (c.status !== DEFERRED_STATUS) continue;
    c.status = 'leverage';
    delete c.deferredTurn;
    out.push(c);
  }
  return out;
}

// 回傳停下的原因字串；回傳 null 表示可以繼續快進。
// 奏摺本身不停：快進期間由系統代為批閱（見 autoDecideMemorial，下一個 PR）。
export function fastForwardPause(state) {
  if (!state.alive) return 'death';
  if (state.campaign?.status === 'active') return 'campaign';
  // 僅 leverage 會停；暫緩中的把柄（deferred）不停
  if (state.dongchang?.cases?.some((c) => c.status === 'leverage')) return 'leverage';
  const s = state.stats || {};
  if (s.treasury < FF_THRESHOLDS.treasury) return 'treasury';
  if (s.people < FF_THRESHOLDS.people) return 'people';
  if (s.power < FF_THRESHOLDS.power) return 'power';
  return null;
}

// 快進佇列：快進開始時，所有待決把柄先暫緩入列，不停下；快進結束後再統一交由玩家處置。
// 回傳本次入列的案件數。
export function queuePendingLeverage(state) {
  let n = 0;
  for (const c of state.dongchang?.cases ?? []) {
    if (c.status === 'leverage' && deferLeverage(state, c.id)) n++;
  }
  return n;
}

// 連續推進至多 months 個月（僅此處決定快進何時停）。
// - 快進開始時既有的待決把柄全部入列，不觸發停下。
// - 快進途中新出現的把柄：第一件停下交由玩家裁決或稍後處理；之後出現的把柄入列，不再停。
// - 入列（含稍後處理）的案件在本次快進內不會再停下，快進結束時一併還原為待決並回傳。
// advance(state) 負責推進一個月（由呼叫端提供，保持既有每月流程不變）。
// 回傳 { done, reason, back }：done 為實際完成月數，reason 為停下原因（null 表示跑完）。
export function runFastForward(state, months, advance) {
  queuePendingLeverage(state);
  let pausedForCase = false;
  let reason = null;
  let done = 0;
  for (; done < months; done++) {
    reason = fastForwardPause(state);
    if (reason === 'leverage' && pausedForCase) {
      queuePendingLeverage(state);
      reason = fastForwardPause(state);
    }
    if (reason === 'leverage') pausedForCase = true;
    if (reason) break;
    advance(state);
  }
  const back = flushDeferredLeverage(state);
  return { done, reason, back };
}

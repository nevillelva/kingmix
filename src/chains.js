// 連鎖後續事件：選項的 effects.chain 指定一個事件 id，該事件於下一個月優先觸發。
// 合約：
//   - 觸發時不檢查 when 條件與冷卻（cooldown），但仍需 isAvailable、每局上限，且東廠有待處置把柄時略過（見 sim.js）。
//   - 佇列存於 state.pendingChain（陣列，預設 []，懶建立；舊存檔相容）。
//   - 每月至多取出一則；同月多則時，其餘順延至之後月份。

export function scheduleChain(state, eventId) {
  if (typeof eventId !== 'string' || eventId === '') throw new Error('chain requires an event id string');
  if (!Array.isArray(state.pendingChain)) state.pendingChain = [];
  state.pendingChain.push(eventId);
  return state;
}

// 取出下一則待觸發的連鎖事件 id；無則回傳 null。
export function takeChain(state) {
  if (!Array.isArray(state.pendingChain) || state.pendingChain.length === 0) return null;
  return state.pendingChain.shift();
}

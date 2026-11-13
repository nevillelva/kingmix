// 存檔版本與衝突判定（純模組：不讀寫 localStorage、不發出網路請求）
//
// 每次寫入本機存檔前以 stampSave 蓋上版本：saveVersion 單調遞增，savedAt 為毫秒時間戳。
// 載入時以 resolveConflict 比較本機與雲端兩份存檔：版本號大者為新；版本號相同則比 savedAt。
// 只要兩份存檔不相同（版本、時間戳或內容任一不同），needsPrompt 即為 true，由玩家確認。

const versionOf = s => (s && Number.isFinite(s.saveVersion) ? s.saveVersion : 0);
const savedAtOf = s => (s && Number.isFinite(s.savedAt) ? s.savedAt : 0);

// 為 state 蓋上版本戳記，回傳同一物件。nowMs 為毫秒時間戳（Date.now() 或測試注入值）。
export function stampSave(state, nowMs) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('stampSave: state must be an object');
  }
  if (!Number.isFinite(nowMs)) throw new TypeError('stampSave: nowMs must be a finite number');
  state.saveVersion = versionOf(state) + 1;
  state.savedAt = nowMs;
  return state;
}

// 比較本機與雲端存檔。回傳 { winner: 'local' | 'remote' | 'same', reason, needsPrompt }。
// 缺少一方時不需確認：有的一方即為勝者（reason 為 no_remote / no_local），兩方皆無為 none。
export function resolveConflict(local, remote) {
  const hasLocal = local !== null && local !== undefined;
  const hasRemote = remote !== null && remote !== undefined;
  if (!hasLocal && !hasRemote) return { winner: 'same', reason: 'none', needsPrompt: false };
  if (!hasRemote) return { winner: 'local', reason: 'no_remote', needsPrompt: false };
  if (!hasLocal) return { winner: 'remote', reason: 'no_local', needsPrompt: false };

  const lv = versionOf(local), rv = versionOf(remote);
  if (lv !== rv) {
    return { winner: lv > rv ? 'local' : 'remote', reason: 'newer_version', needsPrompt: true };
  }

  const la = savedAtOf(local), ra = savedAtOf(remote);
  if (la !== ra) {
    return { winner: la > ra ? 'local' : 'remote', reason: 'newer_savedAt', needsPrompt: true };
  }

  // 版本與時間戳皆相同：內容一致即為同一份存檔，否則為分岔，預設以本機為勝者但需玩家確認。
  if (JSON.stringify(local) === JSON.stringify(remote)) {
    return { winner: 'same', reason: 'identical', needsPrompt: false };
  }
  return { winner: 'local', reason: 'fork_same_stamp', needsPrompt: true };
}

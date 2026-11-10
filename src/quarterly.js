// 季度結算（階段 B）：純函式模組，不做 I/O、不改動任何狀態。

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 取出 state.stats 的數值複本（只保留數字欄位）。
export function snapshotStats(state) {
  const out = {};
  const stats = state && state.stats;
  if (!stats || typeof stats !== 'object') return out;
  for (const [key, value] of Object.entries(stats)) {
    if (isNum(value)) out[key] = value;
  }
  return out;
}

// 月份 (1..12) 對應的季度 (1..4)。
export function quarterOf(year, month) {
  return Math.floor((month - 1) / 3) + 1;
}

// snapshots: 一季內每月月底的 stats 快照（依時間順序）。
// 某快照缺少的 key 視為「與前一次相同」，因此沿用上一個已知值。
export function summarizeQuarter(snapshots, year, month) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;

  const first = {};
  const last = {};
  for (const snap of snapshots) {
    if (!snap || typeof snap !== 'object') continue;
    for (const [key, value] of Object.entries(snap)) {
      if (!isNum(value)) continue;
      if (!(key in first)) first[key] = value;
      last[key] = value;
    }
  }

  const keys = Object.keys(first);
  const start = {};
  const end = {};
  const delta = {};
  for (const key of keys) {
    start[key] = first[key];
    end[key] = last[key];
    delta[key] = last[key] - first[key];
  }

  let biggestDrop = null;
  let biggestGain = null;
  for (const key of keys) {
    const d = delta[key];
    if (d < 0 && (biggestDrop === null || d < biggestDrop.amount)) {
      biggestDrop = { key, amount: d };
    }
    if (d > 0 && (biggestGain === null || d > biggestGain.amount)) {
      biggestGain = { key, amount: d };
    }
  }

  return {
    year,
    quarter: quarterOf(year, month),
    start,
    end,
    delta,
    biggestDrop,
    biggestGain,
  };
}

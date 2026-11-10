// 跨局史冊：純函式，記錄每局結算摘要並彙整統計。不寫入狀態、不接入 UI。
import { evaluateDynasty } from './ending.js';

export const LEGACY_CAP = 50;

// 追加一局摘要，回傳新陣列；超過上限時丟棄最舊的紀錄。
export function recordRun(history, summary) {
  const base = Array.isArray(history) ? history : [];
  const next = [...base, { ...summary }];
  return next.length > LEGACY_CAP ? next.slice(next.length - LEGACY_CAP) : next;
}

// 彙整史冊：空陣列時回傳安全預設值。
export function summarizeLegacy(history) {
  const runs = Array.isArray(history) ? history : [];
  const endReasonCounts = {};
  let yearSum = 0;
  let yearCount = 0;
  let bestTitle = null;
  for (const r of runs) {
    if (r.endReason != null) {
      endReasonCounts[r.endReason] = (endReasonCounts[r.endReason] || 0) + 1;
    }
    if (Number.isFinite(r.years)) {
      yearSum += r.years;
      yearCount += 1;
    }
    if (r.finalTitle != null && bestTitle === null) bestTitle = r.finalTitle;
  }
  return {
    runs: runs.length,
    avgYears: yearCount ? Math.round((yearSum / yearCount) * 10) / 10 : 0,
    endReasonCounts,
    bestTitle,
  };
}

// 由已結束的遊戲狀態建立一局摘要（只讀既有欄位：seed、endReason、year、dynasty.generation/ended，稱號來自 evaluateDynasty）。
export function legacyFromState(state) {
  const { title } = evaluateDynasty(state);
  return {
    seed: state.seed,
    mode: null,
    endReason: state.endReason,
    years: state.year,
    finalTitle: title,
    generations: state.dynasty.generation,
    dynastyEnded: state.dynasty.ended,
  };
}

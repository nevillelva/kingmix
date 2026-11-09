// 邸報：年終一頁的年度回顧。資料取自 state.annals（年終考評）與 state.chronicle（同年紀事）。
// 不依賴 undefined 欄位；缺資料時回傳空的 lines 與 annal 為 null。

import { chronicleLine } from './chronicle.js';

const DELTA_KEYS = ['treasury', 'people', 'military', 'agriculture'];

// 同年的紀事：改元、皇子夭折、刺殺以 year 記；世代紀錄以 endedInYear 記。
export function yearChronicle(state, year) {
  return (state.chronicle || [])
    .filter((c) => c && (c.year ?? c.endedInYear) === year)
    .map((c) => chronicleLine(c));
}

export function buildGazette(state, year) {
  const annals = state.annals || [];
  const idx = annals.findIndex((a) => a.year === year);
  const annal = idx >= 0 ? annals[idx] : null;
  const prev = idx > 0 ? annals[idx - 1] : null;
  const deltas = {};
  if (annal) {
    for (const k of DELTA_KEYS) {
      deltas[k] = prev ? Math.round(annal[k] - prev[k]) : null;
    }
  }
  const lines = yearChronicle(state, year);
  return {
    year,
    generation: annal ? annal.generation : state.dynasty.generation,
    annal,
    deltas,
    lines,
    empty: !annal && lines.length === 0,
  };
}

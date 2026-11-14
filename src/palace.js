// 宮城圖資料：紅點（待辦）與季節（宮城圖配樂/美術用）。純讀取，不改動狀態。
import { FACILITY_IDS, FACILITIES, FACILITY_MAX_LEVEL, facilityLevels, constructionOf } from './facilities.js';

// 紅點：回傳有待辦的宮殿建築 [{ buildingId, reason }]。
// reason: 'completed'（工期已完成，待確認）、'affordable'（國庫足夠且可升下一級）。
export function pendingMarks(state) {
  const marks = [];
  const levels = facilityLevels(state);
  const building = constructionOf(state);
  for (const id of FACILITY_IDS) {
    if (state.facilityDone?.[id]) {
      marks.push({ buildingId: id, reason: 'completed' });
      continue;
    }
    if (building[id]) continue;
    const level = levels[id];
    if (level >= FACILITY_MAX_LEVEL) continue;
    if (state.stats.treasury >= FACILITIES[id].levels[level].cost) {
      marks.push({ buildingId: id, reason: 'affordable' });
    }
  }
  return marks;
}

// 確認完成紅點（回傳新狀態）。
export function acknowledgeMark(state, buildingId) {
  if (!state.facilityDone?.[buildingId]) return state;
  const next = structuredClone(state);
  delete next.facilityDone[buildingId];
  return next;
}

const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

// 季節：1–3 月春、4–6 月夏、7–9 月秋、10–12 月冬。
export function seasonFor(state) {
  const m = state.month;
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`invalid month: ${m}`);
  return SEASONS[Math.floor((m - 1) / 3)];
}

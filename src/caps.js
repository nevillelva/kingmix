// 無上限陣列的容量控管（M2）。超過上限時丟棄最舊的紀錄，只保留最近 max 筆。
// 注意：史冊（chronicle）刻意不設上限，不在此處使用。

export const WARNINGS_CAP = 200; // state.warnings：數值越界警告
export const DIPLOMACY_LOG_CAP = 200; // state.diplomacyLog：外交路線紀錄

// 追加一筆並就地修剪至 max 筆，回傳同一陣列。
export function pushCapped(arr, item, max) {
  arr.push(item);
  return trimCapped(arr, max);
}

// 就地修剪至最近 max 筆，回傳同一陣列（供既有陣列在批次寫入後統一收斂）。
export function trimCapped(arr, max) {
  if (arr.length > max) arr.splice(0, arr.length - max);
  return arr;
}

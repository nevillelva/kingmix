// 皇子卡的病況顯示（僅介面）。病況來源為引擎 succession.js 的 tickHeirs：heir.ill 為剩餘月數，
// 無病況時該欄位不存在或為 0。回傳空字串表示不顯示。

export function illnessLabel(heir) {
  const left = Math.floor(Number(heir && heir.ill));
  if (!Number.isFinite(left) || left <= 0) return '';
  return `染疾中（剩餘 ${left} 月）`;
}

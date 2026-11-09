// 選項效果的顯示：只呈現「方向＋大小（小／中／大）」，不列精確數字。
// 資料與引擎仍使用精確數值（events.json 不變）；大小由顯示時依下表換算。
// 各屬性的門檻約為其選項數值的四分位，使多數選項落在「中」。
// 門檻表：[小的上限, 中的上限]；絕對值 ≤ 小 → 小；≤ 中 → 中；其餘為大。

export const SIZE_THRESHOLDS = Object.freeze({
  treasury: [30, 60],
  agriculture: [10, 20],
  benevolence: [3, 5],
  people: [5, 10],
  armament: [10, 30],
  charm: [3, 6],
  health: [3, 5],
  military: [3, 5],
  official_loyalty_add: [3, 6],
  power: [3, 5],
  heaven: [3, 4],
  commerce: [5, 15],
  prestige: [2, 3],
  literature: [3, 6],
});

const DEFAULT_THRESHOLDS = [2, 5];

export const SIZE_LABELS = Object.freeze(['小', '中', '大']);

// 回傳 '小' | '中' | '大'；數值為 0 或非數值時回傳 null（不顯示）。
export function effectSize(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null;
  const [small, mid] = SIZE_THRESHOLDS[key] ?? DEFAULT_THRESHOLDS;
  const m = Math.abs(value);
  if (m <= small) return SIZE_LABELS[0];
  if (m <= mid) return SIZE_LABELS[1];
  return SIZE_LABELS[2];
}

// 單一效果的顯示文字，例如「國庫▼大」、「仁德▲小」。方向：正為 ▲，負為 ▼。
export function effectChipText(key, value, label) {
  const size = effectSize(key, value);
  if (!size) return null;
  const arrow = value > 0 ? '▲' : '▼';
  return `${label} ${arrow}${size}`;
}

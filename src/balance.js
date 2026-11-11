// 集中的數值平衡參數（Phase A）。各模組自此處匯入，數值須與原先的字面值完全相同。
// 對照表與目標見 docs/design/balance-table.md。
export const BALANCE = Object.freeze({
  CIVIL_DIVISOR: 18, // 文治軸除數：文治 = 文學 / 18 + 招募人數 × 2（ending.js）
  LEGACY_WEIGHT: 1.15, // 傳承軸權重（ending.js）
  EVEN_EDGE: 0.08, // 勢均力敵的戰前刺探加成上限（war.js）
  REPAIR_COST: 20, // 修繕城池的國庫成本（city.js）
  ALLIANCE_MIN_ATTITUDE: 50, // 結盟好感門檻（diplomacy.js）
  CHILD_MORTALITY: Object.freeze([0.012, 0.005, 0.0025, 0.0012, 0.0006]), // 0–4 歲幼子月死亡率（succession.js）
  BOND_THRESHOLD: 2, // 君臣相得所需共歷事件數（bonds.js）
});

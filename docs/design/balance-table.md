# 平衡參數對照表（Phase A）

所有集中參數定義於 `src/balance.js`（`BALANCE`，凍結物件）。各模組原本的導出名稱保留，改由 `BALANCE` 取值，數值與原先字面值完全相同。

稽核：`node scripts/audit-balance.js 20 600` 在 base 與本分支輸出 **完全相同**。

| 參數 | 值 | 模組 | 目標 / 說明 |
|---|---|---|---|
| CIVIL_DIVISOR（文治除數） | 18 | `ending.js`（原為字面值） | 文治 = 文學 / 除數 + 招募人數 × 2；校準稱號分布 |
| LEGACY_WEIGHT（承續權重） | 1.15 | `ending.js`（原為字面值） | 傳承軸加權，校準稱號分布 |
| EVEN_EDGE（勢均力敵邊界） | 0.08 | `war.js`（`EVEN_EDGE`） | 戰前刺探加成上限；ratio 0.9–1.1 內全額生效 |
| REPAIR_COST（修繕成本） | 20 | `city.js`（`REPAIR_COST`） | 國庫成本，城防偏低時修繕 |
| ALLIANCE_MIN_ATTITUDE（結盟門檻） | 50 | `diplomacy.js`（`ALLIANCE_MIN_ATTITUDE`） | 好感漂移中心為 50，結盟需中立以上；60 時 200 局僅 2 次結盟，改 50 後約 55 次 |
| CHILD_MORTALITY（幼子月死亡率） | [0.012, 0.005, 0.0025, 0.0012, 0.0006] | `succession.js`（`CHILD_MORTALITY`） | 0–4 歲，暫定待模擬校準 |
| BOND_THRESHOLD（君臣相得門檻） | 2 | `bonds.js`（`BOND_THRESHOLD`） | 同一官員共歷事件數，解鎖君臣相得 |

## 玩家策略 profile（`src/strategy.js`）

`runSimulation({ ..., choose })` 新增選用參數 `choose(options, ctx)`。省略、或回傳 `null` 時退回預設的種子隨機選擇，預設路徑不變（稽核輸出相同）。

| profile | 規則 |
|---|---|
| default | 不傳 `choose`，即現行種子隨機選擇 |
| greedy | 取國庫效果最大且為正的選項，無正向者退回預設 |
| tyrant | 取仁德 + 民心效果為負、負值最大的選項，無負向者退回預設 |

測試：`tests/strategy.test.js`，每個 profile 以 6 個種子（`strategy-0`…`strategy-5`）各跑 120 個月，檢驗完整結束且 endReason 合法。

### endReason 分布（6 種子 × 120 月）

| profile | alive | death | abdicated | assassinated |
|---|---|---|---|---|
| default | 6 | 0 | 0 | 0 |
| greedy | 6 | 0 | 0 | 0 |
| tyrant | 6 | 0 | 0 | 0 |

120 個月內三種 profile 皆無人駕崩或退位。策略確實改變選擇（6 局中 greedy 與 tyrant 皆與預設的選擇序列不同），但在此時長下未影響存續。

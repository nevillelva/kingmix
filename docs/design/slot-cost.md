# 時段行動成本（slot cost）

## 規則
- 午後（三選一）與夜間（二選一）的每個選項，選擇時消耗行動次數（預設 1）。
- 每月行動上限 `ACTION_LIMIT = 2`，與 `web/index.html` 的同名常數相同（兩處須同步）。
- 可選條件：已用行動 + 該選項成本 ≤ 上限。已用滿則該時段不可選，直到下個月。
- 夜間「休息」（不選）永遠不耗行動。

## 引擎（已實作，`src/slots.js`）
- `SLOT_COST_ENABLED = true`：總開關。設為 `false` 時 `slotCost` 恆為 0，回到舊版「僅為分頁捷徑」行為。
- `slotCost(slotName, choiceKey)`：回傳整數成本；未知時段或選項為 0。
- `PERIOD_QUOTA = { afternoon: 1, night: 1 }`：各時段每月可消耗的行動上限，合計等於 `ACTION_LIMIT`。
- `ensureAgency(state)`：本月行動桶 `state.agency = { key, used, periods }`，跨月重建；`prepareMonth` 於月初呼叫。
- `canTakeSlot(state, slotName, usedActions)`：純函式。同時受總額與時段配額限制；`state.alive === false` 或未知時段為不可選。
- `spendSlot(state, slotName, choiceKey)`：通過檢查才記帳（總額與時段用量同時增加）。網頁 `onSlot` 經此函式記帳。
- 早朝奏摺順序：`src/ministry-order.js` 的 `orderMorningPair`，於 `prepareMonth` 內套用。
- schema v2：`agency` 欄位；`save.js` 的 `migrateState` 補上舊存檔缺少的 `periods`。
- 測試：`tests/slot-cost.test.js`、`tests/time-slots.test.js`。

## 對模擬的影響
- `src/sim.js` 與 `scripts/audit-balance.js` 目前不建模時段成本，因此稽核數字不變。
- 若日後要讓模擬評估取捨，需由 sim.js 呼叫 `canTakeSlot`，屆時須重新跑平衡稽核。

## 網頁接線（`web/ui/render-actions.js`）
- `agency()` 改為呼叫引擎的 `ensureAgency`，不另存一套行動桶。
- `slotsCard()` 對 `canTakeSlot` 為假的選項加上 `disabled`；本時段配額用盡時顯示提示。
- `onSlot(e)` 經 `spendSlot` 記帳，通過才 `save()`。

## 尚未完成
- 朝政行動（`useAction`）目前不歸屬任何時段，仍只受總額限制；是否應歸入午後，待方案定案。
- 無頭模擬（`src/sim.js`）未建模時段配額與六部順序，因此平衡稽核數字不變；若要評估取捨，需由 sim 呼叫 `spendSlot` 並重新稽核。

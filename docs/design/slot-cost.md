# 時段行動成本（slot cost）

## 規則
- 午後（三選一）與夜間（二選一）的每個選項，選擇時消耗行動次數（預設 1）。
- 每月行動上限 `ACTION_LIMIT = 2`，與 `web/index.html` 的同名常數相同（兩處須同步）。
- 可選條件：已用行動 + 該選項成本 ≤ 上限。已用滿則該時段不可選，直到下個月。
- 夜間「休息」（不選）永遠不耗行動。

## 引擎（本分支已實作，`src/slots.js`）
- `SLOT_COST_ENABLED = true`：總開關。設為 `false` 時 `slotCost` 恆為 0，回到舊版「僅為分頁捷徑」行為。
- `slotCost(slotName, choiceKey)`：回傳整數成本；未知時段或選項為 0。
- `canTakeSlot(state, slotName, usedActions)`：純函式。`state.alive === false` 或未知時段為不可選。
- 測試：`tests/slot-cost.test.js`。

## 對模擬的影響
- `src/sim.js` 與 `scripts/audit-balance.js` 目前不建模時段成本，因此稽核數字不變。
- 若日後要讓模擬評估取捨，需由 sim.js 呼叫 `canTakeSlot`，屆時須重新跑平衡稽核。

## 後續（未實作，須於 `web/index.html` 進行）
1. `slotsCard()` 中，對 `canTakeSlot(state, k, agency().used)` 為假的選項加上 `disabled`，並顯示剩餘行動提示。
2. `onSlot(e)` 點擊時先檢查 `canTakeSlot`，通過後以 `agency().used += slotCost(k, id)` 記錄行動並 `save()`。
3. 同月內的 `agency()` 狀態已依年月分桶，無需另外重置。
4. 更新 `src/slots.js` 的檔頭註解（目前寫「不改引擎」，須改為描述成本規則）。
5. 補上 UI 層測試（`tests/wiring.test.js` 類型的靜態檢查）。

# 雲端存檔設計

狀態：設計草案，附功能旗標 stub（`src/cloud.js`，`CLOUD_ENABLED = false`）。未接入 `web/index.html`。

## 1. 問題診斷

- 目前只有一個本機槽位：`localStorage['kingmix-save-v1']`（見 `web/index.html` 的 `save()` / `load()`）。
- 換裝置、清除網站資料、無痕視窗都會遺失進度。
- 程式碼中已有一條未加旗標的雲端路徑（`initCloud()`、`cloudPush()`，使用 `window.claude.use('db')` 與 `'user'`，寫入 `data/users/<uid>/save`），但它存在以下問題：
  - 每次 `save()` 都寫入雲端，沒有衝突偵測。
  - 寫入格式是 `{ savedAt: Date.now(), seed, state }`（數字時間戳，無 `version`），與 `src/save.js` v2 格式（`savedAt` 為 ISO 字串、含 `version: 2`）不一致。
  - 雲端失敗時只是靜默吞掉錯誤，沒有明確的回退狀態。

## 2. 方案比較

| 方案 | 優點 | 缺點 |
|---|---|---|
| A. Artifact `db` capability（claude.ai 執行環境） | 不需自建後端；已有 `db` 與 `user` 介面的程式碼 | 只在 claude.ai artifact 執行環境中可用；獨立網頁版無法使用；資料由平台保存，依賴其配額與可用性 |
| B. 使用者帳號 + 自建後端 | 跨平台；可自行控制格式、配額與衝突處理 | 需要帳號系統、後端、資料庫與隱私合規，工作量大；目前專案沒有後端 |
| C. 只保留 localStorage | 零成本、無隱私風險 | 無法解決換裝置遺失的問題 |

## 3. 建議

**短期採用 C 作為永遠存在的基底，並以 A 作為可選的同步層，全部置於功能旗標之後。**

- `localStorage` 永遠是主存檔；雲端只做備援與跨裝置同步，絕不取代本機存檔。
- 方案 B 暫不做，等確定有多平台需求再評估。
- 旗標 `CLOUD_ENABLED` 預設 `false`。啟用前，現有未加旗標的 `cloudPush()` 路徑應改由 `src/cloud.js` 統一管理，並改用 v2 格式。

## 4. 資料格式

- 直接沿用 `src/save.js` 的 v2 包裝：`{ version: 2, savedAt: <ISO 字串>, seed, state }`。
- 雲端只寫入上述 JSON 字串，`cloudPut(key, text)` 的 `text` 即 `exportSave(state)` 的輸出。
- 讀取時一律透過 `parseSave()`，舊格式（v1、數字時間戳）由既有遷移邏輯處理。
- 雲端鍵名沿用 `kingmix-save-v1`，版本升級時才改名。

## 5. 衝突策略

- 基本規則：以 `savedAt` 做 last-write-wins。
- 每台裝置記錄上次成功同步的 `savedAt`（`lastSyncedSavedAt`，存於 localStorage，只是本機偏好）。
- 開啟遊戲時比較本機與雲端：
  1. 內容相同（`savedAt` 與 `seed` 相同）：不動作。
  2. 只有一邊較新，且另一邊等於 `lastSyncedSavedAt`：採用較新的一邊，無需提示。
  3. 兩邊都自上次同步後有變動（已分岔）：兩份都保留，顯示兩份的 `savedAt`、在位年月等摘要，由玩家選擇；不自動覆蓋任一份。
- 任何衝突解決後，兩邊都寫入同一份結果，並更新 `lastSyncedSavedAt`。

## 6. 隱私

- 雲端只儲存存檔 JSON（`seed` 與 `state`），不含玩家姓名、電子郵件、IP、裝置識別碼、分析事件或瀏覽紀錄。
- 雲端鍵由平台提供的匿名使用者 id 決定，本專案不另外取得或保存任何個人資料。
- 遊戲不需要登入即可使用；雲端功能僅在平台提供 `db` 與 `user` 能力時才啟用。
- 刪除：提供清除雲端存檔的操作，並與本機清除一併執行。

## 7. 回退原則

- 雲端不可用（旗標關閉、無 capability、逾時、回傳錯誤）時，遊戲照常以本機存檔運作，不顯示阻斷性錯誤。
- 本機存檔的寫入永遠先於雲端寫入；雲端寫入失敗不影響本機結果。
- `cloudPut` / `cloudGet` 回傳 `{ ok: false, error }`，呼叫端只據此顯示「雲端暫不可用」之類的狀態，不重試迴圈。

## 8. 後續工作（不在本次範圍）

1. 將 `web/index.html` 中未加旗標的 `cloudPush()` / `initCloud()` 移到 `src/cloud.js`，改用 v2 格式。
2. 實作 `cloudPut` / `cloudGet` 的 `db` 後端，並加入逾時與錯誤分類。
3. 實作第 5 節的衝突比較與選擇介面。
4. 在 `web/index.html` 接入並以旗標控制。

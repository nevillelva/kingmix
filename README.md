# kingmix — 皇帝養成綜合版

設計規格見 [docs/specs/](docs/specs/README.md)，那裡是權威來源。

## Phase 1：核心骨架

- `src/rng.js`：確定性隨機（同一種子、同一回合，結果必定相同）
- `src/state.js`：狀態與數值邊界；越界會截斷並記錄警告
- `src/events.js`：事件資格判斷
- `src/turn.js`：套用選項、每月結算、推進時間
- `src/sim.js`：無頭模擬
- `data/events.json`：首批事件（來自 `docs/specs/events-batch1.md`）

## 指令

```bash
npm test                 # 執行測試
npm run sim -- demo 10   # 以種子 demo 模擬 10 年，輸出 JSON 摘要
```

## 目前刻意留到後續階段的內容

- 東廠、皇子、太傅（E004 選項 B、E008 整個事件）：Phase 2 / Phase 4
- 外戚坐大（E010）：需要聲色成長機制（後宮系統），Phase 2 啟用
- 每回合三個時段（晨/午/夜）：Phase 1 目前一個月只處理一則奏摺
- 數值公式與上限為暫定，待模擬校準

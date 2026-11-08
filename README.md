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

## 開發工具

### Claude Code skills（來自 obra/superpowers）

`.claude/skills/` 內含 [obra/superpowers](https://github.com/obra/superpowers) 的 15 個 skill，
來源 commit `22f0b46`（v7.0.2），MIT 授權，見 `.claude/skills/ATTRIBUTION.md`。
**未引入**該外掛的 SessionStart hook；skill 依需要載入。

### CodeGraph（程式碼知識圖）

`@colbymchenry/codegraph@1.6.2` 以 devDependency 鎖定版本。`.mcp.json` 設定 MCP 伺服器，
並以 `--no-telemetry`、`DO_NOT_TRACK=1`、`CODEGRAPH_NO_UPDATE_CHECK=1` 關閉遙測與更新檢查。

- 首次使用：`npm install` 後執行 `./node_modules/.bin/codegraph init -y` 建立本地索引
- 索引存於 `.codegraph/`，已列入 `.gitignore`，不會被提交
- 重新索引：`./node_modules/.bin/codegraph status` 可查看狀態

## Phase 2：人事與權謀

- `src/officials.js`：官員、能力、派系、需求檢查
- `src/offices.js`：官職需求與任命
- `src/dongchang.js`：東廠調查、把柄、處置
- 規格與延後項目見 [docs/specs/phase2-court.md](docs/specs/phase2-court.md)

## Phase 3：國策、外交與戰爭

- `src/policy.js`：四種施政流派與每月修正
- `src/war.js`：決策制戰爭
- 規格與延後項目見 [docs/specs/phase3-economy-war.md](docs/specs/phase3-economy-war.md)

## Phase 4 & 5：後宮、傳承、結局與內容

- `src/succession.js`：皇子繼位、先帝遺產衰減、王朝結束
- `src/ending.js`：多軸結局評價
- 40 條事件（`data/events.json`）
- 規格與校準紀錄見 [docs/specs/phase4-5-dynasty.md](docs/specs/phase4-5-dynasty.md)

## 可玩介面（web/）

- `web/index.html`：單頁、手機優先，分頁為朝堂、朝臣、後宮、東廠、帝王
- 發布為 Artifact 時，`src/` 與 `data/` 需一併上傳到同層；本機預覽可在 `web/` 內建立指向 `../src`、`../data` 的符號連結後以靜態伺服器開啟
- 進度存於 localStorage（僅限本瀏覽器），同一種子與同一月份會得到相同奏摺

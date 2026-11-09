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

- `web/index.html`：單頁、手機優先。主畫面為宮城平面圖，點選殿宇進入朝堂（太和殿）、朝臣與任免（校場）、後宮與慈寧宮、東廠、帝王（御書房）
- 發布為 Artifact 時，`src/` 與 `data/` 需一併上傳到同層；本機預覽可在 `web/` 內建立指向 `../src`、`../data` 的符號連結後以靜態伺服器開啟
- 進度存於 localStorage（僅限本瀏覽器），同一種子與同一月份會得到相同奏摺

### 時段介面對照（gap-ui-slots，僅介面）

- 早朝：沿用既有奏摺卡（引擎目前每月一則，方案所述 1–2 則尚未實作）。奏摺選項可左右滑動選取（`wireMemorialSwipe`），點擊仍立即裁決，並附「上一項／下一項／裁決所選」按鈕作為備援。
- 午後（`SLOTS.afternoon`）：二選一，召見大臣 → 朝臣分頁；校閱軍務 → 朝政行動的外交面板。「幸御花園」已由夜間「後宮」涵蓋，故不重複列出。
- 夜間（`SLOTS.night`，設定於 `src/slots.js`）：二選一，後宮 → 後宮分頁；東廠密報 → 東廠分頁。「休息」不是卡片選項：未選即為「本夜不採取行動」，不耗行動、不產生效果、不改狀態。
- 時段選項不消耗每月兩次朝政行動，也不寫入存檔；引擎尚無時段概念，待 Phase 3 時段規格定案後再接入。
- 午後：依方案規格改為二選一（`SLOTS.afternoon.pick`）。去除的選項為「幸御花園」，理由是與夜間「後宮」同一去處；若方案另有指定，改 `src/slots.js` 即可。
- 夜間：採最佳建議改為真正二選一（後宮、東廠密報）；「休息」改為隱含預設，見上。
- 即位國策：開局表單可選 1–2 條（`setAccessionPolicies`）。第一條為主策，沿用既有換策與逼迫規則；第二條為輔策，月修正以 0.1 折算（已以無頭模擬校準，見 `tests/` 與 PR 紀錄；0.5 會使承續軸稱號跌破 15%）。僅選一條與舊行為相同。
- 開科取士（`src/exam.js`）：朝政行動，每 24 個月一次，耗一次行動，招募 1–2 名進士（走 `generateOfficial`，獨立 RNG 路徑）。
- 暴政量表顯示於「帝王」頁。刺殺（`src/assassination.js`）：暴政逾 40、前朝遺臣（王朝更替後）、朝堂江湖（強勢派系與低忠官員）三種來源，每月至多一起；結果記入史記，有對應奏摺者以事件 E401–E412 呈現。
- 官員卡顯示忠誠安全線：本派勢力需達 33 + 野心/2，忠誠才不每月流失（與 `turn.js` 忠誠漂移式一致）。
- 新年年號覆蓋層（`showNewYear`）：每局每年一月第一次進入時顯示，點擊或 Esc 關閉；減少動態偏好下不做動畫。年號名稱待定，`NIAN_HAO` 未設定時顯示「新歲」。

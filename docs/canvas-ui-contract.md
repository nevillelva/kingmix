# Canvas 介面契約（feat/canvas-ui）

全部介面改為 Canvas 2D 繪製，引擎（src/）不動。功能一項都不能少：web/ui/ 每個既有畫面、按鈕、對話框、快進、戰役、存檔都要有對應的 Canvas 版本。

## 檔案所有權（避免衝突）
- A 基礎與入口：web/ui/canvas/core.js、web/ui/canvas/input.js、web/ui/canvas/widgets.js、web/ui/canvas/theme.js、web/ui/main.js、web/index.html、render-nav.js、render-start.js、render-ending（renderEnding）、state-io.js、store.js、render-bus.js
- B 宮城與后宮：render-palace.js、render-map.js、map-svg.js、render-side.js、render-facility.js、web/ui/canvas/palace.js、web/ui/canvas/harem.js（選秀納妃接 src/harem.js）
- C 朝政與奏摺：render-court.js、render-memorial.js、render-actions.js、render-pressure.js、event-pool.js、game-flow.js（僅事件流程）、web/ui/canvas/court.js
- D 人事與情報：render-officials.js、render-relations.js、render-ruler.js、render-curriculum.js、render-cards.js、web/ui/canvas/people.js
- E 戰役與紀錄：render-campaign.js、render-legacy.js、render-gallery.js、render-quarter.js、unlock-store.js、overlays.js、dialog.js、audio.js、fx.js、web/ui/canvas/campaign.js

## 共用 API（A 提供，其他人只呼叫，不改簽名）
```js
// web/ui/canvas/core.js
export const C = { canvas, ctx, W, H, dpr, U, T, scroll, contentH, content }
//   ctx：2D 上下文；U：單位縮放；T：動畫秒數；content：本幀內容區（扣除頂欄與底欄）
export function registerScreen(name, drawFn)      // drawFn(C) 每幀呼叫；未登記之畫面不繪製內容
export function setScreen(name) / currentScreen()
export function currentState()                    // 回傳 U.state（唯讀）
export function registerChrome(layout, draw)      // 頂欄與底欄（render-nav.js 登記）
export function registerOverlay(fn)               // fn(C) 每幀於頂底欄之後繪製（如奇遇）
export function registerPreModal(fn)              // fn(C) 每幀於 takeModal() 之前呼叫（dialog.js 登記 drawDialogs）
export function pushToast(msg, ms)                // 浮動短訊（widgets 的 toast(msg) 即呼叫此函式）
export function setScroll(v)

// web/ui/canvas/input.js
export function hit(rect, onClick, opts)          // 本幀註冊可點區域
export function modal(drawFn, onClose)           // 疊加對話框；點背景觸發 onClose

// web/ui/canvas/widgets.js（依賴 core；core 不得 import widgets 或 dialog，以免循環）
export function button(x, y, w, h, label, onClick, opts)
export function panel(x, y, w, h, opts)           // 紅漆金邊面板（theme）
export function bar(x, y, w, h, v, max, color)
export function text(str, x, y, opts)             // 自動換行、字型
export function measureLines(str, maxW, size, weight)
export function portrait(x, y, w, h, p)           // 人物頭像
export function toast(msg)

// web/ui/dialog.js（E）
export function openCanvasDialog(spec)            // 堆疊式對話框；回傳 close()
export function drawDialogs()                     // 由 core 經 registerPreModal 於 takeModal 前呼叫

// web/ui/fx.js（E）
export function drawFx(C)                         // 蓋章、雪景、墨跡；由 core.drawFrame 於 takeModal 前呼叫

// web/ui/audio.js（E）
export function drawSoundToggle(C, x, y, w, h)   // 頂欄音效鈕（render-nav 使用）

// web/ui/render-campaign.js（E）
export function drawLastBattleCard(C, x, y, w)   // 上一役戰報卡；回傳高度（無戰報為 0）
export function lastBattleCardH(C)               // 同版面公式之高度，供朝堂項目先排版
```

### drawFrame 順序（core.js，不可更動）
背景與邊框 → 內容區（裁切＋捲動，呼叫目前畫面的 drawFn(C)）→ 頂底欄 → 全域覆蓋層 → `drawFx(C)` → 各 preModal（drawDialogs）→ `takeModal()` 之對話框 → 短訊。
`drawFx` 與 `drawDialogs` 必須在 `takeModal()` 之前，否則對話框與蓋章不會顯示。

## 規則
1. 引擎函式只能從 src/ 呼叫，不得在 Canvas 模組內複製規則；數值顯示一律讀 state。
2. 點擊與狀態變更只能透過既有的 game-flow.js 函式（chooseOption、finishMonth、chooseDC…），與舊介面行為一致。
3. 每個畫面要有與舊版相同的功能清單（依原檔案逐一對應），並在 PR 本文列出對照表。
4. 測試：node --test 必須全數通過；新增 Canvas 模組至少有一支煙霧測試（stub canvas，點遍所有 hit 區域不得拋錯）。
5. 不得消耗既有亂數流；不得修改 src/ 的數值。

## 勘誤
- 事件資料位於 data/events.json（由 web/ui/event-pool.js 讀入），原契約的 web/ui/events-data.js 不存在，已移除。
- 所有代理待 A 推送 feat/canvas-a 後再對齊之約定已完成：feat/canvas-ui 基底為 feat/canvas-a，並已合併 feat/canvas-d、feat/canvas-e。

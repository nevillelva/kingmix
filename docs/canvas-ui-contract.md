# Canvas 介面契約（feat/canvas-ui）

全部介面改為 Canvas 2D 繪製，引擎（src/）不動。功能一項都不能少：web/ui/ 每個既有畫面、按鈕、對話框、快進、戰役、存檔都要有對應的 Canvas 版本。

## 檔案所有權（避免衝突）
- A 基礎與入口：web/ui/canvas/core.js、web/ui/canvas/input.js、web/ui/canvas/widgets.js、web/ui/canvas/theme.js、web/ui/main.js、web/index.html、render-nav.js、render-start.js、render-ending（renderEnding）、state-io.js、store.js、render-bus.js
- B 宮城與后宮：render-palace.js、render-map.js、map-svg.js、render-side.js、render-facility.js、web/ui/canvas/palace.js、web/ui/canvas/harem.js（選秀納妃接 src/harem.js）
- C 朝政與奏摺：render-court.js、render-memorial.js、render-actions.js、render-pressure.js、event-pool.js、events-data.js、game-flow.js（僅事件流程）、web/ui/canvas/court.js
- D 人事與情報：render-officials.js、render-relations.js、render-ruler.js、render-curriculum.js、render-cards.js、web/ui/canvas/people.js
- E 戰役與紀錄：render-campaign.js、render-legacy.js、render-gallery.js、render-quarter.js、unlock-store.js、overlays.js、dialog.js、audio.js、fx.js、web/ui/canvas/campaign.js

## 共用 API（A 提供，其他人只呼叫，不改簽名）
```js
// core.js
export const C = { ctx, W, H, dpr, U, T }          // 畫布與縮放、動畫時間
export function registerScreen(name, drawFn)       // drawFn(ui) 每幀呼叫
export function setScreen(name)
export function currentState()                     // 回傳 U.state
// input.js
export function hit(rect, onClick, opts)           // 本幀註冊可點區域；opts: {disabled, hover}
export function modal(drawFn, onClose)            // 疊加對話框，點空白處關閉
// widgets.js
export function button(x,y,w,h,label,onClick,opts)
export function panel(x,y,w,h,opts)                // 紅漆金邊面板（theme）
export function bar(x,y,w,h,v,max,color)
export function portrait(x,y,w,h,person)           // 人物頭像（沿用 v2 的 person()）
export function text(str,x,y,opts)                 // 自動換行、字型
export function toast(msg)
```

## 規則
1. 引擎函式只能從 src/ 呼叫，不得在 Canvas 模組內複製規則；數值顯示一律讀 state。
2. 點擊與狀態變更只能透過既有的 game-flow.js 函式（chooseOption、finishMonth、chooseDC…），與舊介面行為一致。
3. 每個畫面要有與舊版相同的功能清單（依原檔案逐一對應），並在 PR 本文列出對照表。
4. 測試：node --test 必須全數通過；新增 Canvas 模組至少有一支煙霧測試（stub canvas，點遍所有 hit 區域不得拋錯）。
5. 不得消耗既有亂數流；不得修改 src/ 的數值。

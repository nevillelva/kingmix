// web/ui/canvas/input.js：本幀可點區域（hit）與疊加對話框（modal）的登記與判定。葉節點，不 import 任何模組。
// 流程：core 每幀 beginFrame() → 畫面以 hit() 登記 → endFrame() 發布為「上一幀的命中表」→ 指標事件以發布表判定。
// 座標一律為螢幕邏輯像素；內容區捲動時由 core 以 setView({dy}) 告知位移，hit() 自動換算。

const view = { dy: 0, clip: null };
let cur = { screen: [], modal: [], modalClose: null };
let pub = { screen: [], modal: [], modalClose: null, hasModal: false };
let modalReq = null;
let drawingModal = false;

export const pointer = { x: -1, y: -1 };

const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function beginFrame() {
  cur = { screen: [], modal: [], modalClose: null };
  modalReq = null;
  drawingModal = false;
  view.dy = 0;
  view.clip = null;
}

// 設定目前繪製區的位移（dy，內容捲動時為負值）與可見裁切區（clip，螢幕座標；null 表示不裁切）。
export function setView({ dy = 0, clip = null } = {}) {
  view.dy = dy;
  view.clip = clip;
}

// 登記可點區域。rect 為繪製時的座標（已含捲動）；opts: { disabled, why, hover }。
// disabled 時點擊不呼叫 onClick，改回傳 why 供 core 以提示顯示。
export function hit(rect, onClick, opts = {}) {
  const r = { x: rect.x, y: rect.y + view.dy, w: rect.w, h: rect.h, fn: onClick, disabled: !!opts.disabled, why: opts.why || '' };
  if (view.clip && !intersects(r, view.clip)) return;
  (drawingModal ? cur.modal : cur.screen).push(r);
}

// 指標是否位於（繪製座標的）矩形內，供按鈕顯示懸停效果。
export function hovered(x, y, w, h) {
  return pointer.x >= x && pointer.x <= x + w && pointer.y >= y + view.dy && pointer.y <= y + view.dy + h;
}

// 要求於本幀畫疊加對話框。畫面每幀重新呼叫即可保持開啟；關閉由呼叫端於 onClose 內改狀態。
// 點擊對話框外（未被任何 hit 吃掉）或按 Esc 時呼叫 onClose。
export function modal(drawFn, onClose) {
  modalReq = { drawFn, onClose };
}

// core 於畫完一般畫面後呼叫：取出對話框請求（無則回傳 null）。
export function takeModal() {
  drawingModal = !!modalReq;
  return modalReq;
}

export function leaveModal() {
  drawingModal = false;
  cur.modalClose = modalReq ? modalReq.onClose : null;
}

export function endFrame() {
  pub = { screen: cur.screen, modal: cur.modal, modalClose: cur.modalClose, hasModal: !!modalReq };
}

// 指標點擊判定。回傳 { handled, why }：why 為停用鈕的提示文字（由 core 顯示 toast）。
export function dispatchPoint(x, y) {
  const list = pub.hasModal ? pub.modal : pub.screen;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (!inside(r, x, y)) continue;
    if (r.disabled) return { handled: true, why: r.why || '目前無法執行' };
    if (r.fn) r.fn();
    return { handled: true, why: '' };
  }
  if (pub.hasModal && pub.modalClose) { pub.modalClose(); return { handled: true, why: '' }; }
  return { handled: false, why: '' };
}

export function isHitAt(x, y) {
  const list = pub.hasModal ? pub.modal : pub.screen;
  return list.some(r => inside(r, x, y) && !r.disabled);
}

export function closeModal() {
  if (pub.hasModal && pub.modalClose) pub.modalClose();
}

// 測試與除錯用：目前已發布的命中表（唯讀副本）。
export function publishedHits() {
  return [...pub.modal, ...pub.screen].map(({ x, y, w, h, disabled }) => ({ x, y, w, h, disabled }));
}

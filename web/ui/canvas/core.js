// web/ui/canvas/core.js：Canvas 2D 介面核心（畫布、縮放、畫面登記、每幀繪製、指標與捲動）。
// 依賴：theme.js（樣式）、input.js（命中表）、store.js（U.state）。不得 import widgets.js（widgets 反向依賴本檔）。
import { drawFrameBorder, INK, PAPER, GOLD, font } from './theme.js';
import { beginFrame, endFrame, setView, takeModal, leaveModal, dispatchPoint, closeModal, isHitAt, pointer, beginPress, dragPress, endPress } from './input.js';
import { U } from '../store.js';

// 共用繪製狀態。畫面函式以 drawFn(C) 呼叫；C.ctx 為 2D 上下文，C.U 為單位縮放，C.T 為動畫秒數。
export const C = {
  canvas: null,
  ctx: null,
  W: 0,
  H: 0,
  dpr: 1,
  U: 1,
  T: 0,
  scroll: 0,      // 內容區捲動量（像素，≥0）
  contentH: 0,    // 畫面回報的內容總高度（由畫面於繪製時設定）
  content: { x: 0, y: 0, w: 0, h: 0 }, // 本幀內容區（扣除頂欄與底欄後）
};

const screens = new Map();
let curName = null;
let chrome = null; // { layout(C) -> {top, bottom}, draw(C) }
const overlays = []; // 全域覆蓋層（奇遇、新年、季報等）：每幀於頂底欄之後繪製，不論目前畫面為何
const toasts = [];
let lastFrameTs = 0;

export function registerScreen(name, drawFn) { screens.set(name, drawFn); }

export function setScreen(name) {
  if (name !== curName) { curName = name; C.scroll = 0; }
}

export function currentScreen() { return curName; }

// 回傳目前的遊戲狀態（唯讀使用；變更請走 game-flow.js）。
export function currentState() { return U.state; }

// 頂欄與底欄（render-nav.js 註冊）。layout 回傳兩者高度；draw 於內容區之後繪製並登記其命中。
export function registerChrome(layout, draw) { chrome = { layout, draw }; }

// 登記全域覆蓋層：fn(C) 每幀呼叫，自行判斷是否需要繪製（不需要時不畫、不登記命中）。
export function registerOverlay(fn) { overlays.push(fn); }

export function pushToast(msg, ms = 2600) {
  if (!msg) return;
  toasts.push({ msg: String(msg), life: ms / 1000 });
  if (toasts.length > 3) toasts.shift();
}

export function setScroll(v) {
  const max = Math.max(0, C.contentH - C.content.h);
  C.scroll = Math.max(0, Math.min(max, v));
}

// 依視窗尺寸設定畫布（邏輯像素 W×H，實際像素乘 dpr）。
export function resizeCanvas(W, H, dpr = 1) {
  C.W = W; C.H = H; C.dpr = dpr;
  C.U = Math.max(0.85, Math.min(1.4, Math.min(W / 420, H / 760)));
  if (C.canvas) { C.canvas.width = Math.round(W * dpr); C.canvas.height = Math.round(H * dpr); }
}

// 繪製一幀：背景與邊框 → 內容（裁切＋捲動）→ 頂底欄 → 對話框 → 提示。
export function drawFrame(ts = 0) {
  const ctx = C.ctx;
  if (!ctx) return;
  const dt = lastFrameTs ? Math.min(0.1, (ts - lastFrameTs) / 1000) : 0;
  lastFrameTs = ts;
  C.T += dt;
  const { W, H, dpr } = C;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  beginFrame();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  drawFrameBorder(ctx, W, H, C.U);

  const ch = chrome ? chrome.layout(C) : { top: 0, bottom: 0 };
  const content = { x: 0, y: ch.top, w: W, h: Math.max(0, H - ch.top - ch.bottom) };
  C.content = content;

  // 內容區：裁切後以 scroll 位移繪製；命中表的 dy 同步為 -scroll。
  setView({ dy: -C.scroll, clip: content });
  ctx.save();
  ctx.beginPath();
  ctx.rect(content.x, content.y, content.w, content.h);
  ctx.clip();
  ctx.translate(0, -C.scroll);
  C.contentH = 0;
  const fn = screens.get(curName);
  if (fn) fn(C);
  else drawPlaceholder(ctx, content, curName);
  ctx.restore();
  setScroll(C.scroll);

  // 頂欄與底欄：不捲動、不裁切。
  setView({ dy: 0, clip: null });
  if (chrome) chrome.draw(C);
  for (const fn of overlays) { setView({ dy: 0, clip: null }); fn(C); }

  // 對話框（疊加於一切之上）。
  const req = takeModal();
  if (req) {
    ctx.fillStyle = 'rgba(20,8,6,.55)';
    ctx.fillRect(0, 0, W, H);
    setView({ dy: 0, clip: null });
    req.drawFn(C);
    leaveModal();
  }

  drawToasts(ctx, dt);
  endFrame();
  if (C.canvas) C.canvas.style.cursor = isHitAt(pointer.x, pointer.y) ? 'pointer' : 'default';
}

function drawPlaceholder(ctx, r, name) {
  ctx.fillStyle = INK;
  ctx.font = font(16 * C.U, '');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`「${name || '—'}」畫面尚未移植至 Canvas`, r.x + r.w / 2, r.y + r.h / 2);
}

function drawToasts(ctx, dt) {
  for (let i = toasts.length - 1; i >= 0; i--) if ((toasts[i].life -= dt) <= 0) toasts.splice(i, 1);
  toasts.forEach((t, i) => {
    const px = 15 * C.U;
    ctx.font = font(px, 'bold');
    const w = Math.min(C.W * 0.9, ctx.measureText(t.msg).width + 28 * C.U);
    const h = px * 2.2;
    const x = (C.W - w) / 2, y = C.H - h - 16 * C.U - i * (h + 8 * C.U);
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.fillStyle = 'rgba(31,26,23,.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.fillStyle = PAPER; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.msg, C.W / 2, y + h / 2);
    ctx.globalAlpha = 1;
  });
}

// 綁定畫布：縮放、指標（點擊與拖曳捲動）、滾輪、Esc 關閉對話框，並啟動 requestAnimationFrame 迴圈。
export function initCanvas(canvas, win = globalThis) {
  C.canvas = canvas;
  C.ctx = canvas.getContext('2d');
  const size = () => resizeCanvas(win.innerWidth || 800, win.innerHeight || 600, Math.min(2, win.devicePixelRatio || 1));
  size();
  win.addEventListener && win.addEventListener('resize', size);

  const toLocal = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let down = null;
  canvas.addEventListener('pointerdown', e => {
    const p = toLocal(e); pointer.x = p.x; pointer.y = p.y;
    beginPress(p.x, p.y);
    down = { x: p.x, y: p.y, lx: p.x, ly: p.y, sy: C.scroll, moved: false, dir: null };
  });
  canvas.addEventListener('pointermove', e => {
    const p = toLocal(e); pointer.x = p.x; pointer.y = p.y;
    if (!down) return;
    const dxAll = p.x - down.x, dyAll = p.y - down.y;
    if (!down.dir && (Math.abs(dxAll) > 6 || Math.abs(dyAll) > 6)) {
      down.dir = Math.abs(dxAll) > Math.abs(dyAll) ? 'h' : 'v';
      down.moved = true;
    }
    if (down.dir === 'h') {
      dragPress(p.x - down.lx);
    } else if (down.dir === 'v') {
      setScroll(down.sy - dyAll);
    }
    down.lx = p.x; down.ly = p.y;
  });
  const up = e => {
    const p = toLocal(e); pointer.x = p.x; pointer.y = p.y;
    const d = down; down = null;
    endPress();
    if (!d || d.moved) return;
    const res = dispatchPoint(p.x, p.y);
    if (res.why) pushToast(res.why);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('wheel', e => { setScroll(C.scroll + e.deltaY); e.preventDefault && e.preventDefault(); }, { passive: false });
  win.addEventListener && win.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  const loop = ts => { drawFrame(ts); (win.requestAnimationFrame || (f => setTimeout(() => f(Date.now()), 16)))(loop); };
  (win.requestAnimationFrame || (f => setTimeout(() => f(Date.now()), 16)))(loop);
}

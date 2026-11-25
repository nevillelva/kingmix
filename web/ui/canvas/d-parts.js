// web/ui/canvas/d-parts.js：D 負責畫面（朝臣、東廠、帝王、課表、策卡）的共用版面小工具。
// 內容以「區塊」（block）描述，stack(…, draw=false) 只量測高度、draw=true 才繪製；兩者共用同一套排版，
// 因此卡片底框可於繪製前依內容高度決定，量測與繪製不會不一致。
// 依賴 widgets.js（text／button／bar／panel）與 input.js（hit）；不含任何遊戲規則。
import { C } from './core.js';
import { hit } from './input.js';
import { button, panel, bar, text, measureLines } from './widgets.js';
import { GOLD, INK, LAC_TEXT } from './theme.js';
import { U } from '../store.js';

export const pad = () => 14 * C.U;
export const gapOf = () => 8 * C.U;
const lineStep = (size) => size * 1.45;

// 內容區的左右邊界（扣除外框 12U 與留白）與起始 y（自內容區頂端起算）。
export function contentBox() {
  const m = 22 * C.U;
  return { x: m, w: C.W - 2 * m, y: C.content.y + pad() };
}

export function textH(str, maxW, size, weight = '') {
  return measureLines(String(str), maxW, size, weight).length * lineStep(size);
}

// 區塊：
//   { t:'title', s, color? }          標題（粗體）
//   { t:'text', s, size?, color?, align? }
//   { t:'kv', k, v, color? }          左右對齊的一行（k 左、v 右）
//   { t:'bar', v, max, color?, h? }   條狀量表
//   { t:'btns', items:[{label,onClick,off?,why?,sub?}] }   按鈕流（自動換行）
//   { t:'gap', h? }                   留白
//   { t:'custom', h, fn(x,y,w) }      自訂繪製（圖表、雷達、徽章）；h 為事先量好的高度
export function stack(x, y, w, blocks, draw = true, tone = INK) {
  let cy = y;
  for (const b of blocks || []) {
    if (!b) continue;
    cy += block(x, cy, w, b, draw, tone);
  }
  return cy - y;
}

function block(x, y, w, b, draw, tone) {
  const U_ = C.U, gap = 4 * U_;
  switch (b.t) {
    case 'title': {
      const size = 16 * U_;
      const color = b.color ?? (tone === LAC_TEXT ? GOLD : '#7a1a1a');
      const h = draw ? text(b.s, x, y, { size, weight: 'bold', color, maxW: w }) : textH(b.s, w, size, 'bold');
      return h + 6 * U_;
    }
    case 'text': {
      const size = b.size ?? 14 * U_;
      const color = b.color ?? tone;
      const h = draw ? text(b.s, x, y, { size, color, maxW: w, align: b.align || 'left' }) : textH(b.s, w, size);
      return h + gap;
    }
    case 'kv': {
      const size = 14 * U_;
      const color = b.color ?? tone;
      const hk = textH(b.k, w * 0.62, size), hv = textH(b.v, w * 0.38, size);
      if (draw) {
        text(b.k, x, y, { size, color, maxW: w * 0.62 });
        text(b.v, x + w, y, { size, color, align: 'right', maxW: w * 0.38 });
      }
      return Math.max(hk, hv) + gap;
    }
    case 'bar': {
      const h = b.h ?? 10 * U_;
      if (draw) bar(x, y, w, h, b.v, b.max, b.color);
      return h + 8 * U_;
    }
    case 'btns': {
      const bw = (b.bw ?? 118) * U_, bh = 36 * U_, bgap = 8 * U_;
      let bx = x, by = y, rowH = 0;
      for (const it of b.items) {
        const ih = it.sub ? bh + 10 * U_ : bh;
        if (bx > x && bx + bw > x + w) { bx = x; by += rowH + bgap; rowH = 0; }
        if (draw) button(bx, by, bw, ih, it.label, it.onClick, { sub: it.sub, off: it.off, why: it.why, lac: it.lac, fs: it.fs });
        bx += bw + bgap;
        rowH = Math.max(rowH, ih);
      }
      return b.items.length ? by + rowH - y + 6 * U_ : 0;
    }
    case 'gap': return b.h ?? 6 * U_;
    case 'custom': if (draw) b.fn(x, y, w); return b.h;
    default: return 0;
  }
}

// 卡片：依內容決定高度後繪製底框（紅漆金邊或紙本），可選 header（固定高度的自訂區）與 body 區塊。
// onClick 登記整張卡為可點區；卡內按鈕於其後登記，點擊時優先（dispatchPoint 由後往前判定）。
export function cardHeight(w, { header = null, blocks = [], tone } = {}) {
  const p = pad(), inner = w - 2 * p;
  const body = stack(0, 0, inner, blocks, false, tone ?? LAC_TEXT);
  return 2 * p + (header ? header.h : 0) + (blocks.length ? (header ? gapOf() : 0) + body : 0);
}

export function card(x, y, w, { lac = true, dark = false, header = null, blocks = [], onClick = null, tone } = {}) {
  const p = pad(), inner = w - 2 * p;
  const t = tone ?? (lac ? LAC_TEXT : INK);
  const h = cardHeight(w, { header, blocks, tone: t });
  panel(x, y, w, h, { lac, dark, r: 8 });
  if (onClick) hit({ x, y, w, h }, onClick);
  let cy = y + p;
  if (header) { header.draw(x + p, cy, inner, header.h); cy += header.h + gapOf(); }
  if (blocks.length) stack(x + p, cy, inner, blocks, true, t);
  return h;
}

// 紙本區塊（朝局、收藏、年度回顧等）。
export function section(x, y, w, title, blocks = []) {
  return card(x, y, w, { lac: false, blocks: title ? [{ t: 'title', s: title }, ...blocks] : blocks });
}

// 紙本頁面外的標題列（如「進行中」、各派名）：回傳高度。
export function heading(x, y, w, label, color = null) {
  const size = 16 * C.U;
  return text(label, x, y, { size, weight: 'bold', color: color || '#7a1a1a', maxW: w }) + 8 * C.U;
}

// 回饋行（同舊版 fbLine）：有 U.feedback 才佔位。
export function feedbackBlock() {
  return U.feedback ? { t: 'text', s: U.feedback, color: '#7a1a1a' } : null;
}

// 版面：自上而下排列的卡片，回傳結束 y。
export function column(x, y, w, fns) {
  let cy = y;
  for (const fn of fns) cy += fn(x, cy, w) + gapOf();
  return cy;
}

export function setContentHeight(yEnd) {
  C.contentH = yEnd - C.content.y + pad();
}

// 金色標題字（紙本區塊的小標題）。
export const kicker = (s) => ({ t: 'text', s, color: '#8a6a2a', size: 12.5 * C.U });

export { LAC_TEXT, INK, GOLD };

// web/ui/dialog.js：統一的頁內對話框（Canvas）。堆疊式：最上層對話框獨占輸入，Esc 或點背景（可關閉者）即關閉。
// 繪製經 A 的 input.js modal()；core 每幀須於 takeModal() 前呼叫 drawDialogs(C)（待 A 接線）。
// 相容層：openDialog({ html, onClick, ... }) 保留既有簽名（render-side、render-ruler 仍以 HTML 呼叫）；
// html 轉為純文字與按鈕（data-dlg／data-ruler 屬性）後以 Canvas 繪製，onClick 的 e.target 以替身物件模擬 closest()。
import { modal, hit } from './canvas/input.js';
import { panel, text, button, measureLines } from './canvas/widgets.js';
import { INK, RED } from './canvas/theme.js';
import { registerPreModal } from './canvas/core.js';
import { U } from './store.js';

const stack = [];
let escKey = false;
if (typeof document !== 'undefined' && document.addEventListener) {
  // document 的監聽早於 window（core 的 Esc 監聽），故可在 closeModal() 前記下是否為 Esc。
  document.addEventListener('keydown', (e) => { escKey = e.key === 'Escape'; });
}

// 開啟 Canvas 對話框。spec: { title, body（字串）, buttons: [{key,label}], onButton(key, close), onClose(), dismissible, drawBody(C,x,y,w)→h, message }。
// 回傳 close()；close.el 為此對話框的識別物件（同舊版「外層元素」的用途：與 e.target 比對）。
export function openCanvasDialog(spec = {}) {
  const entry = { spec, closed: false, message: '' };
  const close = () => {
    if (entry.closed) return;
    entry.closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    spec.onClose?.();
  };
  entry.close = close;
  close.el = entry;
  stack.push(entry);
  return close;
}

export function dialogCount() { return stack.length; }
export function topDialog() { return stack.at(-1) || null; }

// 設定最上層對話框的訊息列（例如奇遇抉擇失敗的原因）。
export function setDialogMessage(msg) { const t = stack.at(-1); if (t) t.message = String(msg ?? ''); }

// 每幀呼叫（core 於 takeModal 前）：有對話框時登記 modal 請求，無則不作為。
export function drawDialogs() {
  const top = stack.at(-1);
  // 雲端衝突為阻擋式對話框（state-io.drawConflictModal 於本幀先登記），此時頁內對話框暫不登記，避免覆寫其 modal。
  if (!top || U.conflict) return;
  modal((c) => drawDialogBox(c, top), () => {
    // Esc 一律關閉；點背景：可關閉者交由 onOutside 決定（無則關閉）。
    if (escKey) { escKey = false; return top.close(); }
    if (top.spec.onOutside) return top.spec.onOutside(top.close);
    if (top.spec.dismissible) top.close();
  });
}
// 由 core.drawFrame 於 takeModal() 前呼叫（見 core.js 的 registerPreModal）。
registerPreModal(() => drawDialogs());

// 繪製對話框本體：置中面板、標題、內文、選用的額外區塊、訊息列與按鈕列。
export function drawDialogBox(c, entry) {
  const { spec } = entry;
  const U = c.U || 1, W = c.W || 640, H = c.H || 480;
  if (!spec.dismissible) hit({ x: 0, y: 0, w: W, h: H }, () => {}); // 吞掉背景點擊（不關閉）
  const pad = 18 * U, bw = Math.min(W * 0.9, 480 * U), inner = bw - pad * 2;
  const titleSize = 20 * U, bodySize = 15 * U, lh = bodySize * 1.45;
  const bodyLines = spec.body ? measureLines(String(spec.body), inner, bodySize, '') : [];
  const titleH = spec.title ? titleSize * 1.6 : 0;
  const bodyH = bodyLines.length * lh + (bodyLines.length ? 10 * U : 0);
  const extraH = spec.drawBody ? (spec.extraH || 0) * U : 0;
  const msgLines = entry.message ? measureLines(entry.message, inner, bodySize, '') : [];
  const msgH = msgLines.length * lh + (msgLines.length ? 8 * U : 0);
  const btnH = 40 * U, btnRow = spec.buttons?.length ? btnH + 12 * U : 0;
  const bh = pad + titleH + bodyH + extraH + msgH + btnRow + pad;
  const bx = (W - bw) / 2, by = Math.max(8 * U, (H - bh) / 2);
  panel(bx, by, bw, bh, { block: true });
  let y = by + pad;
  if (spec.title) { text(spec.title, bx + pad, y, { size: titleSize, weight: 'bold', color: RED, maxW: inner }); y += titleH; }
  if (bodyLines.length) { text(bodyLines.join('\n'), bx + pad, y, { size: bodySize, color: INK, maxW: inner, lh: 1.45 }); y += bodyH; }
  if (spec.drawBody) { spec.drawBody(c, bx + pad, y, inner); y += extraH; }
  if (msgLines.length) { text(msgLines.join('\n'), bx + pad, y, { size: bodySize, color: RED, maxW: inner, lh: 1.45 }); y += msgH; }
  if (spec.buttons?.length) {
    const gap = 10 * U;
    const each = Math.min(180 * U, (inner - gap * (spec.buttons.length - 1)) / spec.buttons.length);
    const total = each * spec.buttons.length + gap * (spec.buttons.length - 1);
    let bxp = bx + (bw - total) / 2;
    for (const b of spec.buttons) {
      button(bxp, y, each, btnH, b.label, () => spec.onButton?.(b.key, entry.close, entry), { fs: 15 * U, lac: b.plain ? false : undefined });
      bxp += each + gap;
    }
  }
}

// 相容層：以 HTML 字串開啟對話框（render-side、render-ruler 使用）。
// 純文字取自 html；按鈕取自含 data-dlg 或 data-ruler 屬性之 <button>。
export function openDialog({ html = '', className, attrs, initialFocus, onClose, onClick } = {}) {
  const buttons = [];
  const re = /<button[^>]*data-(?:dlg|ruler)="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(html))) buttons.push({ key: m[1], label: m[2].replace(/<[^>]+>/g, '').trim() });
  const body = html.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const dismissible = !!onClick;
  let close;
  const legacyEvent = (key, el) => ({
    target: {
      closest: (sel) => {
        if (sel === '.dlg' || sel.startsWith('.')) return { querySelector: () => msgTarget() };
        if (key && sel.includes('data-')) return { dataset: { dlg: key, ruler: key } };
        return null;
      },
    },
  });
  const msgTarget = () => ({ set textContent(v) { setDialogMessage(v); } });
  close = openCanvasDialog({
    title: '',
    body,
    buttons: buttons.length ? buttons : [],
    dismissible,
    onClose,
    onButton: (key) => onClick?.(legacyEvent(key, null), close),
    onOutside: (cl) => (onClick ? onClick({ target: cl.el }, cl) : cl()),
  });
  return close;
}

// 表格（Canvas）：cols = [{ label, weight }]，rows = [[字串, …]]。回傳高度。
// 欄寬依 weight 分配；奇數列加淡底。
export function drawTable(c, { x, y, w, cols, rows, size = 12 }) {
  const U = c.U || 1, fs = size * U, rh = fs * 2.1;
  const sum = cols.reduce((a, col) => a + (col.weight || 1), 0);
  const widths = cols.map(col => (w * (col.weight || 1)) / sum);
  const xs = widths.reduce((acc, cw, i) => { acc.push(i ? acc[i - 1] + widths[i - 1] : x); return acc; }, []);
  const drawRow = (vals, yy, bold, shade) => {
    if (shade && c.ctx) { c.ctx.save(); c.ctx.fillStyle = 'rgba(94,16,20,.07)'; c.ctx.fillRect(x, yy, w, rh); c.ctx.restore(); }
    vals.forEach((v, i) => text(String(v), xs[i] + 4 * U, yy + (rh - fs) / 2, { size: fs, weight: bold ? 'bold' : '', color: INK, maxW: widths[i] - 8 * U, lh: 1.1 }));
  };
  let cy = y;
  drawRow(cols.map(col => col.label), cy, true, false);
  cy += rh;
  rows.forEach((r, i) => { drawRow(r, cy, false, i % 2 === 1); cy += rh; });
  return cy - y;
}

// 圖鑑式的標籤列（Canvas）：items = [{ label, on }]，自動換列。回傳高度。
export function drawChips(c, { x, y, w, items, size = 13 }) {
  const U = c.U || 1, fs = size * U, ch = fs * 1.9, gap = 6 * U, padX = 8 * U;
  let cx = x, cy = y;
  const ctx = c.ctx;
  for (const it of items) {
    ctx.save(); ctx.font = `${fs}px sans-serif`; const tw = ctx.measureText(it.label).width; ctx.restore();
    const cw = tw + padX * 2;
    if (cx + cw > x + w && cx > x) { cx = x; cy += ch + gap; }
    panel(cx, cy, cw, ch, { r: 6, fill: it.on ? 'rgba(94,16,20,.88)' : 'rgba(0,0,0,.08)' });
    text(it.label, cx + padX, cy + (ch - fs) / 2, { size: fs, color: it.on ? '#f6e6b8' : INK, align: 'left' });
    cx += cw + gap;
  }
  return cy + ch - y;
}

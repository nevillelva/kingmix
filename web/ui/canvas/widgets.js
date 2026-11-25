// web/ui/canvas/widgets.js：紅漆金邊元件（移植自 皇帝成長_v2.html 的 lacquer / btn / wrap / seal / person / bar）。
// 契約 API：button、panel、bar、portrait、text、toast。另提供 seal、plate、measureLines 供各畫面使用。
import { C, pushToast } from './core.js';
import { hit, hovered, editText } from './input.js';
import { GOLD, PAPER, LAC_TEXT, INK, font, roundPath, shade } from './theme.js';

const ctxOf = () => C.ctx;
const INK_TEXT = INK;

// 紅漆底（dark 為深色變體）。
function lacquerPath(x, y, w, h, r, dark) {
  const c = ctxOf();
  roundPath(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, dark ? '#4a0c10' : '#b32a2e');
  g.addColorStop(1, dark ? '#2a0608' : '#6a1216');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
  roundPath(c, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 2));
  c.strokeStyle = 'rgba(230,185,79,.45)'; c.lineWidth = 1; c.stroke();
}

// 面板：預設為紙本底（淺色、金邊）；opts.lac 為紅漆底；opts.block 時吃掉面板內的點擊（用於對話框，避免穿透關閉）。
export function panel(x, y, w, h, opts = {}) {
  const c = ctxOf();
  const r = (opts.r ?? 8) * C.U;
  if (opts.lac) { lacquerPath(x, y, w, h, r, !!opts.dark); }
  else {
    roundPath(c, x, y, w, h, r);
    c.fillStyle = opts.fill || 'rgba(255,250,236,.86)';
    c.fill();
    c.strokeStyle = GOLD; c.lineWidth = 1.6; c.stroke();
  }
  if (opts.block) hit({ x, y, w, h }, () => {});
}

// 按鈕（紅漆）。opts: { sub 副標, off 停用, why 停用提示, lac 是否紅漆(預設 true), dark, fs 字級 }。
export function button(x, y, w, h, label, onClick, opts = {}) {
  const c = ctxOf(), U = C.U;
  const hov = !opts.off && hovered(x, y, w, h);
  c.save();
  if (opts.off) c.globalAlpha = 0.5;
  if (hov) { c.shadowColor = GOLD; c.shadowBlur = 14; }
  if (opts.lac === false) {
    roundPath(c, x, y, w, h, 7 * U);
    c.fillStyle = 'rgba(255,250,236,.9)'; c.fill(); c.strokeStyle = GOLD; c.lineWidth = 1.6; c.stroke();
  } else lacquerPath(x, y, w, h, 7 * U, !opts.red && !opts.lac);
  c.shadowBlur = 0;
  c.fillStyle = opts.lac === false ? INK_TEXT : LAC_TEXT;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const fs = opts.fs || Math.max(14, 16 * U);
  if (opts.sub) {
    c.font = font(fs, 'bold'); c.fillText(label, x + w / 2, y + h * 0.37);
    c.font = font(Math.max(11, 12 * U)); c.fillStyle = 'rgba(246,230,184,.78)'; c.fillText(opts.sub, x + w / 2, y + h * 0.73);
  } else {
    c.font = font(fs, 'bold'); c.fillText(label, x + w / 2, y + h / 2 + 1);
  }
  c.restore();
  hit({ x, y, w, h }, onClick, { disabled: !!opts.off, why: opts.why || '目前無法執行' });
}

// 條狀量表（0..max），色彩由 color 指定。
export function bar(x, y, w, h, v, max, color) {
  const c = ctxOf();
  roundPath(c, x, y, w, h, h / 2);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
  if (v > 0) {
    const fw = Math.max(h, w * Math.min(1, Math.max(0, v / max)));
    roundPath(c, x, y, fw, h, h / 2);
    c.fillStyle = color || GOLD; c.fill();
  }
}

// 文字：自動換行（以字為單位，支援 \n）。opts: { size, weight, color, align: 'left'|'center'|'right', maxW, lh 行距倍數 }。
// 回傳實際使用的高度（像素）。
export function text(str, x, y, opts = {}) {
  const c = ctxOf(), U = C.U;
  const size = opts.size || 14 * U;
  c.save();
  c.font = font(size, opts.weight || '');
  c.fillStyle = opts.color || INK_TEXT;
  c.textAlign = opts.align || 'left';
  c.textBaseline = 'top';
  const lines = measureLines(String(str), opts.maxW || Infinity, size, opts.weight || '');
  const lh = size * (opts.lh || 1.45);
  lines.forEach((ln, i) => c.fillText(ln, x, y + i * lh));
  c.restore();
  return lines.length * lh;
}

// 依最大寬度切行（同 v2 的 wrap）。
export function measureLines(str, maxW, size, weight) {
  const c = ctxOf();
  if (c) c.font = font(size || 14 * C.U, weight || '');
  const out = [];
  let cur = '';
  for (const ch of str) {
    if (ch === '\n') { out.push(cur); cur = ''; continue; }
    if (c && cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur || out.length === 0) out.push(cur);
  return out;
}

// 印章（朱紅方章，同 v2 的 seal）。
export function seal(x, y, s, txt, rot = 0) {
  const c = ctxOf();
  c.save();
  c.translate(x, y); c.rotate(rot);
  roundPath(c, -s / 2, -s / 2, s, s, s * 0.1);
  c.fillStyle = '#b8322a'; c.fill();
  roundPath(c, -s / 2 + 3, -s / 2 + 3, s - 6, s - 6, s * 0.07);
  c.strokeStyle = 'rgba(241,230,200,.85)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = PAPER; c.font = font(s * 0.62, 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(txt, 0, 2);
  c.restore();
}

// 朱色標籤牌（同 v2 的 plate）。
export function plate(x, y, w, h, label) {
  const c = ctxOf();
  roundPath(c, x, y, w, h, 4 * C.U);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#8a1f22'); g.addColorStop(1, '#4a0c0e');
  c.fillStyle = g; c.fill(); c.strokeStyle = GOLD; c.lineWidth = 1.3; c.stroke();
  c.fillStyle = '#f6e6b8'; c.font = font(Math.max(11, h * 0.62), 'bold');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x + w / 2, y + h / 2 + 1);
}

// 人物頭像（移植自 v2 的 person）。p: { k: 'f'|'emp'|'gen'|'dao'|'old'|'?'|其他男性, robe, skin, hair, collar, acc, eye, gem, bg0, bg1 }。
export function portrait(x, y, w, h, p) {
  const c = ctxOf(), U = C.U, T = C.T;
  c.save();
  roundPath(c, x, y, w, h, 6 * U); c.clip();
  let g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, p.bg0 || '#f3e6c2'); g.addColorStop(1, p.bg1 || '#c9a062');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(120,70,30,.22)'; c.lineWidth = 1;
  for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(x + i * w / 5, y); c.lineTo(x + i * w / 5, y + h); c.stroke(); }
  if (p.k === '?') {
    c.fillStyle = 'rgba(40,20,10,.55)';
    c.beginPath(); c.arc(x + w / 2, y + h * 0.42, w * 0.24, 0, 7); c.fill();
    c.beginPath(); c.ellipse(x + w / 2, y + h * 0.95, w * 0.42, h * 0.3, 0, 0, 7); c.fill();
    c.fillStyle = PAPER; c.font = font(w * 0.36, 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('？', x + w / 2, y + h * 0.45);
    c.restore(); return;
  }
  const s = w, cx = x + w / 2, fy = y + h * 0.46, k = p.k;
  const skin = p.skin || (k === 'f' ? '#f7dfca' : '#efcfae');
  const hair = p.hair || '#1d1517', fem = k === 'f';
  if (fem) { c.fillStyle = hair; c.beginPath(); c.ellipse(cx, fy, s * 0.37, s * 0.46, 0, 0, 7); c.fill(); c.fillRect(cx - s * 0.37, fy, s * 0.74, h * 0.5); }
  c.fillStyle = skin; c.fillRect(cx - s * 0.07, fy + s * 0.22, s * 0.14, s * 0.2);
  const rc = p.robe || (k === 'emp' ? '#e0a82e' : k === 'gen' ? '#4a5a6a' : k === 'dao' ? '#3d6a8a' : k === 'old' ? '#6a5a48' : '#a8302a');
  c.beginPath(); c.moveTo(x - s * 0.1, y + h + 2); c.lineTo(x - s * 0.05, y + h * 0.84);
  c.quadraticCurveTo(cx - s * 0.42, fy + s * 0.42, cx - s * 0.14, fy + s * 0.38); c.lineTo(cx + s * 0.14, fy + s * 0.38);
  c.quadraticCurveTo(cx + s * 0.42, fy + s * 0.42, x + s * 1.05, y + h * 0.84); c.lineTo(x + s * 1.1, y + h + 2); c.closePath();
  g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(rc, -0.2)); g.addColorStop(0.5, rc); g.addColorStop(1, shade(rc, -0.3));
  c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(30,15,5,.5)'; c.lineWidth = 1; c.stroke();
  c.fillStyle = p.collar || (k === 'emp' ? '#7a1a1a' : '#f3e3c0');
  c.beginPath(); c.moveTo(cx - s * 0.15, fy + s * 0.37); c.lineTo(cx, fy + s * 0.62); c.lineTo(cx + s * 0.15, fy + s * 0.37);
  c.lineTo(cx + s * 0.08, fy + s * 0.36); c.lineTo(cx, fy + s * 0.5); c.lineTo(cx - s * 0.08, fy + s * 0.36); c.closePath(); c.fill();
  c.fillStyle = p.acc || GOLD;
  for (const [ax, ay] of [[-0.3, 0.66], [0.3, 0.66], [-0.22, 0.8], [0.22, 0.8], [0, 0.85]]) { c.beginPath(); c.arc(cx + ax * s, y + h * ay, s * 0.035, 0, 7); c.fill(); }
  if (k === 'emp') { c.strokeStyle = '#7a1a1a'; c.lineWidth = 1.5; for (const ax of [-0.28, 0.28]) { c.beginPath(); c.arc(cx + ax * s, y + h * 0.76, s * 0.08, 0, 7); c.stroke(); } }
  // 臉
  c.beginPath();
  c.moveTo(cx - s * 0.27, fy - s * 0.05);
  c.bezierCurveTo(cx - s * 0.27, fy - s * 0.32, cx + s * 0.27, fy - s * 0.32, cx + s * 0.27, fy - s * 0.05);
  c.bezierCurveTo(cx + s * 0.27, fy + s * 0.18, cx + s * 0.1, fy + s * 0.34, cx, fy + s * 0.34);
  c.bezierCurveTo(cx - s * 0.1, fy + s * 0.34, cx - s * 0.27, fy + s * 0.18, cx - s * 0.27, fy - s * 0.05);
  c.closePath();
  g = c.createRadialGradient(cx - s * 0.06, fy - s * 0.08, s * 0.02, cx, fy, s * 0.36);
  g.addColorStop(0, shade(skin, 0.25)); g.addColorStop(1, skin);
  c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(110,60,40,.45)'; c.lineWidth = 1; c.stroke();
  if (fem) for (const ax of [-1, 1]) {
    g = c.createRadialGradient(cx + ax * s * 0.16, fy + s * 0.12, 1, cx + ax * s * 0.16, fy + s * 0.12, s * 0.08);
    g.addColorStop(0, 'rgba(236,110,120,.5)'); g.addColorStop(1, 'rgba(236,110,120,0)');
    c.fillStyle = g; c.fillRect(cx + ax * s * 0.16 - s * 0.09, fy + s * 0.03, s * 0.18, s * 0.18);
  }
  const ey = fy + s * 0.03;
  for (const ax of [-1, 1]) {
    const ex = cx + ax * s * 0.125;
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(ex - s * 0.06, ey); c.quadraticCurveTo(ex, ey - s * 0.055, ex + s * 0.06, ey); c.quadraticCurveTo(ex, ey + s * 0.04, ex - s * 0.06, ey); c.fill();
    c.fillStyle = p.eye || '#3a2418'; c.beginPath(); c.arc(ex, ey, s * (fem ? 0.033 : 0.028), 0, 7); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - s * 0.01, ey - s * 0.01, s * 0.01, 0, 7); c.fill();
    c.strokeStyle = '#2a1810'; c.lineWidth = fem ? 1.6 : 1.3; c.beginPath(); c.moveTo(ex - s * 0.065, ey + s * 0.005); c.quadraticCurveTo(ex, ey - s * 0.06, ex + s * 0.065, ey); c.stroke();
    c.strokeStyle = fem ? '#2a1810' : '#1a1210'; c.lineWidth = fem ? 1.4 : 2.6;
    c.beginPath(); c.moveTo(ex - s * 0.07, ey - s * 0.06); c.quadraticCurveTo(ex, ey - s * (fem ? 0.11 : 0.09), ex + s * 0.07, ey - s * 0.05); c.stroke();
  }
  c.strokeStyle = 'rgba(120,70,50,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx, ey + s * 0.03); c.lineTo(cx - s * 0.012, ey + s * 0.1); c.lineTo(cx + s * 0.012, ey + s * 0.105); c.stroke();
  c.fillStyle = fem ? '#c8404c' : '#9a4a40';
  c.beginPath(); c.moveTo(cx - s * 0.05, fy + s * 0.19); c.quadraticCurveTo(cx, fy + s * 0.17, cx + s * 0.05, fy + s * 0.19); c.quadraticCurveTo(cx, fy + s * 0.23, cx - s * 0.05, fy + s * 0.19); c.fill();
  // 頭髮與冠帽
  const fh = (col) => {
    c.fillStyle = col; c.beginPath();
    c.moveTo(cx - s * 0.29, fy + s * 0.12);
    c.bezierCurveTo(cx - s * 0.34, fy - s * 0.2, cx - s * 0.2, fy - s * 0.38, cx, fy - s * 0.38);
    c.bezierCurveTo(cx + s * 0.2, fy - s * 0.38, cx + s * 0.34, fy - s * 0.2, cx + s * 0.29, fy + s * 0.12);
    c.bezierCurveTo(cx + s * 0.27, fy - s * 0.05, cx + s * 0.2, fy - s * 0.16, cx + s * 0.1, fy - s * 0.17);
    c.quadraticCurveTo(cx, fy - s * 0.12, cx - s * 0.1, fy - s * 0.17);
    c.bezierCurveTo(cx - s * 0.2, fy - s * 0.16, cx - s * 0.27, fy - s * 0.05, cx - s * 0.29, fy + s * 0.12);
    c.fill();
  };
  if (fem) {
    fh(hair);
    for (const ax of [-1, 1]) {
      g = c.createRadialGradient(cx + ax * s * 0.2 - 2, fy - s * 0.44, 1, cx + ax * s * 0.2, fy - s * 0.42, s * 0.11);
      g.addColorStop(0, shade(hair, 0.4)); g.addColorStop(1, hair);
      c.fillStyle = g; c.beginPath(); c.arc(cx + ax * s * 0.2, fy - s * 0.42, s * 0.1, 0, 7); c.fill();
    }
    c.fillStyle = '#f6a6bd';
    for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(cx - s * 0.22 + Math.cos(i * 1.26) * s * 0.04, fy - s * 0.48 + Math.sin(i * 1.26) * s * 0.04, s * 0.03, s * 0.018, i * 1.26, 0, 7); c.fill(); }
    const px1 = cx + s * 0.24, py1 = fy - s * 0.3;
    const gl = c.createRadialGradient(px1, py1, 1, px1, py1, s * 0.1);
    gl.addColorStop(0, 'rgba(255,230,150,' + (0.7 + 0.25 * Math.sin(T * 3)) + ')'); gl.addColorStop(1, 'rgba(255,230,150,0)');
    c.fillStyle = gl; c.fillRect(px1 - s * 0.1, py1 - s * 0.1, s * 0.2, s * 0.2);
    c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + s * 0.06, fy - s * 0.5); c.lineTo(px1, py1); c.stroke();
    c.fillStyle = p.gem || '#d8353f'; c.beginPath(); c.arc(px1, py1, s * 0.025, 0, 7); c.fill();
  } else if (k === 'emp') {
    fh(hair);
    c.fillStyle = '#1d1a17'; c.fillRect(cx - s * 0.31, fy - s * 0.5, s * 0.62, s * 0.06); c.fillRect(cx - s * 0.2, fy - s * 0.44, s * 0.4, s * 0.1);
    c.fillStyle = GOLD;
    for (let i = 0; i < 7; i++) {
      const bx = cx - s * 0.27 + i * s * 0.09;
      c.strokeStyle = 'rgba(230,185,79,.8)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, fy - s * 0.44); c.lineTo(bx, fy - s * 0.16); c.stroke();
      for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(bx, fy - s * 0.36 + j * s * 0.08, 1.8, 0, 7); c.fill(); }
    }
  } else if (k === 'gen') {
    fh('#1a1210');
    g = c.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
    g.addColorStop(0, '#6a7480'); g.addColorStop(0.5, '#d8dee4'); g.addColorStop(1, '#5a6470');
    c.fillStyle = g; c.beginPath(); c.arc(cx, fy - s * 0.22, s * 0.3, Math.PI, 0); c.lineTo(cx + s * 0.3, fy - s * 0.14); c.lineTo(cx - s * 0.3, fy - s * 0.14); c.closePath(); c.fill();
    c.strokeStyle = '#2a2a30'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#d8353f'; c.beginPath(); c.moveTo(cx, fy - s * 0.52); c.quadraticCurveTo(cx + s * 0.12 + Math.sin(T * 3) * 3, fy - s * 0.62, cx + s * 0.1, fy - s * 0.74); c.quadraticCurveTo(cx + s * 0.02, fy - s * 0.62, cx, fy - s * 0.52); c.fill();
  } else {
    fh(k === 'old' ? '#cfcac0' : hair);
    c.fillStyle = k === 'dao' ? '#2a4a62' : '#1d1a17';
    if (k === 'dao') { c.beginPath(); c.arc(cx, fy - s * 0.4, s * 0.13, 0, 7); c.fill(); c.strokeStyle = GOLD; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - s * 0.14, fy - s * 0.4); c.lineTo(cx + s * 0.14, fy - s * 0.4); c.stroke(); }
    else {
      roundPath(c, cx - s * 0.26, fy - s * 0.5, s * 0.52, s * 0.2, s * 0.05); c.fill();
      c.beginPath(); c.ellipse(cx - s * 0.38, fy - s * 0.36, s * 0.13, s * 0.028, 0, 0, 7); c.ellipse(cx + s * 0.38, fy - s * 0.36, s * 0.13, s * 0.028, 0, 0, 7); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - s * 0.26, fy - s * 0.34); c.lineTo(cx + s * 0.26, fy - s * 0.34); c.stroke();
    }
  }
  c.restore();
  roundPath(c, x, y, w, h, 6 * U); c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
}

// 將官員物件對應為 portrait 所需的 p（職位→類型、派系→袍色）。派系色由呼叫端傳入 robe。
export function personOf(o = {}) {
  const k = o.office === 'chancellor' ? 'emp' : o.gender === 'f' ? 'f' : o.k || 'm';
  return { k, robe: o.robe };
}

// 文字提示：排入 toast 佇列（同 v2 的 toast）。
export function toast(msg) { pushToast(msg); }


// 文字輸入欄位的隱藏輸入橋接（見 input.js 的 editText）。
export { editText };

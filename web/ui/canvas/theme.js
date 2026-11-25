// web/ui/canvas/theme.js：紅漆金邊的色彩、字型與共用繪圖小工具（取自 皇帝成長_v2.html）。葉節點，不 import 任何模組。
export const INK = '#1c1a17';
export const PAPER = '#f1e6c8';
export const GOLD = '#e6b94f';
export const RED = '#a3262a';
export const DRED = '#5e1014';
export const FRAME = '#3a0c0e';
export const LAC_TEXT = '#f6e6b8';

export const FONT_FAMILY = '"LXGW WenKai TC","Noto Serif TC","PingFang TC","Microsoft JhengHei",serif';

// 季節淡色（沿用舊介面 index.html 的 --t-* 色票）。
export const SEASON_TINT = {
  spring: 'rgba(78,125,91,.16)',
  summer: 'rgba(46,94,126,.13)',
  autumn: 'rgba(180,138,60,.18)',
  winter: 'rgba(255,255,255,.75)',
};

export function font(px, weight) {
  return `${weight ? weight + ' ' : ''}${Math.round(px)}px ${FONT_FAMILY}`;
}

// 顏色明暗調整：a > 0 往白色混合，a < 0 往黑色混合（同 v2 的 shade）。
export function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const f = a < 0 ? 0 : 255, t = Math.abs(a);
  const ch = (v) => Math.round((f - v) * t + v);
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// 外框：深紅邊、金色雲紋與四角金釘（移植自 v2 的 drawFrame）。
function spiral(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let t = 0; t < 9; t += 0.3) {
    const rad = r * (1 - t / 10);
    const X = cx + Math.cos(t) * rad, Y = cy + Math.sin(t) * rad;
    t ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.stroke();
}
export function drawFrameBorder(ctx, W, H, U) {
  const f = 12 * U;
  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, W, f); ctx.fillRect(0, H - f, W, f); ctx.fillRect(0, 0, f, H); ctx.fillRect(W - f, 0, f, H);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6; ctx.strokeRect(f, f, W - 2 * f, H - 2 * f);
  ctx.strokeStyle = 'rgba(230,185,79,.55)'; ctx.lineWidth = 1; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  ctx.strokeStyle = 'rgba(230,185,79,.8)'; ctx.lineWidth = 1.2;
  const r = f * 0.36;
  for (let x = f * 2; x < W - f; x += f * 1.9) { spiral(ctx, x, f / 2, r); spiral(ctx, x, H - f / 2, r); }
  for (let y = f * 2; y < H - f; y += f * 1.9) { spiral(ctx, f / 2, y, r); spiral(ctx, W - f / 2, y, r); }
  for (const [x, y] of [[f, f], [W - f, f], [f, H - f], [W - f, H - f]]) {
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x, y, f * 0.9, 0, 7); ctx.fill();
    ctx.fillStyle = '#8a1f22'; ctx.beginPath(); ctx.arc(x, y, f * 0.6, 0, 7); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.4; spiral(ctx, x, y, f * 0.5);
  }
}

// 圓角矩形路徑（同 v2 的 rr）。
export function roundPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

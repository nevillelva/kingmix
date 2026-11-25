// web/ui/map-svg.js：全國輿圖的 Canvas 素材（府縣版圖、城防色、府印、割據／天災／權臣之標記）。
// 版圖以示意座標表示（非實際地理比例），座標空間為 340×322；繪製時以 setMapTransform 縮放至畫面。
// 互動（點擊判定與詳情）仍由 render-map.js 掌握。

// 府縣版圖（path 採 SVG 路徑字串，於繪製時以 Path2D 載入）與府印位置、鄰國版圖。
export const MAP_SHAPE = {
  pref: {
    jingzhao: { d: 'M60 100 L120 92 L124 150 L100 168 L64 160 Z', x: 92, y: 134, b: [74, 110] },
    hedong: { d: 'M124 60 L186 56 L196 118 L150 126 L124 112 Z', x: 160, y: 94, b: [176, 74] },
    denglai: { d: 'M206 56 L262 40 L300 70 L292 118 L240 112 L210 96 Z', x: 254, y: 84, b: [284, 56] },
    yangzhou: { d: 'M214 128 L270 124 L286 176 L238 190 L210 160 Z', x: 248, y: 160, b: [270, 140] },
    yizhou: { d: 'M60 184 L118 176 L124 240 L92 262 L56 236 Z', x: 90, y: 222, b: [74, 198] },
    jiangning: { d: 'M140 196 L200 190 L216 240 L178 262 L142 240 Z', x: 178, y: 230, b: [196, 208] },
  },
  nb: {
    north: { d: 'M40 14 L300 10 L300 32 L40 36 Z', x: 170, y: 26 },
    west: { d: 'M14 96 L48 88 L50 236 L18 244 Z', x: 30, y: 168 },
    south: { d: 'M50 286 L300 290 L290 314 L50 310 Z', x: 170, y: 304 },
    east: { d: 'M304 190 L330 184 L330 262 L304 262 Z', x: 318, y: 226 },
  },
};
export const MAP_SPACE = Object.freeze({ w: 340, h: 322 });

// 城防色：低、中、高，以朱、金、青綠淡染（畫布用十六進位，深色背景亦可辨）。
export function defenseColor(v) {
  if (v < 40) return '#d9a0928f';
  if (v < 70) return '#e8d49a';
  return '#a9cfa9';
}
// 民心色：全國單一數值，供頂部徽記使用。
export function peopleColor(v) {
  if (v < 40) return '#b8322a';
  if (v < 70) return '#b48a3c';
  return '#4f9a62';
}

// 將 340×322 之版圖座標對應至畫布矩形，置中且保持比例。回傳 { s, ox, oy }。
export function mapTransform(areaW, areaH) {
  const s = Math.min(areaW / MAP_SPACE.w, areaH / MAP_SPACE.h);
  return { s, ox: (areaW - MAP_SPACE.w * s) / 2, oy: (areaH - MAP_SPACE.h * s) / 2 };
}

// 由 SVG path 字串取其包圍盒（以數字成對視為座標；僅用於點擊判定）。
export function pathBBox(d) {
  const nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// 府縣多邊形（畫布）。opts：{ fill, stroke, dash, lineWidth }。Path2D 於無 DOM 環境下不可用時退回不繪。
export function drawShape(g, d, opts = {}) {
  if (typeof Path2D === 'undefined') return;
  const p = new Path2D(d);
  if (opts.fill) { g.fillStyle = opts.fill; g.fill(p); }
  if (opts.stroke) {
    g.strokeStyle = opts.stroke;
    g.lineWidth = opts.lineWidth ?? 1;
    g.setLineDash(opts.dash ?? []);
    g.stroke(p);
    g.setLineDash([]);
  }
}

// 府印：圓形印記內放知府姓氏首字，代表該府主官。
export function drawGovernorBadge(g, x, y, char) {
  const c = (char || '—').slice(0, 1);
  g.save();
  g.translate(x, y);
  g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2);
  g.fillStyle = '#2a1d14'; g.fill();
  g.strokeStyle = '#e6b84a'; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = '#ffe9a8';
  g.font = '700 12px "Noto Serif TC", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(c, 0, 1);
  g.restore();
}

// 割據：府內斜線填滿；天災紀錄：右上角一道朱色記號；叛亂、失守與攻城之環線。
export function drawPrefectureOverlay(g, d, flags) {
  if (flags.autonomous && typeof Path2D !== 'undefined') {
    g.save();
    g.clip(new Path2D(d));
    const b = pathBBox(d);
    g.strokeStyle = 'rgba(122,40,30,.45)'; g.lineWidth = 1.2;
    for (let i = -b.h; i < b.w; i += 8) { g.beginPath(); g.moveTo(b.x + i, b.y + b.h); g.lineTo(b.x + i + b.h, b.y); g.stroke(); }
    g.restore();
  }
  if (flags.disasters > 0) {
    const b = pathBBox(d);
    g.save();
    g.fillStyle = '#b8322a';
    g.beginPath(); g.moveTo(b.x + b.w - 2, b.y - 2); g.lineTo(b.x + b.w + 4, b.y + 4); g.lineTo(b.x + b.w - 2, b.y + 6); g.lineTo(b.x + b.w + 2, b.y + 12); g.lineTo(b.x + b.w - 6, b.y + 6); g.closePath(); g.fill();
    g.restore();
  }
  if (flags.besieged) drawShape(g, d, { stroke: '#b8322a', dash: [5, 3], lineWidth: 2 });
  if (flags.rebel || flags.occupied) drawShape(g, d, { stroke: '#b8322a', lineWidth: 3 });
}

// 權臣狀況：輿圖頂部之一行字（文字由 render-pressure 的 courtMinisterText 提供）。
export function ministerBanner(text) {
  return String(text ?? '');
}

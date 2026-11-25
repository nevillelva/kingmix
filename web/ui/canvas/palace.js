// web/ui/canvas/palace.js：宮城鳥瞰圖（等角）。建物與地景的繪製取自 v2 原型的 box()、roof()、tree()、pagoda()、flag()、lantern()。
// 地標對應既有的宮室與分頁：御書房→史冊、後宮與慈寧宮→後宮、太和殿→朝堂、校場→朝臣、東廠→東廠；
// 空地為五處宮內設施（園林、醫館、翰林院、武庫、藏書閣），點選即前往設施頁營造。
// 本檔只負責幾何與繪製；狀態讀取與紅點由 render-palace.js 經 palaceZones() 傳入。
import { C } from './core.js';
import { hit } from './input.js';
import { PAPER as _PAPER, GOLD as _GOLD, INK as _INK, FONT_FAMILY } from './theme.js';

// 字型與色票取自 A 的 theme.js。
const THEME = { font: FONT_FAMILY, goldLight: '#ffe9a8', vermilion: '#b8322a', gold: _GOLD, paper: _PAPER, ink: _INK };

// 等角格數：宮城連同周邊的建物位置皆以此格座標排版。
export const PALACE_GRID = Object.freeze({ w: 15, d: 13 });
// 宮城外牆的範圍（格座標）。
const WALL = Object.freeze({ x0: 0.4, y0: 0.4, x1: 14.2, y1: 12.2, gateX0: 6.2, gateX1: 7.6 });

// 地標定義（格座標與尺寸）。kind：hall 殿宇、harem 後宮、plot 空地（設施）、field 校場、yard 東廠。
// nav：點選後前往的分頁（tab）或設施（facility）。
export const PALACE_LAYOUT = Object.freeze([
  { id: 'yushu', n: '御書房', kind: 'hall', gx: 0.8, gy: 0.8, w: 3.4, d: 3.4, h: 1.0, wall: '#a8302a', roof: '#d9a53a', rh: 0.45, nav: { tab: 'throne' } },
  { id: 'houggong', n: '後宮', kind: 'harem', gx: 4.6, gy: 0.8, w: 4.2, d: 3.4, h: 1.0, wall: '#b8453a', roof: '#c04a52', rh: 0.4, nav: { tab: 'harem' } },
  { id: 'cining', n: '慈寧宮', kind: 'harem', gx: 9.2, gy: 0.8, w: 3.0, d: 3.4, h: 0.9, wall: '#a8302a', roof: '#4f9a62', rh: 0.4, nav: { tab: 'harem' } },
  { id: 'taihe', n: '太和殿', kind: 'hall', gx: 3.9, gy: 5.0, w: 4.4, d: 2.6, h: 1.1, wall: '#a8302a', roof: '#e6b84a', rh: 0.55, nav: { tab: 'court' } },
  { id: 'jiaochang', n: '校場', kind: 'field', gx: 0.8, gy: 8.2, w: 3.4, d: 2.9, h: 0, nav: { tab: 'officials' } },
  { id: 'dongchang', n: '東廠', kind: 'yard', gx: 8.6, gy: 8.2, w: 2.6, d: 2.9, h: 0.7, wall: '#7a7a80', roof: '#2a2a2e', rh: 0.45, nav: { tab: 'dc' } },
  { id: 'garden', n: '園林', kind: 'plot', gx: 0.8, gy: 5.0, w: 2.8, d: 2.4, facility: 'garden' },
  { id: 'medical', n: '醫館', kind: 'plot', gx: 8.6, gy: 5.0, w: 2.6, d: 2.4, facility: 'medical' },
  { id: 'library', n: '藏書', kind: 'plot', gx: 4.6, gy: 8.4, w: 3.6, d: 2.4, facility: 'library' },
  { id: 'academy', n: '翰林', kind: 'plot', gx: 11.4, gy: 5.0, w: 2.0, d: 2.4, facility: 'academy' },
  { id: 'armory', n: '武庫', kind: 'plot', gx: 11.4, gy: 8.2, w: 2.0, d: 2.9, facility: 'armory' },
]);

// 紅點與文字所需的狀態摘要：由呼叫端傳入，本檔不讀引擎。
// extra: { pend, marks:Set, openCases, armLevel, counts:{consorts,heirs,annals}, facilities:{id:level}, jobs:{id:{monthsLeft}}, facilityName:{id:name} }
export function palaceZones(extra = {}) {
  const marks = extra.marks ?? new Set();
  const cnt = extra.counts ?? {};
  const fac = extra.facilities ?? {};
  const jobs = extra.jobs ?? {};
  const fname = extra.facilityName ?? {};
  return PALACE_LAYOUT.map((z) => {
    const base = { ...z, marked: marks.has(z.id) || (z.nav?.tab && marks.has(z.nav.tab)) || (z.facility && marks.has(z.facility)) };
    switch (z.id) {
      case 'yushu': return { ...base, s: `史冊 ${cnt.annals ?? 0}` };
      case 'houggong': return { ...base, s: `嬪妃 ${cnt.consorts ?? 0} / 8` };
      case 'cining': return { ...base, s: `子嗣 ${cnt.heirs ?? 0}` };
      case 'taihe': return { ...base, s: extra.pend ? `待批 ${extra.pend} 件` : '朝會・御批' };
      case 'jiaochang': return { ...base, s: `軍備 ${extra.armLevel ?? '—'}` };
      case 'dongchang': return { ...base, s: `進行中 ${extra.openCases ?? 0} 案` };
      default: {
        if (!z.facility) return base;
        const level = fac[z.facility] ?? 0;
        const job = jobs[z.facility];
        const sub = job ? `興建中 尚餘 ${job.monthsLeft} 月` : level === 0 ? '空地・可營造' : `第 ${level} 級`;
        return { ...base, level, building: !!job, s: sub, label: fname[z.facility] ?? z.n, empty: level === 0 && !job };
      }
    }
  });
}

// ── 等角投影：以畫布寬高決定格寬；原點置中。 ──
const P = { TW: 60, TH: 30, ZU: 30, OX: 0, OY: 0 };
export function setIso(W, H) {
  const tw = Math.min((W * 0.92) / ((PALACE_GRID.w + PALACE_GRID.d) / 2), (H * 0.78) / ((PALACE_GRID.w + PALACE_GRID.d) / 4));
  P.TW = Math.max(18, Math.min(96, tw));
  P.TH = P.TW / 2;
  P.ZU = P.TW * 0.5;
  P.OX = W / 2;
  P.OY = (H - (PALACE_GRID.w + PALACE_GRID.d) * P.TH / 2) / 2 + P.TH * PALACE_GRID.d / 2;
  return { ...P };
}
export const isoPx = (gx, gy, z = 0) => [P.OX + ((gx - gy) * P.TW) / 2, P.OY + ((gx + gy) * P.TH) / 2 - z];
const zu = (h) => h * P.ZU;

// ── 色彩：v2 的 shade()，a<0 變暗、a>0 變亮 ──
export function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = a < 0 ? 0 : 255, t = Math.abs(a);
  r = Math.round((f - r) * t + r); g = Math.round((f - g) * t + g); b = Math.round((f - b) * t + b);
  return `rgb(${r},${g},${b})`;
}

function poly(g, pts, fill, stroke) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
}

// 實體方塊（v2 box()）：四面牆、可選屋頂（rh 為屋脊高度，單位格）。
export function box(g, gx, gy, w, d, h, wall, roofC, rh) {
  const z = zu(h), Q = (a, b, c) => isoPx(a, b, c);
  const C0 = Q(gx + w, gy + d, 0), B0 = Q(gx + w, gy, 0), D0 = Q(gx, gy + d, 0);
  const B1 = Q(gx + w, gy, z), C1 = Q(gx + w, gy + d, z), D1 = Q(gx, gy + d, z), A1 = Q(gx, gy, z);
  poly(g, [D0, C0, C1, D1], shade(wall, 0.02), 'rgba(40,25,10,.35)');
  poly(g, [C0, B0, B1, C1], shade(wall, -0.28), 'rgba(40,25,10,.35)');
  if (!roofC) { poly(g, [A1, B1, C1, D1], shade(wall, 0.22), 'rgba(40,25,10,.35)'); return; }
  const e = 0.16, zr = z + zu(rh);
  const A2 = Q(gx - e, gy - e, z), B2 = Q(gx + w + e, gy - e, z), C2 = Q(gx + w + e, gy + d + e, z), D2 = Q(gx - e, gy + d + e, z);
  let r1, r2, back1, back2, f1, f2;
  if (w >= d) {
    r1 = Q(gx + d / 2, gy + d / 2, zr); r2 = Q(gx + w - d / 2, gy + d / 2, zr);
    back1 = [A2, D2, r1]; back2 = [B2, A2, r1, r2]; f1 = [D2, C2, r2, r1]; f2 = [C2, B2, r2];
  } else {
    r1 = Q(gx + w / 2, gy + w / 2, zr); r2 = Q(gx + w / 2, gy + d - w / 2, zr);
    back1 = [A2, D2, r2, r1]; back2 = [B2, A2, r1]; f1 = [D2, C2, r2]; f2 = [C2, B2, r1, r2];
  }
  poly(g, back1, shade(roofC, -0.3)); poly(g, back2, shade(roofC, -0.4));
  poly(g, f1, shade(roofC, 0.08), 'rgba(20,15,10,.45)'); poly(g, f2, shade(roofC, -0.22), 'rgba(20,15,10,.45)');
  g.strokeStyle = shade(roofC, 0.45); g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(r1[0], r1[1]); g.lineTo(r2[0], r2[1]); g.stroke();
}

// 平地菱形（v2 diamond()）。
export function diamond(g, gx, gy, w, d, fill, z = 0, stroke) {
  poly(g, [isoPx(gx, gy, z), isoPx(gx + w, gy, z), isoPx(gx + w, gy + d, z), isoPx(gx, gy + d, z)], fill, stroke);
}

// 樹（v2 tree()）：樹幹加四團樹冠。
export function tree(g, gx, gy, s, col) {
  const [x, y] = isoPx(gx, gy, 0), r = P.TW * 0.17 * s;
  g.fillStyle = '#5a3a20'; g.fillRect(x - 1.5, y - r * 1.1, 3, r * 1.2);
  for (const [dx, dy, k] of [[-0.6, -1.6, 0.8], [0.6, -1.7, 0.8], [0, -2.3, 0.95], [0, -1.5, 1]]) {
    const grd = g.createRadialGradient(x + dx * r - r * 0.2, y + dy * r - r * 0.3, 1, x + dx * r, y + dy * r, r * k);
    grd.addColorStop(0, shade(col, 0.3)); grd.addColorStop(1, shade(col, -0.25));
    g.fillStyle = grd; g.beginPath(); g.arc(x + dx * r, y + dy * r, r * k, 0, 7); g.fill();
  }
}

// 旗（v2 flag()）。
export function flag(g, gx, gy, h, col) {
  const a = isoPx(gx, gy, 0), b = isoPx(gx, gy, zu(h));
  g.strokeStyle = '#4a3020'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  g.fillStyle = col; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] + P.TW * 0.22, b[1] + P.TW * 0.06); g.lineTo(b[0], b[1] + P.TW * 0.12); g.fill();
}

// 燈籠（v2 lantern()）。
export function lantern(g, gx, gy, z) {
  const [x, y] = isoPx(gx, gy, zu(z));
  g.fillStyle = '#d8353f'; g.beginPath(); g.ellipse(x, y, P.TW * 0.035, P.TW * 0.05, 0, 0, 7); g.fill();
  g.fillStyle = THEME.gold; g.fillRect(x - 2, y - P.TW * 0.06, 4, 2);
}

// 寶塔（v2 pagoda()）：基座加若干層屋身。
export function pagoda(g, gx, gy, tiers) {
  box(g, gx - 0.3, gy - 0.3, 1.6, 1.6, 0.25, '#cfc6b1', null, 0);
  let z = 0.25;
  for (let i = 0; i < tiers; i++) {
    const s = 1.1 - i * 0.16, o = (1.6 - s) / 2 - 0.3;
    g.save(); g.translate(0, -z * P.ZU);
    box(g, gx + o, gy + o, s, s, 0.5, '#a8302a', '#6a5a50', 0.22);
    g.restore();
    z += 0.62;
  }
}

// 地標的螢幕外框（供點擊判定）：四角於地面與屋頂高度之包圍盒。
export function zoneRect(z) {
  const top = zu((z.h || 0) + (z.rh || 0.3)) + P.TW * 0.2;
  const pts = [];
  for (const [gx, gy] of [[z.gx, z.gy], [z.gx + z.w, z.gy], [z.gx + z.w, z.gy + z.d], [z.gx, z.gy + z.d]]) {
    pts.push(isoPx(gx, gy, 0), isoPx(gx, gy, top));
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function drawZone(g, z) {
  if (z.kind === 'plot') {
    diamond(g, z.gx, z.gy, z.w, z.d, z.empty ? 'rgba(120,95,50,.22)' : '#e8dcc0', 0, z.empty ? 'rgba(90,60,30,.55)' : '#9a7a40');
    if (z.empty) {
      g.setLineDash([4, 3]); g.strokeStyle = 'rgba(120,80,30,.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(...isoPx(z.gx, z.gy)); g.lineTo(...isoPx(z.gx + z.w, z.gy + z.d)); g.stroke(); g.setLineDash([]);
      return;
    }
    if (z.building) {
      box(g, z.gx + 0.4, z.gy + 0.4, z.w - 0.8, z.d - 0.8, 0.35, '#d8c9a4', '#7a5a3a', 0.2);
      return;
    }
    const lv = z.level ?? 1;
    box(g, z.gx + 0.5, z.gy + 0.5, z.w - 1, z.d - 1, 0.5 + lv * 0.12, '#eadfc2', lv >= 3 ? '#d9a53a' : '#4f9a62', 0.3);
    return;
  }
  if (z.kind === 'field') {
    diamond(g, z.gx, z.gy, z.w, z.d, '#dcc58f', 0, '#9a7a40');
    diamond(g, z.gx + 0.5, z.gy + 0.5, z.w - 1, z.d - 1, '#e4cf9c', 0);
    [[z.gx + 0.6, z.gy + 0.6, '#c04a3a'], [z.gx + 2.1, z.gy + 0.6, '#3a6ac0'], [z.gx + 2.6, z.gy + 1.2, '#c04a3a']]
      .forEach(([x, y, c], i) => { flag(g, x, y, 1.1, i === 1 ? '#e6b84a' : c); });
    return;
  }
  if (z.kind === 'yard') {
    diamond(g, z.gx, z.gy, z.w, z.d, '#cfc2a0', 0);
    box(g, z.gx + 0.3, z.gy + 0.3, 1.6, 1.3, z.h, z.wall, z.roof, z.rh);
    lantern(g, z.gx + 0.4, z.gy + z.d - 0.3, 0.6);
    return;
  }
  // 殿宇與後宮
  box(g, z.gx, z.gy, z.w, z.d, z.h, z.wall, z.roof, z.rh);
  if (z.id === 'taihe') {
    // 太和殿：上層收窄，成重簷之勢。
    g.save(); g.translate(0, -zu(z.h) );
    box(g, z.gx + 0.7, z.gy + 0.5, z.w - 1.4, z.d - 1.0, 0.45, '#a8302a', '#e6b84a', 0.4);
    g.restore();
  }
}

function drawLabel(g, z, cx, cy, text, sub, marked) {
  g.save();
  g.font = `bold ${Math.max(11, Math.round(P.TW * 0.24))}px ${THEME.font}`;
  const w = Math.max(g.measureText(text).width, sub ? g.measureText(sub).width : 0) + 14;
  const hgt = sub ? Math.round(P.TW * 0.56) : Math.round(P.TW * 0.32);
  g.fillStyle = 'rgba(40,12,12,.78)';
  g.beginPath(); g.roundRect ? g.roundRect(cx - w / 2, cy - hgt / 2, w, hgt, 5) : g.rect(cx - w / 2, cy - hgt / 2, w, hgt); g.fill();
  g.fillStyle = THEME.goldLight; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cx, sub ? cy - hgt * 0.2 : cy);
  if (sub) {
    g.font = `${Math.max(10, Math.round(P.TW * 0.19))}px ${THEME.font}`;
    g.fillStyle = 'rgba(255,233,168,.85)';
    g.fillText(sub, cx, cy + hgt * 0.22);
  }
  if (marked) {
    g.fillStyle = THEME.vermilion; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx + w / 2 - 2, cy - hgt / 2 + 2, 5, 0, 7); g.fill(); g.stroke();
  }
  g.restore();
}

// 宮城地景：外牆、午門、庭院、周邊樹木與燈籠（不含地標）。
function drawGround(g) {
  const { x0, y0, x1, y1, gateX0, gateX1 } = WALL;
  diamond(g, x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1, '#b8a674', 0);
  diamond(g, x0, y0, x1 - x0, y1 - y0, '#e7dcc0', 0, '#a8302a');
  diamond(g, x0 + 0.6, y0 + 0.6, x1 - x0 - 1.2, y1 - y0 - 1.2, '#f0e6cb', 0);
  const wallC = '#a8302a', roofC = '#d9a53a';
  box(g, x0, y0, x1 - x0, 0.32, 0.7, wallC, roofC, 0.1);
  box(g, x0, y0, 0.32, y1 - y0, 0.7, wallC, roofC, 0.1);
  box(g, x0, y1 - 0.32, gateX0 - x0, 0.32, 0.7, wallC, roofC, 0.1);
  box(g, gateX1, y1 - 0.32, x1 - gateX1, 0.32, 0.7, wallC, roofC, 0.1);
  box(g, x1 - 0.32, y0, 0.32, y1 - y0, 0.7, wallC, roofC, 0.1);
  // 午門樓
  box(g, gateX0 - 0.2, y1 - 0.4, gateX1 - gateX0 + 0.4, 0.9, 1.2, wallC, roofC, 0.5);
}

// 季節色：以半透明淡染覆蓋宮城（春青、夏綠、秋赭、冬白）。season 為空字串時不繪。
const SEASON_TINT = { spring: 'rgba(120,200,140,.12)', summer: 'rgba(60,140,80,.10)', autumn: 'rgba(200,120,50,.14)', winter: 'rgba(220,235,250,.20)' };
export function drawSeasonTint(g, season, W, H) {
  if (!g || !SEASON_TINT[season]) return;
  g.save();
  g.fillStyle = SEASON_TINT[season];
  g.fillRect(0, 0, W, H);
  g.restore();
}

// 周邊樹木位置固定（不使用引擎亂數）。
const TREES = [[-1.2, 1.4], [-1.0, 4.4], [-1.0, 8.2], [-0.6, 11.2], [2.4, 13.4], [6.8, 13.6], [10.8, 13.3], [15.2, 11.6], [15.4, 6.6], [15.0, 2.4], [12.5, -0.8], [7.6, -1.0], [3.0, -1.2], [14.6, 12.6]];

// 繪製宮城鳥瞰圖；回傳已註冊之點擊區域數。zones 來自 palaceZones()；onZone(z) 於點選時呼叫。
export function drawPalaceScene(zones, onZone, W, H, y0 = 0) {
  const g = C.ctx;
  setIso(W, H);
  if (!g) return 0;
  g.save();
  g.translate(0, y0);
  drawGround(g);
  const sorted = zones.slice().sort((a, b) => (a.gx + a.gy + a.w + a.d) - (b.gx + b.gy + b.w + b.d));
  for (const z of sorted) drawZone(g, z);
  for (const [tx, ty] of TREES) tree(g, tx, ty, 1.1, (tx + ty) % 2 ? '#5a9a56' : '#4f8a52');
  for (const [lx, ly] of [[3.7, 4.8], [7.9, 4.8], [7.9, 7.9]]) lantern(g, lx, ly, 0.6);
  // 午朝廣場標示
  g.fillStyle = 'rgba(90,60,30,.7)'; g.font = `${Math.max(10, Math.round(P.TW * 0.2))}px ${THEME.font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('午朝廣場', ...isoPx(6.1, 8.0));
  g.restore();
  // 標籤與紅點於地景之後繪製，確保不被建物遮蔽。
  let n = 0;
  g.save(); g.translate(0, y0);
  for (const z of sorted) {
    const top = zu((z.h || 0) + (z.rh || 0.3)) + 6;
    const [cx, cy] = isoPx(z.gx + z.w / 2, z.gy + z.d / 2, top + (z.kind === 'plot' ? 0 : 6));
    if (C.ctx) drawLabel(g, z, cx, cy, z.n ?? z.label ?? '', z.s, z.marked);
    const r = zoneRect(z);
    hit({ x: r.x, y: r.y + y0, w: r.w, h: r.h }, () => onZone(z));
    n++;
  }
  g.restore();
  return n;
}

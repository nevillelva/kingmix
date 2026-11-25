// web/ui/canvas/people.js：人物頭像（Canvas 2D）。
// 繪法沿用 皇帝成長_v2.html 的 person()，改為無全域狀態的純繪製函式：
// 所有外部量（縮放 u、動畫時間 t、畫布 ctx）皆由參數傳入，不讀取 DOM、不消耗亂數。
// 頭像外觀只由種類（kind）與傳入的色彩決定；不使用 rng，故不影響既有亂數流。
// 東廠與朝臣卡採紅漆金邊風格，見 lacquerCard()。

export const INK = '#1c1a17';
export const PAPER = '#f1e6c8';
export const GOLD = '#e6b94f';
export const RED = '#a3262a';
export const DRED = '#5e1014';
export const FONT = '"Kaiti TC","KaiTi","STKaiti","BiauKai","Noto Serif TC","Noto Serif CJK TC","PMingLiU",serif';

// 種類：emp 皇帝、f 女子（嬪妃／皇女）、gen 武將、old 年長朝臣、min 一般朝臣、dao 道士（保留）、? 未知。
export const KINDS = Object.freeze(['emp', 'f', 'gen', 'old', 'min', 'dao', '?']);

// 由既有欄位判定種類。純函式，只讀取傳入欄位。
export function kindOf({ emperor = false, female = false, general = false, age = null, unknown = false } = {}) {
  if (unknown) return '?';
  if (emperor) return 'emp';
  if (female) return 'f';
  if (general) return 'gen';
  if (Number(age) >= 60) return 'old';
  return 'min';
}

// 描述物件：draw 所需的外觀參數（與 v2 的 mkP 同構）。robe 可由派系色傳入。
export function personStyle(kind, extra = {}) {
  return { k: KINDS.includes(kind) ? kind : 'min', ...extra };
}

// 將 #rrggbb 依 a 調亮（a>0）或調暗（a<0），回傳 rgb() 字串。與 v2 shade() 相同。
export function shade(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = a < 0 ? 0 : 255, t = Math.abs(a);
  r = Math.round((f - r) * t + r);
  g = Math.round((f - g) * t + g);
  b = Math.round((f - b) * t + b);
  return `rgb(${r},${g},${b})`;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const setFont = (ctx, px, weight) => { ctx.font = `${weight || 'normal'} ${Math.round(px)}px ${FONT}`; };

// 紅漆金邊面板（與 v2 lacquer() 同風格）。dark 為暗色漆。
export function lacquerCard(ctx, x, y, w, h, { r = 6, dark = false, u = 1 } = {}) {
  roundRectPath(ctx, x, y, w, h, r * u);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, dark ? '#4a0c10' : '#b32a2e');
  g.addColorStop(1, dark ? '#2a0608' : '#6a1216');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// 名牌（紅底金邊，字為米色），與 v2 plate() 相同。
export function drawPlate(ctx, x, y, w, h, text, { u = 1 } = {}) {
  roundRectPath(ctx, x, y, w, h, 4 * u);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#8a1f22');
  g.addColorStop(1, '#4a0c0e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = '#f6e6b8';
  setFont(ctx, Math.max(11, h * 0.62), 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

// 人物頭像。p 為 personStyle() 的結果；env = { u, t }。
// 幾何與 v2 person() 一致；僅將全域 ctx／U／T 改為參數。
export function drawPerson(ctx, x, y, w, h, p = {}, env = {}) {
  const u = env.u ?? 1;
  const t = env.t ?? 0;
  const c = ctx;
  c.save();
  roundRectPath(c, x, y, w, h, 6 * u);
  c.clip();
  let g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, p.bg0 || '#f3e6c2');
  g.addColorStop(1, p.bg1 || '#c9a062');
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(120,70,30,.22)';
  c.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    c.beginPath(); c.moveTo(x + (i * w) / 5, y); c.lineTo(x + (i * w) / 5, y + h); c.stroke();
  }
  if (p.k === '?') {
    c.fillStyle = 'rgba(40,20,10,.55)';
    c.beginPath(); c.arc(x + w / 2, y + h * 0.42, w * 0.24, 0, 7); c.fill();
    c.beginPath(); c.ellipse(x + w / 2, y + h * 0.95, w * 0.42, h * 0.3, 0, 0, 7); c.fill();
    c.fillStyle = PAPER;
    setFont(c, w * 0.36, 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('？', x + w / 2, y + h * 0.45);
    c.restore();
    roundRectPath(c, x, y, w, h, 6 * u);
    c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
    return;
  }

  const s = w;
  const cx = x + w / 2;
  const fy = y + h * 0.46;
  const k = p.k;
  const skin = p.skin || (k === 'f' ? '#f7dfca' : '#efcfae');
  const hair = p.hair || '#1d1517';
  const fem = k === 'f';

  if (fem) {
    c.fillStyle = hair;
    c.beginPath(); c.ellipse(cx, fy, s * 0.37, s * 0.46, 0, 0, 7); c.fill();
    c.fillRect(cx - s * 0.37, fy, s * 0.74, h * 0.5);
  }
  c.fillStyle = skin;
  c.fillRect(cx - s * 0.07, fy + s * 0.22, s * 0.14, s * 0.2);

  const rc = p.robe || (k === 'emp' ? '#e0a82e' : k === 'gen' ? '#4a5a6a' : k === 'dao' ? '#3d6a8a' : k === 'old' ? '#6a5a48' : '#a8302a');
  c.beginPath();
  c.moveTo(x - s * 0.1, y + h + 2);
  c.lineTo(x - s * 0.05, y + h * 0.84);
  c.quadraticCurveTo(cx - s * 0.42, fy + s * 0.42, cx - s * 0.14, fy + s * 0.38);
  c.lineTo(cx + s * 0.14, fy + s * 0.38);
  c.quadraticCurveTo(cx + s * 0.42, fy + s * 0.42, x + s * 1.05, y + h * 0.84);
  c.lineTo(x + s * 1.1, y + h + 2);
  c.closePath();
  g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(rc, -0.2));
  g.addColorStop(0.5, rc);
  g.addColorStop(1, shade(rc, -0.3));
  c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(30,15,5,.5)'; c.lineWidth = 1; c.stroke();

  c.fillStyle = p.collar || (k === 'emp' ? '#7a1a1a' : '#f3e3c0');
  c.beginPath();
  c.moveTo(cx - s * 0.15, fy + s * 0.37);
  c.lineTo(cx, fy + s * 0.62);
  c.lineTo(cx + s * 0.15, fy + s * 0.37);
  c.lineTo(cx + s * 0.08, fy + s * 0.36);
  c.lineTo(cx, fy + s * 0.5);
  c.lineTo(cx - s * 0.08, fy + s * 0.36);
  c.closePath(); c.fill();

  c.fillStyle = p.acc || GOLD;
  for (const [ax, ay] of [[-0.3, 0.66], [0.3, 0.66], [-0.22, 0.8], [0.22, 0.8], [0, 0.85]]) {
    c.beginPath(); c.arc(cx + ax * s, y + h * ay, s * 0.035, 0, 7); c.fill();
  }
  if (k === 'emp') {
    c.strokeStyle = '#7a1a1a'; c.lineWidth = 1.5;
    for (const ax of [-0.28, 0.28]) { c.beginPath(); c.arc(cx + ax * s, y + h * 0.76, s * 0.08, 0, 7); c.stroke(); }
  }

  // 臉
  c.beginPath();
  c.moveTo(cx - s * 0.27, fy - s * 0.05);
  c.bezierCurveTo(cx - s * 0.27, fy - s * 0.32, cx + s * 0.27, fy - s * 0.32, cx + s * 0.27, fy - s * 0.05);
  c.bezierCurveTo(cx + s * 0.27, fy + s * 0.18, cx + s * 0.1, fy + s * 0.34, cx, fy + s * 0.34);
  c.bezierCurveTo(cx - s * 0.1, fy + s * 0.34, cx - s * 0.27, fy + s * 0.18, cx - s * 0.27, fy - s * 0.05);
  c.closePath();
  g = c.createRadialGradient(cx - s * 0.06, fy - s * 0.08, s * 0.02, cx, fy, s * 0.36);
  g.addColorStop(0, shade(skin, 0.25));
  g.addColorStop(1, skin);
  c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(110,60,40,.45)'; c.lineWidth = 1; c.stroke();

  if (fem) {
    for (const ax of [-1, 1]) {
      g = c.createRadialGradient(cx + ax * s * 0.16, fy + s * 0.12, 1, cx + ax * s * 0.16, fy + s * 0.12, s * 0.08);
      g.addColorStop(0, 'rgba(236,110,120,.5)');
      g.addColorStop(1, 'rgba(236,110,120,0)');
      c.fillStyle = g;
      c.fillRect(cx + ax * s * 0.16 - s * 0.09, fy + s * 0.03, s * 0.18, s * 0.18);
    }
  }

  // 眼與眉
  const ey = fy + s * 0.03;
  for (const ax of [-1, 1]) {
    const ex = cx + ax * s * 0.125;
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(ex - s * 0.06, ey);
    c.quadraticCurveTo(ex, ey - s * 0.055, ex + s * 0.06, ey);
    c.quadraticCurveTo(ex, ey + s * 0.04, ex - s * 0.06, ey);
    c.fill();
    c.fillStyle = p.eye || '#3a2418';
    c.beginPath(); c.arc(ex, ey, s * (fem ? 0.033 : 0.028), 0, 7); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(ex - s * 0.01, ey - s * 0.01, s * 0.01, 0, 7); c.fill();
    c.strokeStyle = '#2a1810';
    c.lineWidth = fem ? 1.6 : 1.3;
    c.beginPath();
    c.moveTo(ex - s * 0.065, ey + s * 0.005);
    c.quadraticCurveTo(ex, ey - s * 0.06, ex + s * 0.065, ey);
    c.stroke();
    if (fem) {
      c.beginPath(); c.moveTo(ex + ax * s * 0.06, ey); c.lineTo(ex + ax * s * 0.085, ey - s * 0.02); c.stroke();
    }
    c.strokeStyle = fem ? '#2a1810' : '#1a1210';
    c.lineWidth = fem ? 1.4 : 2.6;
    c.beginPath();
    c.moveTo(ex - s * 0.07, ey - s * 0.06);
    c.quadraticCurveTo(ex, ey - s * (fem ? 0.11 : 0.09), ex + s * 0.07, ey - s * 0.05);
    c.stroke();
  }

  // 鼻與口
  c.strokeStyle = 'rgba(120,70,50,.6)'; c.lineWidth = 1;
  c.beginPath();
  c.moveTo(cx, ey + s * 0.03);
  c.lineTo(cx - s * 0.012, ey + s * 0.1);
  c.lineTo(cx + s * 0.012, ey + s * 0.105);
  c.stroke();
  c.fillStyle = fem ? '#c8404c' : '#9a4a40';
  c.beginPath();
  c.moveTo(cx - s * 0.05, fy + s * 0.19);
  c.quadraticCurveTo(cx, fy + s * 0.17, cx + s * 0.05, fy + s * 0.19);
  c.quadraticCurveTo(cx, fy + s * 0.23, cx - s * 0.05, fy + s * 0.19);
  c.fill();

  if (k === 'old' || k === 'dao') {
    c.fillStyle = k === 'old' ? '#ece8e0' : '#d8d4cc';
    c.beginPath();
    c.moveTo(cx - s * 0.2, fy + s * 0.14);
    c.quadraticCurveTo(cx - s * 0.12, fy + s * 0.24, cx, fy + s * 0.3);
    c.quadraticCurveTo(cx + s * 0.12, fy + s * 0.24, cx + s * 0.2, fy + s * 0.14);
    c.quadraticCurveTo(cx, fy + s * 0.26, cx - s * 0.2, fy + s * 0.14);
    c.fill();
    c.beginPath();
    c.moveTo(cx - s * 0.06, fy + s * 0.3);
    c.lineTo(cx, fy + s * 0.55);
    c.lineTo(cx + s * 0.06, fy + s * 0.3);
    c.fill();
  }

  // 髮冠與髮式
  const fh = (col) => {
    c.fillStyle = col;
    c.beginPath();
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
      g.addColorStop(0, shade(hair, 0.4));
      g.addColorStop(1, hair);
      c.fillStyle = g;
      c.beginPath(); c.arc(cx + ax * s * 0.2, fy - s * 0.42, s * 0.1, 0, 7); c.fill();
    }
    c.fillStyle = '#f6a6bd';
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(cx - s * 0.22 + Math.cos(i * 1.26) * s * 0.04, fy - s * 0.48 + Math.sin(i * 1.26) * s * 0.04, s * 0.03, s * 0.018, i * 1.26, 0, 7);
      c.fill();
    }
    // 步搖：金簪與垂珠，末端隨時間微晃。
    const px0 = cx + s * 0.06, py0 = fy - s * 0.5, px1 = cx + s * 0.24, py1 = fy - s * 0.3;
    const gl = c.createRadialGradient(px1, py1, 1, px1, py1, s * 0.1);
    gl.addColorStop(0, `rgba(255,230,150,${0.7 + 0.25 * Math.sin(t * 3)})`);
    gl.addColorStop(1, 'rgba(255,230,150,0)');
    c.fillStyle = gl;
    c.fillRect(px1 - s * 0.1, py1 - s * 0.1, s * 0.2, s * 0.2);
    c.strokeStyle = GOLD; c.lineWidth = 2;
    c.beginPath(); c.moveTo(px0, py0); c.lineTo(px1, py1); c.stroke();
    c.fillStyle = p.gem || '#d8353f';
    c.beginPath(); c.arc(px1, py1, s * 0.025, 0, 7); c.fill();
    c.strokeStyle = 'rgba(230,185,79,.9)'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const sw = Math.sin(t * 2 + i) * 2, tx = px1 + (i - 1) * s * 0.03;
      c.beginPath(); c.moveTo(tx, py1 + s * 0.02); c.lineTo(tx + sw, py1 + s * 0.14 + i * 2); c.stroke();
      c.fillStyle = '#e8584a';
      c.beginPath(); c.arc(tx + sw, py1 + s * 0.14 + i * 2, 1.8, 0, 7); c.fill();
    }
  } else if (k === 'emp') {
    fh(hair);
    c.fillStyle = '#1d1a17';
    c.fillRect(cx - s * 0.31, fy - s * 0.5, s * 0.62, s * 0.06);
    c.fillRect(cx - s * 0.2, fy - s * 0.44, s * 0.4, s * 0.1);
    c.fillStyle = GOLD;
    for (let i = 0; i < 7; i++) {
      const bx = cx - s * 0.27 + i * s * 0.09;
      c.strokeStyle = 'rgba(230,185,79,.8)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(bx, fy - s * 0.44); c.lineTo(bx, fy - s * 0.16); c.stroke();
      for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(bx, fy - s * 0.36 + j * s * 0.08, 1.8, 0, 7); c.fill(); }
    }
  } else if (k === 'gen') {
    fh('#1a1210');
    g = c.createLinearGradient(cx - s * 0.3, 0, cx + s * 0.3, 0);
    g.addColorStop(0, '#6a7480'); g.addColorStop(0.5, '#d8dee4'); g.addColorStop(1, '#5a6470');
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, fy - s * 0.22, s * 0.3, Math.PI, 0);
    c.lineTo(cx + s * 0.3, fy - s * 0.14); c.lineTo(cx - s * 0.3, fy - s * 0.14); c.closePath(); c.fill();
    c.strokeStyle = '#2a2a30'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#d8353f';
    c.beginPath();
    c.moveTo(cx, fy - s * 0.52);
    c.quadraticCurveTo(cx + s * 0.12 + Math.sin(t * 3) * 3, fy - s * 0.62, cx + s * 0.1, fy - s * 0.74);
    c.quadraticCurveTo(cx + s * 0.02, fy - s * 0.62, cx, fy - s * 0.52);
    c.fill();
  } else {
    fh(k === 'old' ? '#cfcac0' : hair);
    c.fillStyle = k === 'dao' ? '#2a4a62' : '#1d1a17';
    if (k === 'dao') {
      c.beginPath(); c.arc(cx, fy - s * 0.4, s * 0.13, 0, 7); c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - s * 0.14, fy - s * 0.4); c.lineTo(cx + s * 0.14, fy - s * 0.4); c.stroke();
    } else {
      roundRectPath(c, cx - s * 0.26, fy - s * 0.5, s * 0.52, s * 0.2, s * 0.05);
      c.fill();
      c.beginPath();
      c.ellipse(cx - s * 0.38, fy - s * 0.36, s * 0.13, s * 0.028, 0, 0, 7);
      c.ellipse(cx + s * 0.38, fy - s * 0.36, s * 0.13, s * 0.028, 0, 0, 7);
      c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - s * 0.26, fy - s * 0.34); c.lineTo(cx + s * 0.26, fy - s * 0.34); c.stroke();
    }
  }
  c.restore();
  // 金邊外框（紅漆金邊風格）。
  roundRectPath(c, x, y, w, h, 6 * u);
  c.strokeStyle = GOLD; c.lineWidth = 2; c.stroke();
}

// 將朝臣／嬪妃／皇帝物件轉為頭像描述（只讀欄位，不改物件）。
// 皇帝 emperor；嬪妃或皇女 female；武將 general（由 general-cards 的 isGeneral 判定後傳入）。
export function personFromRecord(rec = {}, { emperor = false, female = false, general = false, robe } = {}) {
  const kind = kindOf({
    emperor,
    female: female || rec.gender === 'f' || rec.gender === 'female',
    general,
    age: rec.age,
    unknown: rec.unknown === true,
  });
  return personStyle(kind, robe ? { robe } : {});
}

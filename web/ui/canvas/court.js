// web/ui/canvas/court.js：朝堂、奏摺、朝政行動共用的 Canvas 版面元件（量測與繪製分離：每個元件先回報高度 h，再於 draw(x,y,w) 繪製）。
// 依賴：core.js（C 狀態）、input.js（hit/hovered）、widgets.js（panel/button/text/portrait/bar/plate）、theme.js、store.js。
import { C } from './core.js';
import { hit, hovered } from './input.js';
import { panel, button, text, measureLines, bar, portrait, plate, personOf } from './widgets.js';
import { GOLD, INK, LAC_TEXT, font } from './theme.js';
import { U } from '../store.js';
import { FAC, EFFECT, DIPLO_LABEL } from '../labels.js';
import { AFTER_OPTION_KEYS } from '../../../src/turn.js';
import { effectChipText } from '../../../src/effect-display.js';

export const LH = 1.45;
const u = () => C.U;

// 文字高度（與 widgets.text 的換行規則一致）。
export function textHeight(str, w, size, weight = '') {
  return measureLines(String(str), w, size, weight).length * size * LH;
}

// 文字區塊：固定寬度 w，高度依換行結果決定。
// size 為未縮放字級（乘上 C.U 後實際繪製）。
export function txt(str, w, size, o = {}) {
  const weight = o.weight || '';
  const px = size * u();
  const h = textHeight(str, w, px, weight);
  return { h, draw(x, y) { text(str, x, y, { size: px, maxW: w, weight, color: o.color, align: o.align, lh: LH }); } };
}

export function spacer(h) { return { h, draw() {} }; }

// 垂直堆疊：各項依序排列，項目間距 gap。
export function vstack(items, gap = 6 * u()) {
  const live = items.filter(Boolean);
  const h = live.reduce((s, i) => s + i.h, 0) + gap * Math.max(0, live.length - 1);
  return {
    h,
    draw(x, y, w) {
      let yy = y;
      for (const it of live) { it.draw(x, yy, w); yy += it.h + gap; }
    },
  };
}

// 水平並排：parts 為 [{w, item}]，item 已依其寬度建構；高度取最高者。
export function hrow(parts, gap = 10 * u()) {
  const h = Math.max(0, ...parts.map(p => p.item.h));
  return {
    h,
    draw(x, y) {
      let xx = x;
      for (const p of parts) { p.item.draw(xx, y, p.w); xx += p.w + gap; }
    },
  };
}

// 外框：紙本底（或紅漆 lac）包住內容；build(iw) 依內寬建構內容。
export function boxed(w, build, o = {}) {
  const p = (o.pad ?? 12) * u();
  const inner = build(w - 2 * p);
  const h = inner.h + 2 * p;
  return {
    h,
    draw(x, y) {
      panel(x, y, w, h, { lac: !!o.lac, dark: !!o.dark, r: o.r ?? 8 });
      if (o.sel) { C.ctx.save(); C.ctx.strokeStyle = GOLD; C.ctx.lineWidth = 3; C.ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); C.ctx.restore(); }
      inner.draw(x + p, y + p, w - 2 * p);
    },
  };
}

// 標籤牌（朱色）：寬度依字長。
export function tag(label, w0 = 0) {
  const size = Math.max(11, 13 * u());
  const h = size * 1.9;
  return {
    h,
    draw(x, y) {
      C.ctx.save(); C.ctx.font = font(size, 'bold');
      const tw = Math.max(w0, C.ctx.measureText(label).width + 16 * u());
      C.ctx.restore();
      plate(x, y, tw, h, label);
    },
  };
}

// 效果籤：[{t, cls}]，cls 為 up（綠）、down（朱）或空。逐列換行。
const CHIP = { up: '#1f5a3a', down: '#8a1f22', '': '#5a4a3a' };
export function chips(list, w) {
  const size = 12 * u(), pad = 8 * u(), gap = 6 * u(), rowH = 20 * u(), rowGap = 4 * u();
  const c = C.ctx;
  let rows = [[]];
  if (c) c.save();
  if (c) c.font = font(size, 'bold');
  let x = 0;
  for (const ch of list) {
    const cw = (c ? c.measureText(ch.t).width : ch.t.length * size) + pad * 2;
    if (x && x + cw > w) { rows.push([]); x = 0; }
    rows[rows.length - 1].push({ ...ch, cw });
    x += cw + gap;
  }
  if (c) c.restore();
  if (!list.length) rows = [];
  const h = rows.length * rowH + Math.max(0, rows.length - 1) * rowGap;
  return {
    h,
    draw(x0, y0) {
      rows.forEach((row, ri) => {
        let xx = x0;
        const yy = y0 + ri * (rowH + rowGap);
        for (const ch of row) {
          C.ctx.save();
          C.ctx.fillStyle = 'rgba(255,250,236,.7)';
          C.ctx.strokeStyle = CHIP[ch.cls || ''];
          C.ctx.lineWidth = 1;
          C.ctx.beginPath(); C.ctx.rect(xx, yy, ch.cw, rowH); C.ctx.fill(); C.ctx.stroke();
          C.ctx.fillStyle = CHIP[ch.cls || ''];
          C.ctx.font = font(size, 'bold'); C.ctx.textAlign = 'center'; C.ctx.textBaseline = 'middle';
          C.ctx.fillText(ch.t, xx + ch.cw / 2, yy + rowH / 2 + 1);
          C.ctx.restore();
          xx += ch.cw + gap;
        }
      });
    },
  };
}

// 按鈕（紅漆）：寬 w、高 h；off 時停用並顯示 why。
export function btn(w, label, onClick, o = {}) {
  const h = o.h ?? 36 * u();
  return {
    h,
    draw(x, y) { button(x, y, w, h, label, onClick, { off: !!o.off, why: o.why, lac: o.lac, red: o.red, fs: o.fs }); },
  };
}

// 選項卡：左側印記（mark）、標題、說明、效果籤、附加列（extra(iw) 回傳 item）。
// zhu 為紅漆底（奏摺之正式處置）；sel 為左右選取的金邊（奏摺滑動選取之替代）。點擊登記於 hit。
export function optionCard(w, o) {
  const U0 = u(), pad = 10 * U0, markW = 36 * U0;
  const iw = w - 2 * pad - markW - 8 * U0;
  const ink = o.zhu ? LAC_TEXT : INK;
  const sub = o.zhu ? 'rgba(246,230,184,.82)' : 'rgba(60,40,20,.85)';
  const parts = [txt(o.label, iw, 16, { weight: 'bold', color: ink })];
  if (o.hint) parts.push(txt(o.hint, iw, 13, { color: sub }));
  if (o.chips && o.chips.length) parts.push(chips(o.chips, iw));
  if (o.extra) parts.push(o.extra(iw));
  const body = vstack(parts, 3 * U0);
  const h = Math.max(body.h, 34 * U0) + 2 * pad;
  return {
    h,
    draw(x, y) {
      const c = C.ctx;
      const hov = !o.off && hovered(x, y, w, h);
      panel(x, y, w, h, { lac: !!o.zhu, r: 7 * U0, fill: o.zhu ? undefined : 'rgba(255,250,236,.88)' });
      if (hov) { c.save(); roundRectFill(c, x, y, w, h, 7 * U0, 'rgba(230,185,79,.16)'); c.restore(); }
      if (o.sel) { c.save(); c.strokeStyle = GOLD; c.lineWidth = 3; c.strokeRect(x + 3, y + 3, w - 6, h - 6); c.restore(); }
      c.save();
      if (o.off) c.globalAlpha = 0.45;
      const mx = x + pad + markW / 2, my = y + h / 2;
      c.beginPath(); c.arc(mx, my, markW / 2 - 2 * U0, 0, 7);
      c.fillStyle = o.zhu ? 'rgba(246,230,184,.18)' : 'rgba(163,38,42,.1)'; c.fill();
      c.strokeStyle = GOLD; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = o.zhu ? LAC_TEXT : '#8a1f22'; c.font = font(15 * U0, 'bold'); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(o.mark ?? '').slice(0, 1), mx, my + 1);
      c.restore();
      body.draw(x + pad + markW + 8 * U0, y + pad, iw);
      hit({ x, y, w, h }, o.onClick, { disabled: !!o.off, why: o.why || '目前無法執行' });
    },
  };
}

function roundRectFill(c, x, y, w, h, r, color) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath(); c.fillStyle = color; c.fill();
}

// 人物小卡：立繪、姓名、派系與官職、忠誠條；無官員池時僅顯示官職名。
export function speakerItem(sp, w) {
  const off = sp.officialId ? U.state.officials.find(o => o.id === sp.officialId) : null;
  const U0 = u();
  if (!off) return vstack([txt(sp.role, w, 14, { weight: 'bold' }), txt('官員池空缺，以官職進言', w, 12)], 4 * U0);
  const f = FAC(off.faction);
  const loy = Math.max(0, Math.min(100, off.loyalty));
  const pw = 54 * U0, ph = 62 * U0;
  const right = vstack([
    txt(off.personName || off.name, w - pw - 8 * U0, 15, { weight: 'bold' }),
    txt(`${f.l}・${sp.role}`, w - pw - 8 * U0, 12, { color: f.c }),
    txt(`忠誠 ${Math.round(off.loyalty)}`, w - pw - 8 * U0, 12),
    { h: 8 * U0, draw(x, y, ww) { bar(x, y + 1 * U0, ww, 6 * U0, loy, 100, loy < 40 ? '#a3262a' : GOLD); } },
  ], 3 * U0);
  const h = Math.max(ph, right.h);
  return {
    h,
    draw(x, y) {
      portrait(x, y, pw, ph, { ...personOf(off), robe: f.c });
      right.draw(x + pw + 8 * U0, y, w - pw - 8 * U0);
    },
  };
}

// 可能受影響之朝臣：小立繪一列。list 為官員物件陣列。
export function affectedItem(list, w) {
  const U0 = u();
  if (!list.length) return spacer(0);
  const cw = 22 * U0, ch = 26 * U0, gap = 3 * U0;
  return {
    h: ch + 4 * U0,
    draw(x, y) {
      list.forEach((o, i) => portrait(x + i * (cw + gap), y, cw, ch, { ...personOf(o), robe: FAC(o.faction).c }));
    },
  };
}

// 選項效果籤（與舊版 effChips 語意相同：只顯示方向與大小，不列精確數字）。
export function effectChipList(o) {
  const list = Object.entries(o.effects || {}).filter(([k]) => !AFTER_OPTION_KEYS.includes(k)).map(([k, v]) => {
    if (typeof v === 'boolean') return { t: EFFECT[k] || k };
    if (k === 'war') return { t: EFFECT[k] };
    if (k === 'diplomacy' && v && typeof v === 'object') return { t: `外交・${DIPLO_LABEL[v.action] || '其他'}` };
    if (typeof v !== 'number') return { t: EFFECT[k] || k };
    const t = effectChipText(k, v, EFFECT[k] || k);
    return t ? { t, cls: v > 0 ? 'up' : 'down' } : null;
  }).filter(Boolean);
  return list.length ? list : [{ t: '無直接效果' }];
}

// 文字版數值變化（供 feedback 使用，行為與舊版相同）。
export function feedbackItem(msg, w, color = '#1f5a3a') {
  if (!msg) return spacer(0);
  const U0 = u();
  return { ...txt(msg, w, 13, { color, weight: 'bold' }), h: textHeight(msg, w, 13 * U0, 'bold') + 8 * U0 };
}

export function screenInner(C0) {
  const U0 = C0.U;
  const x = C0.content.x + 16 * U0;
  const w = C0.content.w - 32 * U0;
  return { x, w, top: C0.content.y + 12 * U0, u: U0 };
}

// 內容區高度回報（供捲動）：畫完後呼叫。
export function setContentHeight(y) {
  C.contentH = Math.max(C.contentH, y - C.content.y + 24 * u());
}

// 整段繪製：items 由上而下排列並回報高度。
export function paintStack(items, x, top, w, gap = 10 * u()) {
  const s = vstack(items.filter(Boolean), gap);
  s.draw(x, top, w);
  return top + s.h;
}

export { GOLD, INK, LAC_TEXT };

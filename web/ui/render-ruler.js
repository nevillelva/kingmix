// web/ui/render-ruler.js：帝王面板（Canvas 版）。角色卡、五維雷達圖、本質與加成後對照表。
// 入口歸朝堂頁（C）：按鈕呼叫 openRuler()；朝堂畫面每幀呼叫 rulerModalFrame() 以保持對話框開啟。
// 關閉：按「返回朝堂」、點對話框外、或按 Esc（由 input.js 的 modal 處理）。
import { COLLECTIONS } from '../../src/collections.js';
import { eraName } from '../../src/era.js';
import { C } from './canvas/core.js';
import { modal } from './canvas/input.js';
import { button, panel, text } from './canvas/widgets.js';
import { GOLD, INK, RED, font } from './canvas/theme.js';
import { U } from './store.js';

// 五維：文、武、魅、健康、威望。max 為雷達圖的正規化上限（取自 state.js 的 BOUNDS）。
export const RULER_DIMS = Object.freeze([
  { key: 'literature', label: '文', max: 500 },
  { key: 'military', label: '武', max: 500 },
  { key: 'charm', label: '魅', max: 500 },
  { key: 'health', label: '健康', max: 100 },
  { key: 'prestige', label: '威望', max: 500 },
]);

// 本質（base）＝目前數值扣除已集齊收藏套組的永久加成；加成後（final）＝目前數值。
// 收藏加成於集齊時一次性寫入 stats，故可由 state.collections.bonuses 反推本質值。
export function rulerProfile(state) {
  const bonuses = state.collections?.bonuses ?? [];
  const rows = RULER_DIMS.map((d) => {
    const final = Number(state.stats?.[d.key] ?? 0);
    const bonus = Object.values(COLLECTIONS)
      .filter((set) => bonuses.includes(set.id) && set.bonus.stat === d.key)
      .reduce((sum, set) => sum + set.bonus.amount, 0);
    return { ...d, base: final - bonus, final, bonus };
  });
  const emperor = state.emperor ?? {};
  return {
    name: emperor.name || '皇帝',
    title: [`第${state.dynasty?.generation ?? 1}世`, state.era ? eraName(state) : ''].filter(Boolean).join('・'),
    rows,
  };
}

// 雷達圖各頂點座標（純函式，可測）。frac 為 0..1 的正規化值；第 i 軸自上方起順時針排列。
export function radarPoint(i, n, frac, cx, cy, R) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
}

function drawRadar(c, rows, cx, cy, R) {
  const n = rows.length;
  const poly = (vals, style) => {
    c.beginPath();
    vals.forEach((v, i) => {
      const [x, y] = radarPoint(i, n, Math.max(0, Math.min(1, v)), cx, cy, R);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    });
    c.closePath();
    if (style.fill) { c.fillStyle = style.fill; c.fill(); }
    if (style.stroke) { c.strokeStyle = style.stroke; c.lineWidth = style.lw ?? 1; c.setLineDash(style.dash || []); c.stroke(); c.setLineDash([]); }
  };
  for (const f of [0.25, 0.5, 0.75, 1]) poly(rows.map(() => f), { stroke: 'rgba(60,30,20,.2)' });
  rows.forEach((_, i) => {
    const [x, y] = radarPoint(i, n, 1, cx, cy, R);
    c.strokeStyle = 'rgba(60,30,20,.2)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke();
  });
  poly(rows.map((r) => r.base / r.max), { stroke: 'rgba(60,30,20,.6)', dash: [4, 3] });
  poly(rows.map((r) => r.final / r.max), { fill: 'rgba(179,38,30,.22)', stroke: RED, lw: 2 });
  c.fillStyle = INK; c.font = font(13 * C.U); c.textAlign = 'center'; c.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const [x, y] = radarPoint(i, n, 1.22, cx, cy, R);
    c.fillText(r.label, x, y);
  });
}

// 對話框內容（固定版面）。
export function drawRulerDialog(cc = C, u = U) {
  const ctx = cc.ctx, S = cc.U;
  if (!u.state) return;
  const p = rulerProfile(u.state);
  const m = 22 * S;
  const w = Math.min(cc.W - 2 * m, 520 * S);
  const radarR = 80 * S, radarH = radarR * 2 + 44 * S;
  const rowH = 26 * S;
  const h = 64 * S + radarH + (rowH * (p.rows.length + 2)) + 64 * S;
  const x = (cc.W - w) / 2, y = Math.max(m, (cc.H - h) / 2);
  panel(x, y, w, h, { block: true, r: 10 });

  // 角色頭：紅印與名號。
  const sealS = 46 * S;
  ctx.fillStyle = RED; ctx.fillRect(x + 16 * S, y + 16 * S, sealS, sealS);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.4; ctx.strokeRect(x + 19 * S, y + 19 * S, sealS - 6 * S, sealS - 6 * S);
  ctx.fillStyle = '#f1e6c8'; ctx.font = font(sealS * 0.55, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('帝', x + 16 * S + sealS / 2, y + 16 * S + sealS / 2 + 1);
  text(p.name, x + 76 * S, y + 14 * S, { size: 20 * S, weight: 'bold', color: INK, maxW: w - 100 * S });
  text(p.title, x + 76 * S, y + 42 * S, { size: 13 * S, color: '#8a6a2a', maxW: w - 100 * S });

  // 雷達圖（左）與表格（右下）。
  const cx = x + w / 2, cy = y + 64 * S + radarR + 24 * S;
  drawRadar(ctx, p.rows, cx, cy, radarR);
  let ty = y + 64 * S + radarH + 6 * S;
  const colX = [x + 24 * S, x + w * 0.5, x + w * 0.78];
  ctx.font = font(13 * S); ctx.fillStyle = '#8a6a2a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('屬性', colX[0], ty + rowH / 2);
  ctx.fillText('本質', colX[1], ty + rowH / 2);
  ctx.fillText('加成後', colX[2], ty + rowH / 2);
  ty += rowH;
  for (const r of p.rows) {
    ctx.fillStyle = INK; ctx.font = font(14 * S);
    ctx.fillText(r.label, colX[0], ty + rowH / 2);
    ctx.fillText(String(r.base), colX[1], ty + rowH / 2);
    ctx.fillText(String(r.final), colX[2], ty + rowH / 2);
    if (r.bonus) { ctx.fillStyle = '#8a6a2a'; ctx.font = font(12 * S); ctx.fillText(`（+${r.bonus}）`, colX[2] + 46 * S, ty + rowH / 2); }
    ty += rowH;
  }
  button(x + w / 2 - 80 * S, y + h - 52 * S, 160 * S, 36 * S, '返回朝堂', () => closeRuler(), { fs: 14 * S });
}

// 開啟與關閉（模組層級的開關；不寫入存檔）。
let open = false;
export function openRuler() { open = true; }
export function closeRuler() { open = false; }
export function isRulerOpen() { return open; }

// 朝堂畫面每幀呼叫：開啟中則請求對話框（modal 於本幀結束時繪製）。
export function rulerModalFrame() {
  if (!open) return;
  modal((c2) => drawRulerDialog(c2), () => closeRuler());
}

// ── 舊 DOM 相容（待 C 改寫 render-court.js 後移除）──
export function rulerEntryHTML() {
  return '<button type="button" class="btn ghost mini" data-ruler="open">帝王面板</button>';
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-ruler="open"]')) openRuler();
  });
}

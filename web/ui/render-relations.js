// web/ui/render-relations.js：朝臣關係圖（Canvas 版）。派系為分區，邊依關係種類以不同線型呈現（師生、姻親、孿敵）。
// 資料來自 src/relations.js 的 relationsForGraph(state)；無資料時顯示佔位說明。
import { relationsForGraph } from '../../src/relations.js';
import { U } from './store.js';
import { FAC } from './labels.js';
import { C } from './canvas/core.js';
import { INK, font } from './canvas/theme.js';

// 引擎的關係種類（src/relations.js 的 REL_KINDS）對應之圖例名稱與線型。
const KIND_LABEL = { teacher: '師生', marriage: '姻親', rival: '孿敵' };
const KIND = {
  師生: { stroke: '#4E7D5B', width: 2.4, dash: [] },
  姻親: { stroke: '#B48A3C', width: 2, dash: [6, 4] },
  孿敵: { stroke: '#A23B2A', width: 2.4, dash: [1, 3] },
};
const kindOf = (e) => KIND_LABEL[e.kind] ?? e.kind ?? '';

export function relationsGraph(state = U.state) {
  if (!state) return null;
  try { return relationsForGraph(state) || null; } catch (e) { return null; }
}

// 版面（純函式，可測）：依派系分區，各區橫排；回傳總高（邏輯像素，已乘 U）與各節點座標。
export function relationsLayout(g, w, S = 1) {
  const pad = 12 * S, cell = 120 * S, nodeOff = 60 * S;
  const zoneMin = 150 * S, rowH = 90 * S, headH = 40 * S, legendH = 22 * S;
  const perRow = Math.max(1, Math.floor((w - 2 * pad - nodeOff) / cell) + 1);
  const factions = [...new Set(g.nodes.map((n) => n.faction ?? '—'))];
  const zones = [];
  const pos = {};
  let y = legendH + pad;
  for (const f of factions) {
    const members = g.nodes.filter((n) => (n.faction ?? '—') === f);
    const rows = Math.ceil(members.length / perRow);
    const h = Math.max(zoneMin, rows * rowH + headH);
    zones.push({ f, x: pad, y, w: w - 2 * pad, h, color: FAC(f).c, label: FAC(f).l });
    members.forEach((n, i) => {
      pos[n.id] = { x: pad + nodeOff + (i % perRow) * cell, y: y + 50 * S + Math.floor(i / perRow) * rowH };
    });
    y += h + pad;
  }
  return { h: y, zones, pos };
}

// 關係圖區塊（供卡片堆疊）：先圖例，再分區、邊、節點。資料缺失時回傳佔位文字區塊。
export function relationsBlock(state = U.state, w = 0) {
  const g = relationsGraph(state);
  if (!g || !Array.isArray(g.nodes) || g.nodes.length === 0) {
    return { t: 'text', s: '關係資料尚未就緒。' };
  }
  const S = C.U || 1;
  const lay = relationsLayout(g, w, S);
  return {
    t: 'custom',
    h: lay.h,
    fn: (x, y) => drawGraph(x, y, g, lay),
  };
}

function drawGraph(x0, y0, g, lay) {
  const c = C.ctx, S = C.U;
  // 圖例
  c.font = font(12 * S); c.textBaseline = 'middle'; c.textAlign = 'left';
  let lx = x0;
  for (const [k, v] of Object.entries(KIND)) {
    c.strokeStyle = v.stroke; c.lineWidth = v.width; c.setLineDash(v.dash);
    c.beginPath(); c.moveTo(lx, y0 + 10 * S); c.lineTo(lx + 30 * S, y0 + 10 * S); c.stroke();
    c.setLineDash([]);
    c.fillStyle = INK; c.fillText(k, lx + 36 * S, y0 + 10 * S);
    lx += 96 * S;
  }
  // 分區底色
  for (const z of lay.zones) {
    c.fillStyle = z.color; c.globalAlpha = 0.07;
    roundRect(c, x0 + z.x, y0 + z.y, z.w, z.h, 10 * S); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = z.color; c.globalAlpha = 0.5; c.lineWidth = 1;
    roundRect(c, x0 + z.x, y0 + z.y, z.w, z.h, 10 * S); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = z.color; c.font = font(13 * S, 'bold'); c.fillText(z.label, x0 + z.x + 10 * S, y0 + z.y + 14 * S);
  }
  // 邊
  for (const e of g.edges || []) {
    const a = lay.pos[e.a], b = lay.pos[e.b], st = KIND[kindOf(e)];
    if (!a || !b || !st) continue;
    c.strokeStyle = st.stroke; c.lineWidth = st.width; c.setLineDash(st.dash.map((d) => d * S));
    c.beginPath(); c.moveTo(x0 + a.x, y0 + a.y); c.lineTo(x0 + b.x, y0 + b.y); c.stroke();
  }
  c.setLineDash([]);
  // 節點（壓在線之上）
  for (const n of g.nodes) {
    const p = lay.pos[n.id];
    if (!p) continue;
    const color = FAC(n.faction ?? '—').c;
    c.beginPath(); c.arc(x0 + p.x, y0 + p.y, 22 * S, 0, Math.PI * 2);
    c.fillStyle = '#f1e6c8'; c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.stroke();
    c.fillStyle = INK; c.font = font(13 * S); c.textAlign = 'center';
    c.fillText(String(n.name ?? n.personName ?? n.id).slice(0, 3), x0 + p.x, y0 + p.y);
    c.textAlign = 'left';
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// web/ui/render-relations.js：朝臣關係圖。派系為分區，邊依關係種類以不同線型呈現（師生、姻親、孿敵）。
// 資料來自 src/relations.js 的 relationsForGraph(state)；該模組未合入前顯示佔位說明。
import { U } from './store.js';
import { esc } from './util.js';
import { FAC } from './labels.js';
import { engine, has } from './render-cards.js';

// 引擎的關係種類（src/relations.js 的 REL_KINDS）對應之圖例名稱與線型。
const KIND_LABEL = { teacher: '師生', marriage: '姻親', rival: '孿敵' };
const KIND = {
  師生: { stroke: '#4E7D5B', width: 2.4, dash: '' },
  姻親: { stroke: '#B48A3C', width: 2, dash: '6 4' },
  孿敵: { stroke: '#A23B2A', width: 2.4, dash: '1 3' },
};
// 邊資料形如 { a, b, kind }（relationsForGraph 的輸出）。
const kindOf = (e) => KIND_LABEL[e.kind] ?? e.kind ?? '';

export function relationsGraph() {
  if (!has('relationsForGraph')) return null;
  try { return engine.relationsForGraph(U.state) || null; } catch (e) { return null; }
}

export function renderRelationsCard() {
  const g = relationsGraph();
  const legend = Object.entries(KIND).map(([k, v]) =>
    `<span><svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="${v.stroke}" stroke-width="${v.width}" stroke-dasharray="${v.dash}"/></svg>${k}</span>`).join('');
  if (!g || !Array.isArray(g.nodes) || g.nodes.length === 0) {
    return `<section class="card" data-relations="pending"><h2>朝臣關係圖</h2>
      <p class="empty">關係資料尚未就緒（待 src/relations.js 合入）。</p></section>`;
  }
  // 依派系分區，各區橫排。
  const factions = [...new Set(g.nodes.map((n) => n.faction ?? '—'))];
  const W = 760, zoneH = 150, pad = 12;
  const pos = {};
  let y = pad;
  const rects = [], nodesSvg = [];
  factions.forEach((f) => {
    const members = g.nodes.filter((n) => (n.faction ?? '—') === f);
    const perRow = Math.max(1, Math.floor((W - 2 * pad) / 120));
    const rows = Math.ceil(members.length / perRow);
    const h = Math.max(zoneH, rows * 90 + 40);
    const color = FAC(f).c;
    rects.push(`<rect x="${pad}" y="${y}" width="${W - 2 * pad}" height="${h}" rx="10" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-opacity="0.5"/>
      <text x="${pad + 10}" y="${y + 18}" fill="${color}" font-size="13">${esc(FAC(f).l)}</text>`);
    members.forEach((n, i) => {
      const cx = pad + 60 + (i % perRow) * 120, cy = y + 50 + Math.floor(i / perRow) * 90;
      pos[n.id] = { x: cx, y: cy };
    });
    members.forEach((n) => { const p = pos[n.id];
      nodesSvg.push(`<g><circle cx="${p.x}" cy="${p.y}" r="22" fill="var(--paper)" stroke="${color}" stroke-width="2"/>
        <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="13" fill="var(--ink)">${esc((n.name ?? n.personName ?? n.id).slice(0, 3))}</text></g>`); });
    y += h + pad;
  });
  const edges = (g.edges || []).map((e) => {
    const a = pos[e.a], b = pos[e.b];
    const st = KIND[kindOf(e)];
    if (!a || !b || !st) return '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${st.stroke}" stroke-width="${st.width}" stroke-dasharray="${st.dash}"><title>${esc(kindOf(e))}</title></line>`;
  }).join('');
  // 分區底色、邊、節點依序繪製，使節點壓在線之上。
  const svg = `<svg viewBox="0 0 ${W} ${y}" width="100%" role="img" aria-label="朝臣關係圖">${rects.join('')}${edges}${nodesSvg.join('')}</svg>`;
  return `<section class="card" data-relations="ready"><h2>朝臣關係圖</h2>
    <div class="legend">${legend}</div>${svg}</section>`;
}

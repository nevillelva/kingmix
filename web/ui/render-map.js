// web/ui/render-map.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { ensureCity } from '../../src/city.js';
import { NEIGHBORS, diplomacyOf } from '../../src/diplomacy.js';
import { PREFECTURE_DEFS, governorOf } from '../../src/economy.js';
import { U, app } from './store.js';
import { esc } from './util.js';
import { render } from './render-nav.js';

// ── 全國輿圖：六府依城防著色，鄰國列於邊界；點州府看詳情，點鄰國開外交面板 ──
// 示意版圖（非實際地理比例）；座標僅供排版。民心為全國單一數值，不分府。
export const MAP_SHAPE = {
  pref: {
    jingzhao: { d: 'M60 100 L120 92 L124 150 L100 168 L64 160 Z', x: 92, y: 134 },
    hedong: { d: 'M124 60 L186 56 L196 118 L150 126 L124 112 Z', x: 160, y: 94 },
    denglai: { d: 'M206 56 L262 40 L300 70 L292 118 L240 112 L210 96 Z', x: 254, y: 84 },
    yangzhou: { d: 'M214 128 L270 124 L286 176 L238 190 L210 160 Z', x: 248, y: 160 },
    yizhou: { d: 'M60 184 L118 176 L124 240 L92 262 L56 236 Z', x: 90, y: 222 },
    jiangning: { d: 'M140 196 L200 190 L216 240 L178 262 L142 240 Z', x: 178, y: 230 },
  },
  nb: {
    north: { d: 'M40 14 L300 10 L300 32 L40 36 Z', x: 170, y: 26 },
    west: { d: 'M14 96 L48 88 L50 236 L18 244 Z', x: 30, y: 168 },
    south: { d: 'M50 286 L300 290 L290 314 L50 310 Z', x: 170, y: 304 },
    east: { d: 'M304 190 L330 184 L330 262 L304 262 Z', x: 318, y: 226 },
  },
};

export const fillForDefense = v => (v < 40 ? '#D9A397' : v < 70 ? '#E6D39A' : '#B7D3B2');

export function renderMap(){
  const prefs = ensureCity(U.state);
  const d = diplomacyOf(U.state);
  const people = Math.round(U.state.stats.people);
  const zones = PREFECTURE_DEFS.map(def => {
    const p = prefs.find(x => x.id === def.id);
    const def2 = Math.round(p?.defense ?? 50);
    const sh = MAP_SHAPE.pref[def.id];
    return `<g class="mzone${U.mapSel === def.id ? ' sel' : ''}" role="button" tabindex="0" data-pref="${def.id}" aria-label="${esc(def.name)}，城防 ${def2}">
      <path d="${sh.d}" fill="${fillForDefense(def2)}"/>
      <text x="${sh.x}" y="${sh.y}" text-anchor="middle">${esc(def.name)}</text>
      <text class="mv" x="${sh.x}" y="${sh.y + 14}" text-anchor="middle">城防 ${def2}</text></g>`;
  }).join('');
  const edges = NEIGHBORS.map(n => {
    const sh = MAP_SHAPE.nb[n.id];
    const s = d[n.id];
    const tag = s.allied ? '盟' : s.kin > 0 ? '婚' : '';
    return `<g class="medge" role="button" tabindex="0" data-nb="${n.id}" aria-label="${esc(n.name)}，好感 ${s.attitude}，開外交面板">
      <path d="${sh.d}"/>
      <text x="${sh.x}" y="${sh.y}" text-anchor="middle">${esc(n.name)}</text>
      <text class="mv" x="${sh.x}" y="${sh.y + 14}" text-anchor="middle">好感 ${s.attitude}${tag ? ' ' + tag : ''}</text></g>`;
  }).join('');
  const p = prefs.find(x => x.id === U.mapSel);
  const def = PREFECTURE_DEFS.find(x => x.id === U.mapSel);
  const gov = p && def ? governorOf(U.state, p) : null;
  const detail = p && def ? `<div class="pdetail">
      <div class="name">${esc(def.name)}</div>
      <div class="loy">知府 ${esc(gov?.personName || gov?.name || p.governor?.name || '—')}　政 ${esc(gov?.abilities?.politics ?? p.governor?.abilities?.politics ?? '—')}　${p.output === 'agriculture' ? '農產' : '商產'}</div>
      <div class="kicker" style="margin:8px 0 2px">城防 ${Math.round(p.defense ?? 50)}　產值 ${Number(p.yield || 0).toFixed(2)}</div>
      <div class="track"><div class="fill${(p.defense ?? 50) < 40 ? ' warn' : ''}" style="width:${Math.max(0, Math.min(100, p.defense ?? 50))}%"></div></div>
      <button class="btn ghost" data-go-city="1">前往朝堂修繕城池</button>
    </div>` : `<p class="sub" style="margin:10px 0 0">點選州府，檢視其知府與城防。</p>`;
  app.innerHTML = `
    <section class="card"><h2>全國輿圖</h2>
      <div class="sub">民心 ${people}（全國）　城防色：<span class="swatch" style="background:#D9A397"></span>低　<span class="swatch" style="background:#E6D39A"></span>中　<span class="swatch" style="background:#B7D3B2"></span>高</div>
      <div class="plan map">
        <svg viewBox="0 0 340 322" role="group" aria-label="全國輿圖，六府與四鄰">
          ${edges}
          ${zones}
        </svg>
      </div>
      ${detail}
    </section>`;
  app.querySelectorAll('[data-pref]').forEach(g => {
    const go = () => { U.mapSel = g.dataset.pref; render(); };
    g.onclick = go;
    g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  app.querySelectorAll('[data-nb]').forEach(g => {
    const go = () => { U.tab = 'court'; U.panel = 'diplo'; U.pick1 = null; render(); };
    g.onclick = go;
    g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  const cityBtn = app.querySelector('[data-go-city]');
  if (cityBtn) cityBtn.onclick = () => { U.tab = 'court'; U.panel = 'city'; U.pick1 = null; render(); };
}

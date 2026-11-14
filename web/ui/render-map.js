// web/ui/render-map.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { ensureCity } from '../../src/city.js';
import { NEIGHBORS, diplomacyOf } from '../../src/diplomacy.js';
import { PREFECTURE_DEFS, governorOf } from '../../src/economy.js';
import { U, app } from './store.js';
import { esc } from './util.js';
import { render } from './render-nav.js';
import { save } from './state-io.js';
import { INK_DEFS, INK_BACKDROP, MAP_CSS, governorBadge, defenseFill, peopleFill } from './map-svg.js';

// 巡幸引擎（src/tour.js）與本檔平行開發：以動態匯入防禦式載入，尚未合入時退回待接線狀態。
const tour = await import('../../src/tour.js').catch(() => null);
const hasTour = !!tour && typeof tour.tourTo === 'function';

// ── 全國輿圖：六府依城防著色、府印顯示知府首字，鄰國列於邊界；點州府看詳情，點鄰國開外交面板 ──
// 示意版圖（非實際地理比例）；座標僅供排版。民心為全國單一數值，不分府。
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

// 知府姓名首字：優先 personName，其次 name，缺漏時回「—」。
const initialOf = (gov, p) => (gov?.personName || gov?.name || p?.governor?.name || '—').slice(0, 1);

// 巡幸狀態與事件：引擎函式存在才呼叫，回傳格式不明時只取可讀字串。
function tourStatusText(state, id) {
  if (!tour || typeof tour.prefectureStatus !== 'function') return null;
  try {
    const r = tour.prefectureStatus(state);
    const row = Array.isArray(r) ? r.find(x => x?.id === id) : r?.[id];
    return row?.text || row?.label || row?.status || (typeof row === 'string' ? row : null);
  } catch (e) { return null; }
}
function tourEventLines(state, id) {
  if (!tour || typeof tour.tourEvents !== 'function') return [];
  try {
    const list = tour.tourEvents(state) || [];
    return list.filter(e => !e?.prefId || e.prefId === id).slice(-3).map(e => e?.text || e?.msg || String(e));
  } catch (e) { return []; }
}

export function renderMap(){
  const prefs = ensureCity(U.state);
  const d = diplomacyOf(U.state);
  const people = Math.round(U.state.stats.people);
  const zones = PREFECTURE_DEFS.map(def => {
    const p = prefs.find(x => x.id === def.id);
    const def2 = Math.round(p?.defense ?? 50);
    const sh = MAP_SHAPE.pref[def.id];
    const gov = p ? governorOf(U.state, p) : null;
    const sel = U.mapSel === def.id;
    return `<g class="mzone${sel ? ' sel' : ''}" role="button" tabindex="0" data-pref="${def.id}" aria-label="${esc(def.name)}，城防 ${def2}，知府 ${esc(gov?.personName || gov?.name || '缺')}">
      <path d="${sh.d}" fill="${defenseFill(def2)}" filter="url(#ink-wash)"/>
      <text x="${sh.x}" y="${sh.y}" text-anchor="middle">${esc(def.name)}</text>
      <text class="mv" x="${sh.x}" y="${sh.y + 14}" text-anchor="middle">城防 ${def2}</text>
      ${governorBadge(sh.b[0], sh.b[1], initialOf(gov, p))}</g>`;
  }).join('');
  const edges = NEIGHBORS.map(n => {
    const sh = MAP_SHAPE.nb[n.id];
    const s = d[n.id];
    const tag = s.allied ? '盟' : s.kin > 0 ? '婚' : '';
    return `<g class="medge" role="button" tabindex="0" data-nb="${n.id}" aria-label="${esc(n.name)}，好感 ${s.attitude}，開外交面板">
      <path d="${sh.d}" filter="url(#ink-edge)"/>
      <text x="${sh.x}" y="${sh.y}" text-anchor="middle">${esc(n.name)}</text>
      <text class="mv" x="${sh.x}" y="${sh.y + 14}" text-anchor="middle">好感 ${s.attitude}${tag ? ' ' + tag : ''}</text></g>`;
  }).join('');

  const p = prefs.find(x => x.id === U.mapSel);
  const def = PREFECTURE_DEFS.find(x => x.id === U.mapSel);
  const gov = p && def ? governorOf(U.state, p) : null;
  const defense = Math.max(0, Math.min(100, Math.round(p?.defense ?? 50)));
  const statusText = p && def ? tourStatusText(U.state, def.id) : null;
  const events = p && def ? tourEventLines(U.state, def.id) : [];
  const detail = p && def ? `<div class="pdetail">
      <div class="name">${esc(def.name)}</div>
      <div class="row">知府 ${esc(gov?.personName || gov?.name || p.governor?.name || '缺')}　政 ${esc(gov?.abilities?.politics ?? p.governor?.abilities?.politics ?? '—')}　${p.output === 'agriculture' ? '農產' : '商產'}</div>
      <div class="row">城防 ${defense}　產值 ${Number(p.yield || 0).toFixed(2)}</div>
      <div class="track"><div class="fill${defense < 40 ? ' warn' : ''}" style="width:${defense}%"></div></div>
      ${statusText ? `<div class="row">${esc(statusText)}</div>` : ''}
      ${events.length ? `<ul class="row" style="padding-left:18px">${events.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        <button class="btn" data-tour="${def.id}" ${hasTour ? '' : 'disabled aria-disabled="true"'}>${hasTour ? '巡幸' : '巡幸（巡幸功能待接線）'}</button>
        <button class="btn ghost" data-go-city="1">前往朝堂修繕城池</button>
      </div>
    </div>` : `<div class="pdetail"><p class="sub" style="margin:0">點選州府，檢視其知府、城防與巡幸狀況。點邊界鄰國可開外交面板。</p></div>`;

  app.innerHTML = `
    ${MAP_CSS}
    <section class="card"><h2>全國輿圖</h2>
      <div class="legend" style="margin-bottom:8px">
        <span>民心 <b style="color:${peopleFill(people)}">${people}</b>（全國）</span>
        <span><i style="background:${defenseFill(10)}"></i>城防低</span>
        <span><i style="background:${defenseFill(50)}"></i>中</span>
        <span><i style="background:${defenseFill(90)}"></i>高</span>
      </div>
      <div class="map-wrap">
        <div class="plan map">
          <svg viewBox="0 0 340 322" role="group" aria-label="全國輿圖，六府與四鄰">
            ${INK_DEFS}
            ${INK_BACKDROP}
            ${edges}
            ${zones}
          </svg>
        </div>
        ${detail}
      </div>
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
  const tourBtn = app.querySelector('[data-tour]');
  if (tourBtn && hasTour) tourBtn.onclick = () => {
    try {
      tour.tourTo(U.state, tourBtn.dataset.tour);
      save();
      render();
    } catch (e) {
      const msg = app.querySelector('.pdetail');
      if (msg) msg.insertAdjacentHTML('beforeend', `<p class="sub" style="margin:8px 0 0">巡幸未成：${esc(e?.message || String(e))}</p>`);
    }
  };
  const cityBtn = app.querySelector('[data-go-city]');
  if (cityBtn) cityBtn.onclick = () => { U.tab = 'court'; U.panel = 'city'; U.pick1 = null; render(); };
}

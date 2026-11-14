// web/ui/render-palace.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U, app } from './store.js';
import { campaignActive, morningPair, pendingCase } from './game-flow.js';
import { esc, levelWord } from './util.js';
import { render } from './render-nav.js';
import { FACILITIES, facilityLevels } from '../../src/facilities.js';

// 宮城引擎（src/palace.js：pendingMarks、seasonFor）可能尚未合入；以動態匯入防護，缺漏時宮城照常呈現。
let engine = {};
import('../../src/palace.js').then(m => {
  engine = m;
  if (U.state && U.tab === 'palace') render();
}, () => {});

// ── 宮城平面圖：點選宮室即前往對應分頁 ──
// 待批件數：東廠密報或戰事優先；否則為早朝的第一則與次奏（未留中者）。
export function pendingMemorials(){
  if (!U.state || !U.state.alive) return 0;
  if (pendingCase() || campaignActive()) return 1;
  const p = morningPair();
  return (p.first ? 1 : 0) + (p.second && !p.secondDone ? 1 : 0);
}

// 紅點：pendingMarks(state) 所列之宮室（可為宮室代號、分頁名，或含 id 的物件）。
function markedSet(){
  if (typeof engine.pendingMarks !== 'function' || !U.state) return new Set();
  try {
    const out = new Set();
    for (const x of Array.from(engine.pendingMarks(U.state) ?? [])) {
      const v = typeof x === 'string' ? x : x && (x.zone ?? x.building ?? x.id ?? x.t);
      if (v) out.add(v);
    }
    return out;
  } catch { return new Set(); }
}

// 季節色：seasonFor(state)；缺漏時沿用 applySeason 已設定之 html[data-season]。
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
function seasonOf(){
  let s = null;
  if (typeof engine.seasonFor === 'function' && U.state) {
    try { s = engine.seasonFor(U.state); } catch { s = null; }
  }
  s = s || document.documentElement.dataset.season || '';
  return SEASONS.includes(s) ? s : '';
}

// 設施空地：三處設施位於宮城西側與東北側，未營造時顯示為空地，點選即開啟營造面板。
const FACILITY_PLOTS = [
  {id:'garden',  x:22,  y:128, w:66, h:48},
  {id:'medical', x:22,  y:184, w:66, h:48},
  {id:'academy', x:232, y:128, w:66, h:48},
];

export function renderPalace(){
  const openCases = U.state.dongchang.cases.filter(c => c.status !== 'closed').length;
  const pend = pendingMemorials();
  const marks = markedSet();
  const season = seasonOf();
  const Z = [
    {id:'yushu', n:'御書房', s:`史冊 ${(U.state.annals||[]).length}`, t:'throne', x:22, y:40, w:66, h:78},
    {id:'houggong', n:'後宮', s:`嬪妃 ${(U.state.consorts||[]).length} / 8`, t:'harem', x:100, y:40, w:120, h:78},
    {id:'cining', n:'慈寧宮', s:`子嗣 ${(U.state.heirs||[]).length}`, t:'harem', x:232, y:40, w:66, h:78},
    {id:'taihe', n:'太和殿', s: pend ? `待批 ${pend} 件` : '朝會・御批', t:'court', x:100, y:128, w:120, h:104, hall:true},
    {id:'jiaochang', n:'校場', s:`軍備 ${levelWord('armament')}`, t:'officials', x:22, y:250, w:92, h:106},
    {id:'dongchang', n:'東廠', s:`進行中 ${openCases} 案`, t:'dc', x:206, y:250, w:92, h:106},
  ];
  const marked = z => marks.has(z.id) || marks.has(z.t);
  const zone = z => {
    const cx = z.x + z.w/2, cy = z.y + z.h/2;
    const dot = marked(z) ? `<circle class="mdot" cx="${z.x + z.w - 9}" cy="${z.y + 9}" r="5"/>` : '';
    return `<g class="zone" role="button" tabindex="0" data-tab="${z.t}" aria-label="${z.n}，${esc(z.s)}${marked(z) ? '，有待批事' : ''}">
      <rect class="${z.hall ? 'tile hall' : 'tile'}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="5"/>
      <text class="${z.hall ? 'hallname' : ''}" x="${cx}" y="${z.hall ? cy-4 : cy-2}" text-anchor="middle">${z.n}</text>
      <text class="sm" x="${cx}" y="${cy+16}" text-anchor="middle">${esc(z.s)}</text>${dot}</g>`;
  };
  const facilities = facilityLevels(U.state);
  const plot = p => {
    const def = FACILITIES[p.id];
    const level = facilities[p.id] || 0;
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    const empty = level === 0;
    const label = empty ? '空地・可營造' : `第 ${level} 級`;
    return `<g class="zone plot${empty ? ' empty' : ''}" role="button" tabindex="0" data-facility="${p.id}" aria-label="${def.name}，${label}">
      <rect class="tile" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="5"/>
      <text x="${cx}" y="${cy-2}" text-anchor="middle">${def.name}</text>
      <text class="sm" x="${cx}" y="${cy+12}" text-anchor="middle">${empty ? '點選營造' : esc(label)}</text></g>`;
  };
  app.innerHTML = `
    <section class="card"><h2>宮城</h2>
      <p class="sub">點選宮室，前往其所主之事。</p>
      <div class="plan${season ? ' season-' + season : ''}">
        <svg viewBox="0 0 320 380" role="group" aria-label="宮城平面圖">
          <rect class="wall" x="10" y="10" width="300" height="360" rx="6"/>
          <path class="gate" d="M140 10 L180 10"/>
          <path class="gate" d="M140 370 L180 370"/>
          <text class="compass" x="160" y="28" text-anchor="middle">午門</text>
          <text class="compass" x="160" y="364" text-anchor="middle">玄武門</text>
          ${Z.map(zone).join('')}
          ${FACILITY_PLOTS.map(plot).join('')}
          <text class="sm" x="160" y="264" text-anchor="middle">午朝廣場</text>
          ${season ? '<rect class="season" x="10" y="10" width="300" height="360" rx="6"/>' : ''}
        </svg>
      </div>
      <p class="sub" style="margin:10px 0 0">太和殿處理朝政奏摺；御書房（史冊與帝王）、校場（朝臣任免）、後宮與慈寧宮（嬪妃與子嗣）、東廠各司其事；空地可營造宮內設施。</p>
      <button class="btn ghost" data-go-map="1">展開全國輿圖</button>
      <button class="btn ghost" data-go-facility="1">營造宮內設施</button>
    </section>`;
  app.querySelector('[data-go-map]').onclick = () => { U.tab = 'map'; U.panel = null; U.pick1 = null; render(); };
  app.querySelector('[data-go-facility]').onclick = () => { U.tab = 'facility'; U.panel = null; U.pick1 = null; render(); };
  app.querySelectorAll('g.zone').forEach(g => {
    const go = () => {
      if (g.dataset.facility) U.tab = 'facility'; else U.tab = g.dataset.tab;
      U.panel = null; U.pick1 = null; render();
    };
    g.onclick = go;
    g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

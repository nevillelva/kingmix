// web/ui/render-palace.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U, app } from './store.js';
import { campaignActive, morningPair, pendingCase } from './game-flow.js';
import { esc, levelWord } from './util.js';
import { render } from './render-nav.js';

// ── 宮城平面圖：點選宮室即前往對應分頁 ──
// 待批件數：東廠密報或戰事優先；否則為早朝的第一則與次奏（未留中者）。
export function pendingMemorials(){
  if (!U.state || !U.state.alive) return 0;
  if (pendingCase() || campaignActive()) return 1;
  const p = morningPair();
  return (p.first ? 1 : 0) + (p.second && !p.secondDone ? 1 : 0);
}

export function renderPalace(){
  const openCases = U.state.dongchang.cases.filter(c => c.status !== 'closed').length;
  const pend = pendingMemorials();
  const Z = [
    {id:'yushu', n:'御書房', s:`史冊 ${(U.state.annals||[]).length}`, t:'throne', x:22, y:40, w:66, h:78},
    {id:'houggong', n:'後宮', s:`嬪妃 ${(U.state.consorts||[]).length} / 8`, t:'harem', x:100, y:40, w:120, h:78},
    {id:'cining', n:'慈寧宮', s:`子嗣 ${(U.state.heirs||[]).length}`, t:'harem', x:232, y:40, w:66, h:78},
    {id:'taihe', n:'太和殿', s: pend ? `待批 ${pend} 件` : '朝會・御批', t:'court', x:100, y:128, w:120, h:104, hall:true},
    {id:'jiaochang', n:'校場', s:`軍備 ${levelWord('armament')}`, t:'officials', x:22, y:250, w:92, h:106},
    {id:'dongchang', n:'東廠', s:`進行中 ${openCases} 案`, t:'dc', x:206, y:250, w:92, h:106},
  ];
  const zone = z => {
    const cx = z.x + z.w/2, cy = z.y + z.h/2;
    return `<g class="zone" role="button" tabindex="0" data-tab="${z.t}" aria-label="${z.n}，${esc(z.s)}">
      <rect class="${z.hall ? 'tile hall' : 'tile'}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="5"/>
      <text class="${z.hall ? 'hallname' : ''}" x="${cx}" y="${z.hall ? cy-4 : cy-2}" text-anchor="middle">${z.n}</text>
      <text class="sm" x="${cx}" y="${cy+16}" text-anchor="middle">${esc(z.s)}</text></g>`;
  };
  app.innerHTML = `
    <section class="card"><h2>宮城</h2>
      <p class="sub">點選宮室，前往其所主之事。</p>
      <div class="plan">
        <svg viewBox="0 0 320 380" role="group" aria-label="宮城平面圖">
          <rect class="wall" x="10" y="10" width="300" height="360" rx="6"/>
          <path class="gate" d="M140 10 L180 10"/>
          <path class="gate" d="M140 370 L180 370"/>
          <text class="compass" x="160" y="28" text-anchor="middle">午門</text>
          <text class="compass" x="160" y="364" text-anchor="middle">玄武門</text>
          ${Z.map(zone).join('')}
          <text class="sm" x="160" y="264" text-anchor="middle">午朝廣場</text>
        </svg>
      </div>
      <p class="sub" style="margin:10px 0 0">太和殿處理朝政奏摺；御書房（史冊與帝王）、校場（朝臣任免）、後宮與慈寧宮（嬪妃與子嗣）、東廠各司其事。</p>
      <button class="btn ghost" data-go-map="1">展開全國輿圖</button>
      <button class="btn ghost" data-go-facility="1">營造宮內設施</button>
    </section>`;
  app.querySelector('[data-go-map]').onclick = () => { U.tab = 'map'; U.panel = null; U.pick1 = null; render(); };
  app.querySelector('[data-go-facility]').onclick = () => { U.tab = 'facility'; U.panel = null; U.pick1 = null; render(); };
  app.querySelectorAll('g.zone').forEach(g => {
    const go = () => { U.tab = g.dataset.tab; U.panel = null; U.pick1 = null; render(); };
    g.onclick = go;
    g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

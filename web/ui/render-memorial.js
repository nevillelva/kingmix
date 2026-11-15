// web/ui/render-memorial.js：奏摺、次奏與左右滑動裁決（由 render-court.js 拆出，純搬移，行為不變）。
import { AFTER_OPTION_KEYS, afterOption, applyOption } from '../../src/turn.js';
import { effectChipText } from '../../src/effect-display.js';
import { pickSpeaker } from '../../src/speaker.js';
import { isAvailable, optionOpen, recordEvent } from '../../src/events.js';
import { U, app } from './store.js';
import { esc, hsh, rng } from './util.js';
import { DIPLO_LABEL, EFFECT, FAC, STAT } from './labels.js';
import { sfx } from './audio.js';
import { save } from './state-io.js';
import { render } from './render-nav.js';
import { stampThen } from './fx.js';

// 立繪：程序化 SVG。官帽依官職、印章色依品級、臉型與鬚由 (姓名) 決定。
export function portrait(o){
  const h = hsh(o.personName || o.name || o.id);
  const rank = o.office === 'chancellor' ? 'top' : o.office ? 'office' : 'idle';
  const badge = { top:'var(--gold)', office:'var(--vermilion)', idle:'var(--ink-soft)' }[rank];
  const robe = FAC(o.faction).c;
  const face = [
    '<ellipse cx="24" cy="26" rx="11" ry="13"/>',
    '<rect x="13" y="14" width="22" height="25" rx="8"/>',
    '<ellipse cx="24" cy="26" rx="9.5" ry="15"/>',
  ][h % 3];
  const cap = rank === 'top'
    ? '<path d="M17 15 L19 3 L29 3 L31 15 Z"/><rect x="13" y="14" width="22" height="3" rx="1.2"/>'
    : rank === 'office'
      ? '<ellipse cx="24" cy="12" rx="16" ry="3.5"/><path d="M15 12 Q24 5 33 12 L31 15 L17 15 Z"/>'
      : '<path d="M14 14 Q24 5 34 14 L34 16 L14 16 Z"/>';
  const beard = (h >>> 3) % 2 ? '<path d="M19 34 Q24 44 29 34 Q24 38 19 34 Z"/>' : '';
  return `<svg viewBox="0 0 48 56" width="44" height="52" aria-hidden="true">
    <path d="M5 56 Q5 41 24 39 Q43 41 43 56 Z" style="fill:${robe}"/>
    <g fill="#E3C49B">${face}</g>
    <g style="fill:#2a2420">${cap}${beard}<circle cx="19.5" cy="25" r="1.3"/><circle cx="28.5" cy="25" r="1.3"/></g>
    <circle cx="40" cy="12" r="5" style="fill:${badge};stroke:var(--paper);stroke-width:1.5"/>
  </svg>`;
}

export function memorialCard(vt, inner){
  return `<section class="memorial"><div class="vtitle">${vt}</div><div class="mbody">${inner}</div></section>`;
}

// 選項只顯示方向與大小（小／中／大），不列精確數字；數值仍以 events.json 為準。
export function effChips(o){
  return Object.entries(o.effects||{}).filter(([k]) => !AFTER_OPTION_KEYS.includes(k)).map(([k,v]) => {
    if (typeof v === 'boolean') return `<span class="chip">${EFFECT[k]||k}</span>`;
    if (k === 'war') return `<span class="chip">${EFFECT[k]}</span>`;
    if (k === 'diplomacy' && v && typeof v === 'object') return `<span class="chip">外交・${DIPLO_LABEL[v.action] || '其他'}</span>`;
    if (typeof v !== 'number') return `<span class="chip">${EFFECT[k]||k}</span>`;
    const t = effectChipText(k, v, EFFECT[k]||k);
    return t ? `<span class="chip ${v>0?'up':'down'}">${t}</span>` : '';
  }).join('') || '<span class="chip">無直接效果</span>';
}

// 發言大臣人物小卡：立繪、姓名、派系、忠誠條；無官員池時僅顯示官職名。
export function speakerCardHtml(sp){
  const off = sp.officialId ? U.state.officials.find(o => o.id === sp.officialId) : null;
  if (!off) return `<div class="spk-name">${esc(sp.role)}</div><div class="loy">官員池空缺，以官職進言</div>`;
  const f = FAC(off.faction);
  const loy = Math.max(0, Math.min(100, off.loyalty));
  return `<div class="spk-head" style="display:flex;gap:8px;align-items:center">${portrait(off)}<div style="min-width:0">
      <div class="spk-name">${esc(off.personName || off.name)}</div>
      <div class="tags"><span class="tag" style="color:${f.c};border-color:${f.c}">${esc(f.l)}</span><span class="tag">${esc(sp.role)}</span></div></div></div>
    <div class="loy">忠誠 <b>${Math.round(off.loyalty)}</b></div>
    <div class="track"><div class="fill${loy < 40 ? ' warn' : ''}" style="width:${loy}%"></div></div>`;
}

// 選項所涉朝臣的小立繪（僅示意：效果未指名對象者，取發言大臣同派中忠誠最低的數人，標為「可能受影響」）。
export function affectedPortraits(o, sp){
  const keys = Object.keys(o.effects || {});
  const pool = U.state.officials.filter(x => x && (x.personName || x.name));
  let list = [];
  if (keys.includes('investigate_lowest')) {
    const low = [...pool].sort((a, b) => a.loyalty - b.loyalty)[0];
    if (low) list.push(low);
  }
  if (keys.some(k => ['official_loyalty_add', 'removeOfficial', 'tutor_teach'].includes(k))) {
    const same = pool.filter(x => sp.officialId && x.faction === (pool.find(p => p.id === sp.officialId) || {}).faction);
    list = list.concat(same.sort((a, b) => a.loyalty - b.loyalty).slice(0, 3));
  }
  const seen = new Set();
  list = list.filter(x => !seen.has(x.id) && seen.add(x.id)).slice(0, 4);
  if (!list.length) return '';
  return `<span class="affected" title="可能受影響之朝臣" style="display:flex;gap:2px;margin-top:4px">${list.map(x => `<span class="spk-mini" title="${esc(x.personName || x.name)}" style="width:22px;height:26px;display:inline-block">${portrait(x).replace('width="44" height="52"', 'width="22" height="26"')}</span>`).join('')}</span>`;
}

// 奏摺的發言大臣與敘事（發言者由既有官員池決定，見 src/speaker.js）：左為人物小卡，右為卷軸式敘事。
export function narrHtml(ev){
  const sp = pickSpeaker(U.state, ev);
  return `<div class="court-split" style="display:flex;gap:12px;align-items:stretch;flex-wrap:wrap">
    <aside class="speaker-card" aria-label="發言大臣" style="flex:0 0 150px;max-width:100%;border:1px solid var(--ink-soft);border-radius:8px;padding:8px">${speakerCardHtml(sp)}</aside>
    <div class="scroll-paper story" style="flex:1 1 220px;min-width:0"><div class="sub">${esc(sp.role)} 進言</div><p class="narr">${esc(ev.narrative || '')}</p></div>
  </div>`;
}

export function secondMemorialCard(ev){
  const opts = ev.options.filter((o) => isAvailable(o) && optionOpen(U.state, o));
  return memorialCard(`次奏・${esc(ev.name)}`, `
      <div class="kicker">次奏　・　可略過</div>
      <h3>${esc(ev.name)}</h3>
      ${narrHtml(ev)}
      <div class="sub">${opts.length} 項處置可選；略過則不作處置，亦不計入行動次數。</div>
      <div class="opts">${opts.map((o,i) => `
        <button class="opt zhu" data-m2="${i}"><span class="mark">${esc(o.key)}</span>
        <span class="otxt"><span class="label">${esc(o.label)}</span>
        <span class="eff">${effChips(o)}</span></span></button>`).join('')}
      </div>
      <div style="margin-top:8px"><button class="btn ghost mini" id="m2skip">略過此則</button></div>`);
}

// 次奏裁決：不推進月份、不計行動次數；第 1 則仍待裁決，月份由第 1 則推進。
export function chooseSecond(opt, ev){
  const before = { ...U.state.stats };
  recordEvent(U.state, ev.id);
  applyOption(U.state, opt, rng(U.state.year, U.state.month, 'morning2', 'recruit'));
  afterOption(U.state, ev, opt);
  U.state.monthChain.secondDone = true;
  const parts = Object.keys(STAT).map(k => {
    const d = Math.round(U.state.stats[k] - before[k]);
    return d ? `${STAT[k].l}${d > 0 ? '+' : ''}${d}` : null;
  }).filter(Boolean);
  U.feedback = `次奏所選：${opt.label}。${parts.length ? '數值變化：' + parts.join('、') : '數值無明顯變化。'}`;
  sfx('pick');
  save(); render();
}

export function skipSecond(){
  U.state.monthChain.secondDone = true;
  U.feedback = '次奏留中，未作處置。';
  save(); render();
}

export function wireSecond(ev){
  const opts = ev.options.filter((o) => isAvailable(o) && optionOpen(U.state, o));
  app.querySelectorAll('[data-m2]').forEach(b => b.onclick = () => stampThen(b, () => chooseSecond(opts[+b.dataset.m2], ev)));
  const sk = document.getElementById('m2skip');
  if (sk) sk.onclick = skipSecond;
}

// ── 奏摺左右滑動（gap-ui-slots）：滑動只改變選取，點擊仍立即裁決；另附按鈕備援 ──
export function wireMemorialSwipe(n){
  const card = app.querySelector('.memorial');
  const box = card && card.querySelector('.opts');
  const body = card && card.querySelector('.mbody');
  if (!box || !body || n < 1) return;
  let sel = 0, sx = null, sy = null, swiped = false;
  const items = () => [...box.querySelectorAll('.opt[data-opt-index]')];
  const paint = () => items().forEach((el, i) => {
    el.classList.toggle('sel', i === sel);
    el.setAttribute('aria-current', i === sel ? 'true' : 'false');
  });
  const go = d => { sel = (sel + d + n) % n; paint(); };
  box.classList.add('swipe');
  box.addEventListener('pointerdown', e => { if (e.button > 0) return; sx = e.clientX; sy = e.clientY; swiped = false; });
  box.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; go(dx < 0 ? 1 : -1); }
  });
  box.addEventListener('pointercancel', () => { sx = null; });
  // 滑動結束後的那次 click 不應誤觸裁決
  box.addEventListener('click', e => { if (swiped) { swiped = false; e.preventDefault(); e.stopPropagation(); } }, true);
  const bar = document.createElement('div');
  bar.className = 'swipe-bar';
  bar.innerHTML = `<button type="button" class="btn ghost mini" data-sw="-1" aria-label="上一項">◀ 上一項</button>
    <span class="swipe-hint">左右滑動選擇，或點擊直接裁決</span>
    <button type="button" class="btn ghost mini" data-sw="1" aria-label="下一項">下一項 ▶</button>
    <button type="button" class="btn zhu mini" data-sw="commit">裁決所選</button>`;
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    if (b.dataset.sw === 'commit') { const it = items()[sel]; if (it) it.click(); return; }
    go(+b.dataset.sw);
  });
  body.appendChild(bar);
  paint();
}

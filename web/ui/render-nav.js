// web/ui/render-nav.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { eraYearText } from '../../src/era.js';
import { SCENARIOS } from '../../src/scenarios.js';
import { milestoneFor } from '../../src/milestones.js';
import { U } from './store.js';
import { ffMount, ffToast, pendingCase } from './game-flow.js';
import { actionsCard, crownChoiceCard, renderCourt, renderReview, reviewPending, showQuarterCard, slotsCard } from './render-court.js';
import { lastBattleCard } from './render-campaign.js';
import { STAT, TOP_GAUGES } from './labels.js';
import { esc, levelWord, pctOf } from './util.js';
import { renderPalace } from './render-palace.js';
import { renderDC, renderHarem, renderOfficials, renderThrone } from './render-officials.js';
import { renderMap } from './render-map.js';
import { applySeason, inkFlash } from './fx.js';
import { recordLegacyOnce, renderLegacy } from './render-legacy.js';
import { renderGallery } from './render-gallery.js';
import { renderFacility } from './render-facility.js';
import { renderEnding, renderStart } from './render-start.js';
import { guideMount, showNewYear } from './overlays.js';

// 朝堂的行動卡（僅在無待決案件、尚未駕崩時出現）
export function actionsSection(){
  return (!pendingCase() && U.state.alive) ? crownChoiceCard() + actionsCard() + slotsCard() + lastBattleCard() : '';
}

export function calendar(){
  document.getElementById('when').textContent = `第${U.state.dynasty.generation}世 · ${eraYearText(U.state)}${U.state.month}月 · ${U.state.age}歲`;
}

// 頂欄四項國勢：只示意高低，不顯示數值
export function topGauges(){
  const el = document.getElementById('gauges');
  if (!U.state || !U.state.alive) { el.innerHTML = ''; return; }
  el.innerHTML = TOP_GAUGES.map(k => {
    const lw = levelWord(k), cls = lw === '低' ? 'lo' : lw === '高' ? 'hi' : '';
    return `<div class="gauge ${cls}" title="${STAT[k].l}"><span>${STAT[k].l}</span>
      <div class="bar"><i style="width:${pctOf(k).toFixed(1)}%"></i></div><b>${lw}</b></div>`;
  }).join('');
}

export function fbLine(){ return `<div class="fbline" role="status">${U.feedback ? esc(U.feedback) : ''}</div>`; }

export function scenarioBanner(){
  const s = U.state.scenario;
  if (!s || s.status === 'ongoing') return '';
  const def = SCENARIOS[s.id];
  if (!def) return '';
  return `<section class="card"><div class="kicker">本紀結果</div><h2>${esc(def.name)}・${s.status === 'won' ? '成功' : '失敗'}</h2>
    <div class="sub">${esc(def.goalText)}　國祚未盡，仍可續治。</div></section>`;
}

// 底部導覽：宮城為主畫面，故僅於殿宇（分頁）內顯示「返回宮城」。
export function renderNav(){
  const nav = document.getElementById('nav');
  if (U.tab === 'palace') { nav.style.display = 'none'; return; }
  nav.style.display = '';
  document.getElementById('tabs').innerHTML = `<button type="button" class="navback" data-tab="palace">← 返回宮城</button><button type="button" class="navmap${U.tab === 'map' ? ' active' : ''}" data-tab="map">輿圖</button>`;
  nav.querySelectorAll('button').forEach(b => b.onclick = () => { U.tab = b.dataset.tab; U.panel = null; U.pick1 = null; render(); });
}

export function paintMilestone(){
  const el = document.getElementById('milestone');
  if (!el) return;
  if (!U.state || !U.state.alive) { el.innerHTML = ''; U.milestoneSeed = null; return; }
  const ms = milestoneFor(U.state);
  el.innerHTML = `<span class="ms-kicker">當前章節</span><b>${esc(ms.title)}</b>`;
  if (U.milestoneSeed === U.seed && U.milestoneId !== null && U.milestoneId !== ms.id) ffToast(`新章節：${ms.title}`);
  U.milestoneSeed = U.seed; U.milestoneId = ms.id;
}

export const VIEWS = { palace: renderPalace, court: renderCourt, officials: renderOfficials, harem: renderHarem, dc: renderDC, throne: renderThrone, map: renderMap, facility: renderFacility };

export function render(){
  if (U.tab === 'legacy') {
    topGauges(); applySeason();
    document.getElementById('nav').style.display = '';
    renderNav(); renderLegacy();
    return inkFlash('legacy');
  }
  if (U.tab === 'gallery') {
    topGauges(); applySeason();
    document.getElementById('nav').style.display = '';
    renderNav(); renderGallery();
    return inkFlash('gallery');
  }
  topGauges();
  applySeason();
  paintMilestone();
  if (U.state && !U.state.alive) recordLegacyOnce();
  if (!U.state) {
    U.lastBattle = null;
    document.getElementById('when').textContent = '未開局';
    renderStart(); document.getElementById('nav').style.display='none';
    return inkFlash('start');
  }
  calendar();
  if (!U.state.alive) { renderEnding(); document.getElementById('nav').style.display='none'; return inkFlash('end'); }
  renderNav();
  if (reviewPending()) { renderReview(); return inkFlash('review'); }
  VIEWS[U.tab]();
  guideMount();
  if (U.tab === 'court') ffMount();
  showQuarterCard();
  showNewYear();
  inkFlash(U.tab);
}

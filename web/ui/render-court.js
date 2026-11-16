// web/ui/render-court.js：朝堂頁彙整（奏摺、行動、季度等分檔見各 render-*.js，本檔保留既有 export 名稱以 re-export）。
import { pickSpeaker } from '../../src/speaker.js';
import { scenarioDef } from '../../src/scenarios.js';
import { isAvailable, optionOpen } from '../../src/events.js';
import { DC_ACTIONS } from '../../src/dongchang.js';
import { buildGazette } from '../../src/gazette.js';
import { BALANCED_EFFICIENCY, FACTION_FORCE_THRESHOLD, FACTION_POLICY, FORCE_MONTHS, factionsBalanced, forcingFaction, strongFactionCount } from '../../src/factions.js';
import { POLICIES } from '../../src/policy.js';
import { U, app } from './store.js';
import { esc } from './util.js';
import { DC_HINT, DC_LABEL, FAC } from './labels.js';
import { render } from './render-bus.js';
import { stampThen } from './fx.js';
import { campaignActive, chooseDC, chooseOption, finishMonth, morningPair, pendingCase, startEventCampaign } from './game-flow.js';
import { campaignCard, lastBattleCard } from './render-campaign.js';
import { deferButton, policyCardsCard } from './render-cards.js';
import { rulerEntryHTML } from './render-ruler.js';
import { memorialCard, effChips, affectedPortraits, narrHtml, secondMemorialCard, wireSecond, wireMemorialSwipe, portrait, speakerCardHtml, chooseSecond, skipSecond } from './render-memorial.js';
import { recordQuarterSnapshot, showQuarterCard } from './render-quarter.js';
import { ACTION_LIMIT, agency, actionsLeft, useAction, actionsCard, crownChoiceCard, onAgency, slotsCard, onSlot } from './render-actions.js';

export { portrait, memorialCard, effChips, speakerCardHtml, affectedPortraits, narrHtml, secondMemorialCard, chooseSecond, skipSecond, wireSecond, recordQuarterSnapshot, showQuarterCard, ACTION_LIMIT, agency, actionsLeft, useAction, actionsCard, crownChoiceCard, onAgency, slotsCard, onSlot, wireMemorialSwipe };

// 本紀結果橫幅（劇本達成或失敗時顯示於朝堂頂端）。
function scenarioBanner(){
  const s = U.state.scenario;
  if (!s || s.status === 'ongoing') return '';
  const def = scenarioDef(s.id);
  if (!def) return '';
  return `<section class="card"><div class="kicker">本紀結果</div><h2>${esc(def.name)}・${s.status === 'won' ? '成功' : '失敗'}</h2>
    <div class="sub">${esc(def.goalText)}　國祚未盡，仍可續治。</div></section>`;
}

// 朝堂的行動卡（僅在無待決案件、尚未駕崩時出現）
function actionsSection(){
  return (!pendingCase() && U.state.alive) ? crownChoiceCard() + actionsCard() + slotsCard() + lastBattleCard() : '';
}

// 朝堂頁：帝王面板入口與年初策卡置於各分支之前，確保任一朝堂畫面皆可見。
export function renderCourt(){
  renderCourtBody();
  const top = `<div class="court-bar">${rulerEntryHTML()}</div>${policyCardsCard()}`;
  app.insertAdjacentHTML('afterbegin', top);
}

function renderCourtBody(){
  const sb = scenarioBanner();
  if (campaignActive()) { app.innerHTML = sb + campaignCard(); return; }
  const dc = pendingCase();
  if (dc) {
    const off = U.state.officials.find(o => o.id === dc.officialId);
    app.innerHTML = sb + memorialCard('東廠密報', `
        <div class="kicker">密報・把柄</div>
        <h3>${off ? esc(off.personName || off.name) : '某官'} 查有把柄</h3>
        <div class="sub">把柄等級 ${dc.level}。請裁決如何處置：</div>
        <div class="opts">${DC_ACTIONS.map((a,i) => `
          <button class="opt zhu" data-dc="${a}"><span class="mark">${i+1}</span>
          <span class="otxt"><span class="label">${DC_LABEL[a]}</span><span class="hint">${DC_HINT[a]}</span></span></button>`).join('')}
        </div><div style="margin-top:8px">${deferButton(dc)}</div>`);
    app.querySelectorAll('[data-dc]').forEach(b => b.onclick = () => stampThen(b, () => chooseDC(b.dataset.dc)));
    return;
  }
  const { first: ev, second: ev2, secondDone } = morningPair();
  const showSecond = !!ev2 && !secondDone;
  const secondHtml = showSecond ? secondMemorialCard(ev2) : '';
  if (!ev) {
    if (showSecond) {
      app.innerHTML = sb + secondHtml + actionsSection();
      wireSecond(ev2);
      return;
    }
    app.innerHTML = sb + memorialCard('本月', `<div class="kicker">本月</div><h3>風平浪靜</h3><div class="sub">此月無奏摺上呈。</div>
      <button class="btn" id="next">進入下月</button>`) + actionsSection();
    document.getElementById('next').onclick = () => finishMonth();
    return;
  }
  const opts = ev.options.filter((o) => isAvailable(o) && optionOpen(U.state, o));
  const sp = pickSpeaker(U.state, ev);
  app.innerHTML = sb + memorialCard(`御覽・${esc(ev.name)}`, `
      <div class="kicker">奏摺</div>
      <h3>${esc(ev.name)}</h3>
      ${narrHtml(ev)}
      <div class="sub">${opts.length} 項處置可選</div>
      <div class="opts">${opts.map((o,i) => `
        <button class="opt zhu" data-opt-index="${i}"><span class="mark">${esc(o.key)}</span>
        <span class="otxt"><span class="label">${esc(o.label)}</span>
        <span class="eff">${effChips(o)}</span>${affectedPortraits(o, sp)}</span></button>
        ${o.effects && o.effects.war ? `
        <button class="opt zhu" data-camp="${i}"><span class="mark">親</span>
        <span class="otxt"><span class="label">${esc(o.label)}・親征</span>
        <span class="hint">三回合戰役：可偵察、選戰術、遣使議和（上一項為速決）</span></span></button>` : ''}`).join('')}
      </div>`) + secondHtml + actionsSection();
  app.querySelectorAll('[data-opt-index]').forEach(b => b.onclick = () => stampThen(b, () => chooseOption(opts[+b.dataset.optIndex], ev)));
  app.querySelectorAll('[data-camp]').forEach(b => b.onclick = () => startEventCampaign(opts[+b.dataset.camp], ev));
  wireMemorialSwipe(opts.length);
  if (showSecond) wireSecond(ev2);
}

// ── 年終考評（史冊卷軸）：歲末結算後於朝堂展開，收卷即回朝堂 ──
export function reviewPending(){ return (U.state.annals || []).length > U.reviewedCount; }

export function renderReview(){
  const list = U.state.annals, a = list[list.length - 1], p = list[list.length - 2];
  if (U.reviewPage === 'gazette') return renderGazette(list, a);
  const cell = (label, k, val) => {
    if (!p) return `<div><span>${label}</span><b>${val}</b><small>首年考評</small></div>`;
    const d = a[k] - p[k];
    const cls = d > 0 ? 'up' : d < 0 ? 'dn' : 'flat';
    const txt = d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '— 持平';
    return `<div><span>${label}</span><b>${val}</b><small class="${cls}">${txt}</small></div>`;
  };
  app.innerHTML = `
    <section class="review" aria-label="年終考評">
      <div class="kicker" style="text-align:center">年終考評 · 第${a.generation}世</div>
      <div class="roller" aria-hidden="true"></div>
      <article class="scroll-paper">
        <h2 class="stitle">史冊・${a.year}年</h2>
        <p class="ssub">歲末考評，陛下治國之績如下</p>
        <div class="ribbon">
          ${cell('國庫', 'treasury', a.treasury)}
          ${cell('民心', 'people', a.people)}
          ${cell('兵力', 'military', a.military)}
          ${cell('農業', 'agriculture', a.agriculture)}
        </div>
        <p class="chapter">征戰　${a.wars} 次，勝 ${a.wins} 次</p>
        <p class="narr">朝臣 ${a.officials} 人，嬪妃 ${a.consorts} 人，東廠未結案 ${a.dc} 件。史官記之，留待後世評說。</p>
        <button class="btn" id="gaz">續閱邸報</button>
      </article>
      <div class="roller bottom" aria-hidden="true"></div>
    </section>`;
  document.getElementById('gaz').onclick = () => { U.reviewPage = 'gazette'; render(); };
}

// 邸報：年終一頁的年度回顧，資料由 buildGazette 組出（annals 與 chronicle 同年紀事）。收卷即回宮城。
export function renderGazette(list, a){
  const g = buildGazette(U.state, a.year);
  const d = k => {
    const v = g.deltas[k];
    if (v === null || v === undefined) return '首年';
    return v > 0 ? `▲ ${v}` : v < 0 ? `▼ ${-v}` : '— 持平';
  };
  const cls = k => { const v = g.deltas[k]; return v > 0 ? 'up' : v < 0 ? 'dn' : 'flat'; };
  const lines = g.lines.map(l => `<li><span>${esc(l.text)}</span><span class="loy">${esc(l.tag)}</span></li>`).join('');
  const cell = (label, k) => `<div><span>${label}</span><b>${a[k]}</b><small class="${cls(k)}">${d(k)}</small></div>`;
  app.innerHTML = `
    <section class="review" aria-label="邸報">
      <div class="kicker" style="text-align:center">邸報 · 第${g.generation}世</div>
      <div class="roller" aria-hidden="true"></div>
      <article class="scroll-paper">
        <h2 class="stitle">邸報・${g.year}年</h2>
        <p class="ssub">歲末邸報，述一年朝政大要</p>
        <div class="ribbon">
          ${cell('國庫', 'treasury')}
          ${cell('民心', 'people')}
          ${cell('兵力', 'military')}
          ${cell('農業', 'agriculture')}
        </div>
        <p class="chapter">征戰　${a.wars} 次，勝 ${a.wins} 次</p>
        <h3 class="chapter">本年紀事</h3>
        ${lines ? `<ul class="list">${lines}</ul>` : '<p class="narr">本年無大事記載。</p>'}
        <button class="btn zhu" id="rollup">收卷，回宮城</button>
      </article>
      <div class="roller bottom" aria-hidden="true"></div>
    </section>`;
  document.getElementById('rollup').onclick = () => { U.reviewedCount = list.length; U.reviewPage = 'score'; U.tab = 'palace'; render(); };
}

export function pressureLine(){
  const p = U.state.factionPressure || {};
  const parts = [];
  const fc = forcingFaction(U.state.factions);
  if (fc) {
    const pol = POLICIES[FACTION_POLICY[fc]];
    parts.push(`${FAC(fc).l}勢過 ${FACTION_FORCE_THRESHOLD}，已持續 ${p.forcedMonths || 0} / ${FORCE_MONTHS} 月${pol ? `，將逼迫國策改為「${pol.name}」` : ''}。`);
  }
  if (strongFactionCount(U.state.factions) === 3) parts.push('三派並立：官員忠誠每月流失。');
  if (factionsBalanced(U.state.factions)) parts.push(`三派均衡：行政效率 ${BALANCED_EFFICIENCY}，稅制增減打折。`);
  const last = (p.forcedPolicies || []).slice(-1)[0];
  if (last) parts.push(`近例：${FAC(last.faction).l}逼迫，國策由「${POLICIES[last.from]?.name || '—'}」改為「${POLICIES[last.to]?.name || '—'}」。`);
  return parts.length ? `<div class="sub" style="margin:10px 0 0">${parts.map(esc).join('<br>')}</div>` : '';
}

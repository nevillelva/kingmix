// web/ui/render-court.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { AFTER_OPTION_KEYS, afterOption, applyOption } from '../../src/turn.js';
import { effectChipText } from '../../src/effect-display.js';
import { pickSpeaker } from '../../src/speaker.js';
import { isAvailable, optionOpen, recordEvent } from '../../src/events.js';
import { DC_ACTIONS, MAX_ACTIVE_CASES, activeCaseCount, openInvestigation } from '../../src/dongchang.js';
import { snapshotStats, summarizeQuarter } from '../../src/quarterly.js';
import { buildGazette } from '../../src/gazette.js';
import { BALANCED_EFFICIENCY, FACTION_FORCE_THRESHOLD, FACTION_POLICY, FORCE_MONTHS, factionsBalanced, forcingFaction, rallyFaction, strongFactionCount, suppressFaction } from '../../src/factions.js';
import { POLICIES, POLICY_CHANGE_PRESTIGE_COST, POLICY_KEYS, changePolicy, policyLockRemaining } from '../../src/policy.js';
import { EXAM_INTERVAL_TURNS, examRemaining, holdExam } from '../../src/exam.js';
import { ERA_CHANGE_COOLDOWN_MONTHS, ERA_CHANGE_PRESTIGE_COST, ERA_REASON_TEXT, PRESET_ERAS, changeEra, eraCooldownRemaining, eraName, eraYearText } from '../../src/era.js';
import { CHANGE_CROWN_PRINCE_PRESTIGE_COST, chooseCrownPrince, eligibleCrownHeirs, heirFaction } from '../../src/heirs-choice.js';
import { TAX_TIERS, ensureEconomy, setTaxTier } from '../../src/economy.js';
import { REPAIR_COST, cityOf, ensureCity, repairCity } from '../../src/city.js';
import { ALLIANCE_MIN_ATTITUDE, DECLARE_WAR_LOSS, DECLARE_WAR_REWARD, MARRIAGE_COST, MAX_ALLIANCES, NEIGHBORS, TRIBUTE_GAIN, TRIBUTE_MIN_ATTITUDE, acceptTribute, arrangeMarriage, diplomacyOf, formAlliance, neighborById } from '../../src/diplomacy.js';
import { assignOffice, dismissOffice, suggestCandidate } from '../../src/offices.js';
import { startCampaign } from '../../src/campaign.js';
import { remonstrate } from '../../src/bonds.js';
import { SLOTS, canTakeSlot, slotCost } from '../../src/slots.js';
import { U, app } from './store.js';
import { esc, hsh, rng } from './util.js';
import { DC_HINT, DC_LABEL, DIPLO_LABEL, EFFECT, FAC, FACTION, REASON, STAT, officeName } from './labels.js';
import { sfx } from './audio.js';
import { save } from './state-io.js';
import { actionsSection, render, scenarioBanner } from './render-nav.js';
import { stampThen } from './fx.js';
import { campAct, campaignActive, chooseDC, chooseOption, finishMonth, morningPair, pendingCase, startEventCampaign } from './game-flow.js';
import { campaignCard } from './render-campaign.js';
import { heirPersonLabel } from './render-officials.js';
import { markNewYearShown, openNianhao } from './overlays.js';

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

// 奏摺的發言大臣與敘事（發言者由既有官員池決定，見 src/speaker.js）。
export function narrHtml(ev){
  const sp = pickSpeaker(U.state, ev);
  const who = sp.name === sp.role ? esc(sp.role) : `${esc(sp.role)}　${esc(sp.name)}`;
  return `<div class="sub">${who} 進言</div><p class="narr">${esc(ev.narrative || '')}</p>`;
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

export function renderCourt(){
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
        </div>`);
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
  app.innerHTML = sb + memorialCard(`御覽・${esc(ev.name)}`, `
      <div class="kicker">奏摺</div>
      <h3>${esc(ev.name)}</h3>
      ${narrHtml(ev)}
      <div class="sub">${opts.length} 項處置可選</div>
      <div class="opts">${opts.map((o,i) => `
        <button class="opt zhu" data-i="${i}"><span class="mark">${esc(o.key)}</span>
        <span class="otxt"><span class="label">${esc(o.label)}</span>
        <span class="eff">${effChips(o)}</span></span></button>
        ${o.effects && o.effects.war ? `
        <button class="opt zhu" data-camp="${i}"><span class="mark">親</span>
        <span class="otxt"><span class="label">${esc(o.label)}・親征</span>
        <span class="hint">三回合戰役：可偵察、選戰術、遣使議和（上一項為速決）</span></span></button>` : ''}`).join('')}
      </div>`) + secondHtml + actionsSection();
  app.querySelectorAll('[data-i]').forEach(b => b.onclick = () => stampThen(b, () => chooseOption(opts[+b.dataset.i], ev)));
  app.querySelectorAll('[data-camp]').forEach(b => b.onclick = () => startEventCampaign(opts[+b.dataset.camp], ev));
  wireMemorialSwipe(opts.length);
  if (showSecond) wireSecond(ev2);
}

export function recordQuarterSnapshot(){
  if (!U.state || !U.state.alive) return;
  U.state.quarterSnaps = (U.state.quarterSnaps || []).concat([{ year: U.state.year, month: U.state.month, stats: snapshotStats(U.state) }]).slice(-4);
  if (U.state.month % 3 !== 0) return;
  // 視窗 = 上季最後一個月底（若有）＋本季三個月底，使 delta 涵蓋完整三個月。
  const summary = summarizeQuarter(U.state.quarterSnaps.map(s => s.stats), U.state.year, U.state.month);
  if (summary) U.quarterCard = summary;
}

export function showQuarterCard(){
  if (!U.quarterCard || !U.state || !U.state.alive) return;
  const c = U.quarterCard;
  const lab = k => (STAT[k] ? STAT[k].l : k);
  const fmt = d => { const r = Math.round(d); return (r > 0 ? '+' : '') + r; };
  const rows = Object.keys(c.delta).map(k => `<div class="case"><span>${esc(lab(k))}</span><span class="loy">${fmt(c.delta[k])}</span></div>`).join('');
  const word = x => x ? `${esc(lab(x.key))} ${fmt(x.amount)}` : '無';
  app.insertAdjacentHTML('afterbegin', `<section class="card" id="qcard"><div class="kicker">${c.year} 年</div>
    <h2>第 ${c.quarter} 季結算</h2>
    <div class="sub">本季最大增益：${word(c.biggestGain)}；最大損失：${word(c.biggestDrop)}</div>
    ${rows}
    <button class="btn ghost" id="qclose">收卷</button></section>`);
  document.getElementById('qclose').onclick = () => { U.quarterCard = null; render(); };
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

// ── 主動決策（Phase 6）：每月兩次行動，不推進時間 ──
export const ACTION_LIMIT = 2;

export function agency(){
  const k = `${U.state.year}-${U.state.month}`;
  if (!U.state.agency || U.state.agency.key !== k) U.state.agency = { key: k, used: 0 };
  return U.state.agency;
}

export function actionsLeft(){ return ACTION_LIMIT - agency().used; }

export function useAction(msg){
  agency().used += 1;
  U.feedback = msg; U.panel = null; U.pick1 = null;
  save(); render();
}

export function actionsCard(){
  const left = actionsLeft();
  const dis = left <= 0 ? 'disabled' : '';
  let body = '';
  if (!U.panel) {
    body = `<div class="opts">` + [
      ['appoint','任免官員','至校場任命、免職，或依吏部建議'],
      ['dc','東廠開案','對一位官員展開調查，之後可在東廠頁處置'],
      ['policy','變更國策','改變每月的施政修正'],
      ['era','改元','更改年號，耗威儀 2 點，每 12 個月一次'],
      ['heir','立儲','擇一成年皇子立為太子；已立者可改立，耗威儀'],
      ['exam','開科取士',''],
      ['faction','拉攏派系','提升一派影響力，其他兩派會下降（每月限一派）'],
      ['suppress','打壓派系','壓抑一派影響力，其他兩派會上升（每月限一派）'],
      ['tax','調整稅制','三級稅制：低稅養民，高稅裕庫'],
      ['city','修繕城池','工匠修繕州府城防，耗國庫，增民心'],
      ['diplo','外交','聯姻、朝貢、結盟，或宣戰'],
    ].map(([k,l,h]) => {
      if (k === 'appoint') return `<button class="opt" data-act="open" data-arg="appoint"><span class="mark">校</span><span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span></span></button>`;
      if (k === 'exam') {
        const r = examRemaining(U.state);
        const hint = r > 0 ? `每 ${EXAM_INTERVAL_TURNS} 個月一次，尚餘 ${r} 月` : `每 ${EXAM_INTERVAL_TURNS} 個月一次，招募 1–2 名進士`;
        return `<button class="opt" data-act="exam" ${dis || (r > 0 ? 'disabled' : '')}><span class="mark">科</span><span class="otxt"><span class="label">${l}</span><span class="hint">${hint}</span></span></button>`;
      }
      const factionLocked = (k === 'faction' || k === 'suppress') && agency().faction;
      return `<button class="opt" data-act="open" data-arg="${k}" ${dis || (factionLocked ? 'disabled' : '')}><span class="mark">＋</span><span class="otxt"><span class="label">${l}</span><span class="hint">${factionLocked ? '本月已對一派施壓' : h}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'dc') {
    const busy = new Set(U.state.dongchang.cases.filter(c => c.status !== 'closed').map(c => c.officialId));
    const pool = U.state.officials.filter(o => !busy.has(o.id));
    body = `<div class="sub">選擇要調查的官員</div><div class="opts">` + (pool.length
      ? pool.map(o => `<button class="opt" data-act="dcopen" data-arg="${o.id}" ${dis}><span class="mark">${esc((o.personName||o.name).slice(0,1))}</span><span class="label">${esc(o.personName||o.name)}</span></button>`).join('')
      : '<p class="empty">所有官員都已在調查中。</p>') + `</div>`;
  } else if (U.panel === 'policy') {
    const lock = policyLockRemaining(U.state);
    const locked = lock > 0 || U.state.stats.prestige < POLICY_CHANGE_PRESTIGE_COST;
    const hint = lock > 0 ? `換策後一年內不可再換，尚餘 ${lock} 月。` : `換策需耗威儀 ${POLICY_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    body = `<div class="sub">目前國策：${POLICIES[U.state.policy]?.name || U.state.policy}　<span class="hint">${hint}</span></div><div class="opts">` + POLICY_KEYS.map(k =>
      `<button class="opt" data-act="policy" data-arg="${k}" ${dis || ((locked || k===U.state.policy) ? 'disabled' : '')}><span class="mark">${POLICIES[k].name.slice(0,1)}</span><span class="label">${POLICIES[k].name}${k===U.state.policy?'（現行）':''}</span></button>`).join('') + `</div>`;
  } else if (U.panel === 'era') {
    const cd = eraCooldownRemaining(U.state);
    const cur = eraName(U.state);
    const blocked = cd > 0 || U.state.stats.prestige < ERA_CHANGE_PRESTIGE_COST;
    const hint = cd > 0 ? `改元每 ${ERA_CHANGE_COOLDOWN_MONTHS} 個月一次，尚餘 ${cd} 月。` : `改元需耗威儀 ${ERA_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    const off = (dis || (blocked ? 'disabled' : ''));
    body = `<div class="sub">現行年號：${esc(cur)}　<span class="hint">${hint}</span></div><div class="opts">` + PRESET_ERAS.filter(n => n !== cur).map(n =>
      `<button class="opt" data-act="eraset" data-arg="${esc(n)}" ${off}><span class="mark">${esc(n.slice(0,1))}</span><span class="label">${esc(n)}</span></button>`).join('') + `</div>
      <label class="lbl" for="era-new">或自訂年號（1–4 字）</label>
      <input class="seed" id="era-new" placeholder="自訂年號">
      <button class="btn zhu" data-act="eraconfirm" ${off} style="margin-top:8px">以此改元</button>`;
  } else if (U.panel === 'heir') {
    const cands = eligibleCrownHeirs(U.state);
    const cur = U.state.dynasty.crownPrince;
    const curHeir = cur ? U.state.heirs.find(h => h.id === cur) : null;
    const costLocked = !!cur && U.state.stats.prestige < CHANGE_CROWN_PRINCE_PRESTIGE_COST;
    const hint = cur ? `改立需耗威儀 ${CHANGE_CROWN_PRINCE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}），新舊太子所屬派系支持互換。` : '首次立儲不耗威儀。';
    body = `<div class="sub">${curHeir ? `目前太子：${esc(curHeir.personName || curHeir.name)}` : '尚未立儲'}　<span class="hint">${hint}</span></div><div class="opts">` + (cands.length
      ? cands.map(h => {
          const f = FAC(heirFaction(U.state, h)).l;
          const off = dis || (h.id === cur || costLocked ? 'disabled' : '');
          return `<button class="opt" data-act="heir" data-arg="${h.id}" ${off}><span class="mark">${esc((h.personName||h.name).slice(0,1))}</span><span class="otxt"><span class="label">${esc(h.personName||h.name)}${h.id===cur?'（太子）':''}</span><span class="hint">${heirPersonLabel(h)}　${f}之子</span></span></button>`;
        }).join('')
      : '<p class="empty">朝中無成年皇子。</p>') + `</div>`;
  } else if (U.panel === 'faction') {
    body = `<div class="sub">選擇要拉攏的一派</div><div class="opts">` + Object.keys(FACTION).map(k =>
      `<button class="opt" data-act="faction" data-arg="${k}" ${dis}><span class="mark" style="color:${FACTION[k].c};border-color:${FACTION[k].c}">${FACTION[k].l.slice(0,1)}</span><span class="label">${FACTION[k].l}　<span class="sub" style="margin:0">目前 ${Math.round(U.state.factions[k])}</span></span></button>`).join('') + `</div>`;
  } else if (U.panel === 'suppress') {
    body = `<div class="sub">選擇要打壓的一派</div><div class="opts">` + Object.keys(FACTION).map(k =>
      `<button class="opt" data-act="suppress" data-arg="${k}" ${dis}><span class="mark" style="color:${FACTION[k].c};border-color:${FACTION[k].c}">${FACTION[k].l.slice(0,1)}</span><span class="label">${FACTION[k].l}　<span class="sub" style="margin:0">目前 ${Math.round(U.state.factions[k])}</span></span></button>`).join('') + `</div>`;
  } else if (U.panel === 'tax') {
    const cur = ensureEconomy(U.state).tax;
    body = `<div class="sub">目前稅制：${cur}稅</div><div class="opts">` + TAX_TIERS.map(t =>
      `<button class="opt" data-act="tax" data-arg="${t}" ${dis || (t===cur?'disabled':'')}><span class="mark">${t}</span><span class="label">${t}稅${t===cur?'（現行）':''}</span></button>`).join('') + `</div>`;
  } else if (U.panel === 'city') {
    body = `<div class="sub">工匠修繕城池，耗國庫 ${REPAIR_COST}，每府每年一次</div><div class="opts">` + ensureCity(U.state).map(p => {
      const done = p.repairedYear === U.state.year;
      return `<button class="opt" data-act="repair" data-arg="${p.id}" ${dis || (done ? 'disabled' : '')}><span class="mark">${esc(p.name.slice(0,1))}</span>
        <span class="otxt"><span class="label">${esc(p.name)}</span><span class="hint">城防 ${Math.round(p.defense)}${done ? '　本年已修' : ''}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'diplo') {
    const d = diplomacyOf(U.state);
    body = `<div class="sub">選擇鄰國</div><div class="opts">` + NEIGHBORS.map(n => {
      const s = d[n.id];
      const tags = [s.allied ? '盟國' : '', s.kin > 0 ? '聯姻中' : ''].filter(Boolean).join('・');
      return `<button class="opt" data-act="dneigh" data-arg="${n.id}" ${dis}><span class="mark">${n.name.slice(0,1)}</span>
        <span class="otxt"><span class="label">${esc(n.name)}</span><span class="hint">好感 ${s.attitude}${tags ? '　' + tags : ''}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'diplo2') {
    const n = neighborById(U.pick1);
    const d = n ? diplomacyOf(U.state)[n.id] : null;
    body = n ? `<div class="sub">與${esc(n.name)}：好感 ${d.attitude}${d.allied ? '（盟國）' : ''}</div><div class="opts">` + [
      ['marry', '聯姻', `花費國庫 ${MARRIAGE_COST}，好感 +15，二年內不易開戰`, ''],
      ['tribute', '朝貢', `好感達 ${TRIBUTE_MIN_ATTITUDE}，得國庫 ${TRIBUTE_GAIN}、威儀 +1`, ''],
      ['ally', '結盟', `好感達 ${ALLIANCE_MIN_ATTITUDE}，最多 ${MAX_ALLIANCES} 國；盟國不可宣戰`, ''],
      ['war', '宣戰', '三回合親征，成敗決於戰局與議和', 'zhu'],
    ].map(([k, l, h, cls]) => `<button class="opt ${cls}" data-act="dpath" data-arg="${k}" ${dis}><span class="mark">${cls ? '征' : '和'}</span>
      <span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span></span></button>`).join('') + `</div>`
      : '<p class="empty">無此鄰國。</p>';
  }
  const fb = U.feedback ? `<div class="sub" style="color:var(--green);margin:0 0 10px">${esc(U.feedback)}</div>` : '';
  return `<section class="card"><h2>朝政行動</h2>
    <div class="kicker">本月剩餘 ${left} / ${ACTION_LIMIT} 次</div>${fb}
    ${body}
    ${U.panel ? '<button class="btn ghost" data-act="close" style="margin-top:10px">取消</button>' : ''}
  </section>`;
}

// 冊立東宮：E125 選項 A 設定 crown_choice_pending 後，於朝堂顯示此卡。不耗行動，無取消鈕，未選定前不自動指定。
export function crownChoiceCard(){
  if (!U.state.flags?.crown_choice_pending || U.state.dynasty.crownPrince) return '';
  const cands = eligibleCrownHeirs(U.state);
  return `<section class="card"><h2>冊立東宮</h2>
    <div class="kicker">群臣請早定國本，請陛下親定東宮人選（不耗行動）。</div>
    ${U.feedback ? `<div class="sub" style="color:var(--green);margin:0 0 10px">${esc(U.feedback)}</div>` : ''}
    <div class="opts">` + (cands.length
      ? cands.map(h => `<button class="opt" data-act="crownpick" data-arg="${h.id}"><span class="mark">${esc((h.personName||h.name).slice(0,1))}</span><span class="otxt"><span class="label">${esc(h.personName||h.name)}</span><span class="hint">${heirPersonLabel(h)}　${FAC(heirFaction(U.state, h)).l}之子</span></span></button>`).join('')
      : '<p class="empty">朝中尚無成年皇子，待有成年男嗣再行冊立。</p>') + `</div></section>`;
}

export function onAgency(e){
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || !U.state) return;
  const a = b.dataset.act, v = b.dataset.arg;
  if (a.startsWith('camp-')) return campAct(a, v);
  if (a === 'close') { U.panel = null; U.pick1 = null; return render(); }
  if (a === 'open') {
    if (v === 'appoint') { U.tab = 'officials'; U.panel = null; U.pick1 = null; return render(); } // 任免官員至校場（朝臣頁）
    U.panel = v; U.pick1 = null; return render();
  }
  if (a === 'exam') {
    const r = holdExam(U.state, rng('exam', U.state.year, U.state.month));
    if (!r.ok) {
      U.feedback = r.reason === 'cooldown' ? `開科每 ${EXAM_INTERVAL_TURNS} 月一次，尚餘 ${r.remaining} 月。` : '朝中官員已滿，無法開科。';
      save(); return render();
    }
    const names = r.added.map(id => { const o = U.state.officials.find(x => x.id === id); return o ? (o.personName || o.name) : id; }).join('、');
    return useAction(`開科取士，新進士${names}入朝，可任官。`);
  }
  if (a === 'office') { U.pick1 = v; U.panel = 'appoint2'; return render(); }
  if (a === 'dismiss') {
    const prev = dismissOffice(U.state, v);
    if (!prev) { U.feedback = `${officeName(v)}本無人任職。`; return render(); }
    return useAction(`免去${prev.personName || prev.name}之${officeName(v)}，官職暫缺。`);
  }
  if (a === 'suggest') {
    const c = suggestCandidate(U.state, v);
    if (!c) { U.feedback = '朝中無閒置之臣可薦。'; return render(); }
    const gaps = assignOffice(U.state, c.id, v);
    return useAction(`依吏部建議，任命${c.personName || c.name}為${officeName(v)}${gaps.length ? '（未達標，效果打折）' : ''}。`);
  }
  if (a === 'assign') {
    const off = U.state.officials.find(o => o.id === v);
    const gaps = assignOffice(U.state, v, U.pick1);
    const label = officeName(U.pick1);
    return useAction(`任命${off ? (off.personName || off.name) : ''}為${label}${gaps.length ? '（能力未達標，效果打折）' : ''}。`);
  }
  if (a === 'dcopen') {
    const off = U.state.officials.find(o => o.id === v);
    const c = openInvestigation(U.state, v);
    if (!c) return useAction(activeCaseCount(U.state) >= MAX_ACTIVE_CASES ? `東廠同時最多 ${MAX_ACTIVE_CASES} 案。` : '此官已有案件。');
    return useAction(`東廠開案調查${off ? (off.personName || off.name) : ''}。`);
  }
  if (a === 'policy') {
    const r = changePolicy(U.state, v);
    if (!r.ok) {
      const why = r.reason === 'locked' ? `換策後一年內不可再換，尚餘 ${r.remaining} 月。` : r.reason === 'prestige' ? '威儀不足，無法換策。' : '無法換策。';
      U.feedback = why; U.panel = null; U.pick1 = null; save(); return render();
    }
    return useAction(`國策改為${POLICIES[v].name}，耗威儀 ${POLICY_CHANGE_PRESTIGE_COST} 點。`);
  }
  if (a === 'eraset' || a === 'eraconfirm') {
    const raw = a === 'eraset' ? v : (document.getElementById('era-new')?.value ?? '');
    const r = changeEra(U.state, raw);
    if (!r.ok) {
      U.feedback = r.reason === 'cooldown' ? `改元每 ${ERA_CHANGE_COOLDOWN_MONTHS} 個月一次，尚餘 ${r.remaining} 月。`
        : r.reason === 'prestige' ? `威儀不足，改元需 ${ERA_CHANGE_PRESTIGE_COST} 點。` : ERA_REASON_TEXT[r.reason];
      if (r.reason === 'cooldown' || r.reason === 'prestige') U.panel = null;
      U.pick1 = null; save(); return render();
    }
    markNewYearShown();
    openNianhao(eraYearText(U.state), '改元詔下，萬象更新。');
    return useAction(`改元為「${r.name}」，耗威儀 ${ERA_CHANGE_PRESTIGE_COST} 點。`);
  }
  if (a === 'crownpick') {
    const h = U.state.heirs.find(x => x.id === v);
    const r = chooseCrownPrince(U.state, v);
    if (!r.ok) { U.feedback = '所選皇子不合資格。'; save(); return render(); }
    U.feedback = `冊立${h ? (h.personName || h.name) : '皇子'}為太子。`;
    save(); return render();
  }
  if (a === 'heir') {
    const h = U.state.heirs.find(x => x.id === v);
    const nm = h ? (h.personName || h.name) : '某皇子';
    const r = chooseCrownPrince(U.state, v);
    if (!r.ok) {
      const why = r.reason === 'same' ? '此人已是太子。' : r.reason === 'prestige' ? '威儀不足，無法改立。' : '所選皇子不合資格。';
      U.feedback = why; U.panel = null; U.pick1 = null; save(); return render();
    }
    return useAction(r.changed ? `改立${nm}為太子，耗威儀 ${CHANGE_CROWN_PRINCE_PRESTIGE_COST} 點。` : `立${nm}為太子。`);
  }
  // 派系施壓（拉攏／打壓）：每月限一派，以 agency().faction 記錄。
  if (a === 'faction' || a === 'suppress') {
    if (agency().faction) { U.feedback = '本月已對一派施壓，下月再議。'; U.panel = null; U.pick1 = null; save(); return render(); }
    if (a === 'faction') { rallyFaction(U.state, v); agency().faction = true; return useAction(`拉攏${FACTION[v].l}，其餘兩派下降。`); }
    suppressFaction(U.state, v); agency().faction = true;
    return useAction(`打壓${FACTION[v].l}，其餘兩派上升。`);
  }
  if (a === 'tax') {
    setTaxTier(U.state, v);
    return useAction(`稅制改為${v}稅。`);
  }
  if (a === 'repair') {
    const nm = cityOf(U.state, v)?.name || '';
    const r = repairCity(U.state, v);
    if (!r.ok) { U.feedback = `此舉未成：${REASON[r.reason] || '條件未符'}。`; return render(); }
    return useAction(`工匠修繕${nm}城池，城防提升。`);
  }
  if (a === 'dneigh') { U.pick1 = v; U.panel = 'diplo2'; return render(); }
  if (a === 'dpath') {
    const n = neighborById(U.pick1);
    if (!n) return render();
    let r, msg;
    if (v === 'marry') { r = arrangeMarriage(U.state, n.id); msg = `與${n.name}聯姻，兩國停戰二年。`; }
    else if (v === 'tribute') { r = acceptTribute(U.state, n.id); msg = `${n.name}遣使朝貢，國庫增益。`; }
    else if (v === 'ally') { r = formAlliance(U.state, n.id); msg = `與${n.name}結盟。`; }
    else { r = startCampaign(U.state, { strength: n.strength, reward: { ...DECLARE_WAR_REWARD }, loss: { ...DECLARE_WAR_LOSS } }, { neighborId: n.id }); msg = `宣戰${n.name}，親征出兵。`; if (r.ok) { U.state.campaign.title = `征討${n.name}`; } }
    if (!r.ok) { U.feedback = `此舉未成：${REASON[r.reason] || '條件未符'}。`; return render(); }
    if (v === 'war') { sfx('pick'); }
    return useAction(msg);
  }
  if (a === 'remon') {
    if (actionsLeft() <= 0) return;
    const off = U.state.officials.find(o => o.id === v);
    const r = remonstrate(U.state, v, rng('remon', U.state.year, U.state.month, v));
    if (!r) return render();
    const nm = off ? (off.personName || off.name) : '某臣';
    return useAction(r.died ? `${nm}進諫忤旨，被貶除名。` : `${nm}進諫，陛下納諫，君臣更見相得。`);
  }
}

// ── 時段（gap-ui-slots）：早朝為奏摺卡；午後三選一、夜間二選一（設定見 src/slots.js）。
// 每個選項只映射到既有分頁或朝政行動面板，不消耗行動次數、不改引擎。
export function slotsCard(){
  const exhausted = actionsLeft() <= 0;
  return Object.entries(SLOTS).map(([k, s]) => `<section class="card" data-slot-card="${k}">
    <h2>${s.name}</h2><p class="slot-kicker">${s.name}時段　・　${s.pick || '擇一而行'}</p>
    <div class="opts">${s.opts.map(([id, l, h]) => {
      const ok = !!U.state && canTakeSlot(U.state, k, agency().used);
      return `<button class="opt" data-slot="${k}" data-arg="${id}" ${ok ? '' : 'disabled'}><span class="mark">${l.slice(0,1)}</span>
      <span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span><span class="slot-cost">耗 ${slotCost(k, id)} 行動</span></span></button>`;
    }).join('')}</div>
    ${exhausted ? `<p class="slot-why">本月行動已用盡，待下月再議。</p>` : ''}
    ${s.note ? `<p class="hint slot-note">${s.note}</p>` : ''}
  </section>`).join('');
}

export function onSlot(e){
  const b = e.target.closest('[data-slot]');
  if (!b || b.disabled || !U.state || !U.state.alive) return;
  const s = SLOTS[b.dataset.slot];
  const o = s && s.opts.find(x => x[0] === b.dataset.arg);
  if (!o) return;
  if (!canTakeSlot(U.state, b.dataset.slot, agency().used)) return;
  agency().used += slotCost(b.dataset.slot, o[0]);
  save();
  const t = o[3];
  U.panel = null; U.pick1 = null; U.feedback = t.feedback || '';
  if (t.tab) U.tab = t.tab;
  if (t.panel) { U.tab = 'court'; U.panel = t.panel; }
  render();
}

// ── 奏摺左右滑動（gap-ui-slots）：滑動只改變選取，點擊仍立即裁決；另附按鈕備援 ──
export function wireMemorialSwipe(n){
  const card = app.querySelector('.memorial');
  const box = card && card.querySelector('.opts');
  const body = card && card.querySelector('.mbody');
  if (!box || !body || n < 1) return;
  let sel = 0, sx = null, sy = null, swiped = false;
  const items = () => [...box.querySelectorAll('.opt[data-i]')];
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

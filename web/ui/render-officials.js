// web/ui/render-officials.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { FACTIONS, isCourtOfficial, loyaltySafetyStatus } from '../../src/officials.js';
import { BOND_THRESHOLD, isBonded, sharedCount } from '../../src/bonds.js';
import { PERSONALITIES, describeConsort, describeTraits } from '../../src/people.js';
import { OFFICES, officeFit, officeHolder, suggestCandidate } from '../../src/offices.js';
import { POLICIES } from '../../src/policy.js';
import { FACTION_POLICY } from '../../src/factions.js';
import { TAIHOU_OPPOSE, WAIJIA_THRESHOLD, taihouOpposes } from '../../src/harem.js';
import { illnessLabel } from '../../src/heir-status.js';
import { SCENARIOS, evaluateScenario } from '../../src/scenarios.js';
import { TAX_TIERS, administrativeEfficiency, ensureEconomy } from '../../src/economy.js';
import { COLLECTIONS, collectionProgress } from '../../src/collections.js';
import { chronicleLine } from '../../src/chronicle.js';
import { tyrannyStatus } from '../../src/dongchang.js';
import { buildGeneralCard } from '../../src/general-cards.js';
import { U, app } from './store.js';
import { ABIL, FAC, SCEN_LABEL, SCEN_STATUS, STAT, officeName } from './labels.js';
import { esc, gapText, meter, reqText } from './util.js';
import { actionsLeft, portrait, pressureLine } from './render-court.js';
import { fbLine } from './render-nav.js';
import { openResignDialog } from './overlays.js';
import { deferButton, flushButton, giveItemMenu } from './render-cards.js';
import { renderRelationsCard } from './render-relations.js';

// 忠誠安全線：本派勢力達 33 + 野心/2 時，忠誠不再每月下滑；未達則流失（見 turn.js 忠誠漂移）。
// 忠誠安全線：本派勢力達安全線忠誠才不流失；君臣相得者忠誠凍結，另註明。
export function safetyLine(o, bonded){
  if (bonded) return `<div class="loy safety">忠誠安全線：君臣相得，忠誠凍結，不受安全線影響。</div>`;
  const st = loyaltySafetyStatus(o, U.state.factions[o.faction] ?? 0);
  return `<div class="loy safety ${st.ok ? 'ok' : 'warn'}">忠誠安全線：${FAC(o.faction).l}勢 ${Math.round(st.influence)} ／ 需 ${Math.ceil(st.need)}，${st.ok ? '已達，忠誠穩定' : '未達，忠誠每月流失'}</div>`;
}

export function personCard(o){
  const f = FAC(o.faction);
  const bonded = isBonded(U.state, o.id);
  const shared = sharedCount(U.state, o.id);
  const traits = describeTraits(o).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const dis = !U.state.alive || actionsLeft() <= 0 ? 'disabled' : '';
  return `<article class="person">
    <div class="head">${portrait(o)}
      <div style="min-width:0"><div class="name">${esc(o.personName || o.name)}<span class="age">${o.age ?? '—'} 歲</span></div>
        <div class="tags"><span class="tag" style="color:${f.c};border-color:${f.c}">${esc(f.l)}</span>
        <span class="tag">${o.office ? esc(officeName(o.office)) : '閒置'}</span>${bonded ? '<span class="tag bond">君臣相得</span>' : ''}</div></div></div>
    <div class="loy">忠誠 <b style="color:${o.loyalty<40?'var(--gold)':'var(--green)'}">${Math.round(o.loyalty)}</b> · 野心 ${Math.round(o.ambition)}</div>
    ${safetyLine(o, bonded)}
    <div class="abil">${Object.keys(ABIL).map(k => `<div>${ABIL[k]}<b>${o.abilities?.[k] ?? '—'}</b></div>`).join('')}</div>
    ${traits ? `<div class="tags">${traits}</div>` : ''}
    ${bonded ? `<div><button class="btn ghost mini" data-act="remon" data-arg="${esc(o.id)}" ${dis}>進諫</button></div>` : shared ? `<div class="loy">共歷 ${shared} / ${BOND_THRESHOLD}</div>` : ''}
    ${giveItemMenu(o.id, 'official')}
  </article>`;
}

export function candidatePanel(k){
  const cur = officeHolder(U.state, k);
  const dis = !U.state.alive || actionsLeft() <= 0 ? 'disabled' : '';
  const cands = U.state.officials.filter(o => o.office !== k);
  return `<div class="offpick">
    <div class="sub">選擇人選任${officeName(k)}　<span class="hint">需求：${reqText(k)}</span></div>
    <div class="opts">` + (cands.length
      ? cands.map(o => {
          const g = officeFit(o, k);
          return `<button class="opt" data-act="assign" data-arg="${o.id}" ${dis}><span class="mark">${esc((o.personName||o.name).slice(0,1))}</span>
            <span class="otxt"><span class="label">${esc(o.personName||o.name)}${o.office ? `（現任${officeName(o.office)}）` : ''}</span>
            <span class="hint">${FAC(o.faction).l}　${g.length ? '未達標：' + gapText(g) : '達標'}</span></span></button>`;
        }).join('')
      : '<p class="empty">朝中無可任之臣。</p>') + `</div>
    ${cur ? `<p class="hint" style="margin:8px 0 0">原任${esc(cur.personName||cur.name)}將卸任。</p>` : ''}
    <button class="btn ghost" data-act="close" style="margin-top:10px">取消</button>
  </div>`;
}

export function officeCard(){
  const dis = !U.state.alive || actionsLeft() <= 0 ? 'disabled' : '';
  const rows = Object.keys(OFFICES).map(k => {
    const h = officeHolder(U.state, k);
    const gaps = h ? officeFit(h, k) : [];
    const status = !h ? '<span class="chip">空缺</span>' : gaps.length ? '<span class="chip down">未達標</span>' : '<span class="chip up">達標</span>';
    const sug = suggestCandidate(U.state, k);
    const sugFit = sug ? officeFit(sug, k) : null;
    return `<div class="offrow">
      <div class="offtxt"><b style="font-weight:500">${officeName(k)}</b> ${status}
        <div class="loy">現任：${h ? esc(h.personName || h.name) : '虛位'}${gaps.length ? `　未達：${esc(gapText(gaps))}` : ''}　需求：${reqText(k)}</div>
        <div class="loy">吏部建議：${sug ? `${esc(sug.personName || sug.name)}（${sugFit.length ? '未達標' : '達標'}）` : '無閒置之臣可薦'}</div>
      </div>
      <div class="offbtns">
        <button class="btn ghost mini" data-act="office" data-arg="${k}" ${dis}>任命</button>
        <button class="btn mini" data-act="suggest" data-arg="${k}" ${dis || (sug ? '' : 'disabled')}>依建議任命</button>
        ${h ? `<button class="btn ghost mini" data-act="dismiss" data-arg="${k}" ${dis}>免職</button>` : ''}
      </div>
    </div>`;
  }).join('');
  const pick = U.panel === 'appoint2' && OFFICES[U.pick1] ? candidatePanel(U.pick1) : '';
  return `<section class="card" id="offices"><h2>任免・官職</h2>
    <div class="sub">需求未達者仍可任命，效果打折。免職後的空缺，若有完全達標之臣，月末由吏部自動補任。</div>
    ${rows}${pick}</section>`;
}

export function renderOfficials(){
  const f = U.state.factions;
  const total = Object.values(f).reduce((a,b)=>a+b,0) || 1;
  const bar = Object.entries(f).map(([k,v]) => `<div style="width:${v/total*100}%;background:${FAC(k).c}" title="${FAC(k).l} ${Math.round(v)}"></div>`).join('');
  const legend = Object.entries(f).map(([k,v]) => `<span><i style="background:${FAC(k).c}"></i>${FAC(k).l} ${Math.round(v)}</span>`).join('');
  const court = U.state.officials.filter(isCourtOfficial);
  const local = U.state.officials.filter(o => !isCourtOfficial(o));
  // 派系分組：依 FACTIONS 順序，各派內以忠誠由高至低。
  const groups = FACTIONS.map(k => {
    const f = FAC(k);
    const list = court.filter(o => o.faction === k).sort((a, b) => b.loyalty - a.loyalty);
    return `<section class="card fgroup" aria-label="${f.l}"><h2 style="color:${f.c}">${f.l}　${list.length} 人</h2>
      <div class="fgrid">${list.map(generalCard).join('') || '<p class="empty">此派無朝臣。</p>'}</div></section>`;
  }).join('');
  const localHtml = local.length ? `<section class="card fgroup" aria-label="外任知府"><h2>外任知府　${local.length} 人</h2>
      <div class="fgrid">${local.map(officialCard).join('')}</div></section>` : '';
  app.innerHTML = `
    ${fbLine()}
    <section class="card"><h2>朝局</h2>
      <div class="factions">${bar}</div><div class="legend">${legend}</div>${pressureLine()}</section>
    ${renderRelationsCard()}
    ${officeCard()}
    ${groups}${localHtml}
    ${court.length + local.length ? '' : '<p class="empty">朝中無人。</p>'}`;
}

// 將領卡（校場朝臣）：色塊姓名首字頭像、姓名、官職、忠誠數值與特質標籤；忠誠低於門檻以警示色標示。
// 展開後顯示經歷、兵力（統御）、所屬派系，並附完整人物卡（進諫等操作）。展開狀態僅存於 DOM，不寫入存檔。
export function generalCard(o){
  const c = buildGeneralCard(o);
  const offTxt = c.office ? esc(officeName(c.office)) : '閒置';
  const warnTag = c.loyaltyWarn ? `<span class="gwarn-tag" title="忠誠低於 ${c.loyaltyWarnBelow}">忠誠偏低</span>` : '';
  return `<details class="gcard${c.loyaltyWarn ? ' gwarn' : ''}">
    <summary>
      <span class="gavatar" style="background:${FAC(c.faction).c}" aria-hidden="true">${esc(c.initial)}</span>
      <span class="gtxt"><span class="fname">${esc(c.name)}</span><span class="fmeta">${offTxt}</span></span>
      <span class="gloy">${warnTag}<b>${c.loyalty ?? '—'}</b></span>
      <span class="gtags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>
    </summary>
    <div class="gbody">
      <div class="loy">經歷：${c.age !== null ? `${c.age} 歲` : '年歲不詳'}，${c.office ? `現任${offTxt}` : '閒置待命'}</div>
      <div class="loy">兵力：統御 ${c.command ?? '—'}</div>
      <div class="loy">所屬派系：${esc(c.factionName)}</div>
      ${personCard(o)}
    </div></details>`;
}

// 小卡：姓名、忠誠條、態度（依忠誠分三級）與所主國策；點開展示完整人物卡（含進諫等操作）。
export function officialCard(o){
  const pol = POLICIES[FACTION_POLICY[o.faction]];
  const loy = Math.max(0, Math.min(100, o.loyalty));
  const stance = loy >= 60 ? '效忠' : loy >= 40 ? '觀望' : '離心';
  return `<details class="fcard">
    <summary><span class="fname">${esc(o.personName || o.name)}</span><span class="fmeta">${o.office ? esc(officeName(o.office)) : '閒置'}</span>
      <span class="floy"><span class="track"><span class="fill${loy < 40 ? ' warn' : ''}" style="width:${loy}%"></span></span><b>${Math.round(o.loyalty)}</b></span>
      <span class="fstance">${stance}${pol ? `　主「${esc(pol.name)}」` : ''}</span></summary>
    ${personCard(o)}</details>`;
}

export function renderHarem(){
  const h = U.state.harem || {};
  const consorts = U.state.consorts || [];
  const nameOf = id => { const c = consorts.find(x => x.id === id); return c ? (c.personName || '嬪妃 ' + c.id) : '（已故）'; };
  const consortRows = consorts.map(c => `<li><span>${esc(c.family ? describeConsort(c) : (c.personName || '嬪妃 ' + c.id))}</span>${giveItemMenu(c.id, 'consort')}</li>`).join('');
  const demandRows = (h.demands || []).filter(d => d.status === 'open').slice(-6).reverse()
    .map(d => `<li><span>${esc(nameOf(d.consortId))} 請「${esc(d.kind)}」</span><span class="loy">${esc(FAC(d.family).l)}</span></li>`).join('');
  const famRows = Object.entries(h.waijia || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<div class="bar-row"><span>${esc(FAC(k).l)}</span><div class="track"><div class="fill ${v >= WAIJIA_THRESHOLD ? 'warn' : ''}" style="width:${Math.min(100, v).toFixed(1)}%"></div></div><b>${Math.round(v)}</b></div>`).join('');
  const dom = h.dominant
    ? `外戚坐大：${esc(FAC(h.dominant.family).l)}之家，以${esc(nameOf(h.dominant.consortId))}為首。`
    : '尚無外戚坐大。';
  const tp = (h.taihou && h.taihou.power) || 0;
  const heirRows = (U.state.heirs || []).map(x => {
    const tr = describeTraits(x).join('、');
    const ill = illnessLabel(x);
    return `<li><span>${x.gender === 'm' || x.gender === 'male' ? '皇子' : '皇女'} · ${x.age} 歲${ill ? `<div class="loy" style="color:var(--vermilion)">${esc(ill)}</div>` : ''}${tr ? `<div class="loy">${esc(tr)}</div>` : ''}</span>
      <span class="chip">能力 ${Object.values(x.abilities || {}).reduce((a,b)=>a+b,0)}</span></li>`;
  }).join('');
  app.innerHTML = `
    <section class="card"><h2>嬪妃　${consorts.length} / 8</h2>
      ${consortRows ? `<ul class="list">${consortRows}</ul>` : '<p class="empty">後宮空虛，待選秀入宮。</p>'}</section>
    <section class="card"><h2>外戚</h2>
      <div class="sub">${dom}　坐大門檻 ${WAIJIA_THRESHOLD}</div>
      ${famRows || '<p class="empty">尚無外戚勢力。</p>'}
      ${demandRows ? `<div class="kicker" style="margin-top:12px">未了請求</div><ul class="list">${demandRows}</ul>` : ''}</section>
    <section class="card"><h2>太后</h2>
      <div class="bar-row"><span>太后勢</span><div class="track"><div class="fill ${tp >= TAIHOU_OPPOSE ? 'warn' : ''}" style="width:${Math.min(100, tp).toFixed(1)}%"></div></div><b>${Math.round(tp)}</b></div>
      <div class="sub" style="margin:6px 0 0">${taihouOpposes(U.state, 'heir') ? `太后勢高（達 ${TAIHOU_OPPOSE}），反對皇嗣相關之議。` : `太后勢未達 ${TAIHOU_OPPOSE}，尚不干政。`}</div></section>
    <section class="card"><h2>子嗣</h2>
      ${heirRows ? `<ul class="list">${heirRows}</ul>` : '<p class="empty">尚無子嗣。</p>'}</section>`;
}

export function renderDC(){
  const off = id => (U.state.officials.find(o => o.id === id) || {}).name || '（已去職）';
  const open = U.state.dongchang.cases.filter(c => c.status !== 'closed');
  const closed = U.state.dongchang.cases.filter(c => c.status === 'closed').slice(-8).reverse();
  const STATUS_TEXT = { leverage: '把柄待決', deferred: '暫緩', investigating: '調查中' };
  const row = c => `<div class="case"><div><b style="font-weight:500">${esc(off(c.officialId))}</b><div class="loy">${esc(STATUS_TEXT[c.status] ?? c.status)}</div>
    ${c.status === 'leverage' ? `<div style="margin-top:6px">${deferButton(c)}</div>` : ''}</div>
    <div class="lvl" title="把柄等級 ${c.level}">${[1,2,3].map(i => `<span class="${i<=c.level?'on':''}"></span>`).join('')}</div></div>`;
  const deferredN = open.filter(c => c.status === 'deferred').length;
  app.innerHTML = `
    ${fbLine()}
    <section class="card"><h2>進行中</h2>${open.map(row).join('') || '<p class="empty">目前無案件。</p>'}
      ${deferredN ? `<div style="margin-top:10px">${flushButton()}</div>` : ''}</section>
    <section class="card"><h2>近期結案</h2>${closed.map(c => `<div class="case"><span>${esc(off(c.officialId))}</span><span class="loy">${esc(c.outcome || '結案')}</span></div>`).join('') || '<p class="empty">尚無結案。</p>'}</section>`;
}

export function scenarioCard(){
  const s = U.state.scenario;
  const def = s && SCENARIOS[s.id];
  if (!def) return '';
  let p = null;
  try { p = evaluateScenario(U.state); } catch(e) { p = null; }
  const rows = p ? p.progress.map(r => `<div class="case"><span>${esc(SCEN_LABEL[r.key] || r.key)} 目標 ${r.target}</span>
    <span class="chip ${r.met ? 'up' : ''}">${r.met ? '已達' : '未達'}</span></div>`).join('') : '';
  return `<section class="card"><h2>本紀・${esc(def.name)}</h2>
    <div class="sub">${esc(def.goalText)}</div>
    <div class="kicker">${SCEN_STATUS[s.status] || esc(s.status)}</div>${rows}</section>`;
}

export function economyCard(){
  const econ = ensureEconomy(U.state);
  const eff = administrativeEfficiency(U.state);
  const chips = TAX_TIERS.map(t => `<span class="chip ${t === econ.tax ? 'up' : ''}">${t}稅</span>`).join('');
  const rows = (U.state.prefectures || []).map(p => `<div class="case"><div><b style="font-weight:500">${esc(p.name)}</b>
    <div class="loy">知府${esc(p.governor?.name || '—')}　政 ${esc(p.governor?.abilities?.politics ?? '—')}　${p.output === 'agriculture' ? '農產' : '商產'}　城防 ${Math.round(p.defense ?? 50)}</div></div>
    <span class="chip">產值 ${Number(p.yield || 0).toFixed(2)}</span></div>`).join('');
  return `<section class="card"><h2>稅制與州府</h2>
    <div class="kicker">目前稅制</div><div class="eff" style="margin:0 0 6px">${chips}</div>
    <div class="sub">行政效率 ${eff}${eff < 1 ? '（三派均衡，稅制增減打折）' : ''}</div>
    ${rows || '<p class="empty">尚無州府資料。</p>'}</section>`;
}

export function collectionsCard(){
  const bonuses = (U.state.collections && U.state.collections.bonuses) || [];
  const rows = Object.keys(COLLECTIONS).map(id => {
    const p = collectionProgress(U.state, id), set = COLLECTIONS[id];
    return `<div class="bar-row"><span>${esc(p.name)}</span><div class="track"><div class="fill ${p.complete ? 'gold' : ''}" style="width:${(p.have / p.total * 100).toFixed(1)}%"></div></div><b>${p.have}/${p.total}</b></div>
      <div class="loy" style="margin:0 0 8px">收齊加成：${STAT[set.bonus.stat].l} +${set.bonus.amount}${bonuses.includes(id) ? '（已得）' : ''}</div>`;
  }).join('');
  return `<section class="card"><h2>收藏</h2>${rows}</section>`;
}

export function renderThrone(){
  const wins = U.state.wars.filter(w => w.won).length;
  const chron = (U.state.chronicle || []).map(c => { const l = chronicleLine(c); return `<li><span>${esc(l.text)}</span><span class="loy">${esc(l.tag)}</span></li>`; }).join('');
  const annals = (U.state.annals || []).slice().reverse().map(a =>
    `<li><span>第${a.generation}世 ${a.year}年</span><span class="loy">國庫 ${a.treasury}　民心 ${a.people}　兵力 ${a.military}　勝 ${a.wins}/${a.wars}</span></li>`).join('');
  app.innerHTML = `
    ${scenarioCard()}
    <section class="card"><h2>國勢</h2><div class="meters">${Object.keys(STAT).map(meter).join('')}</div></section>
    ${economyCard()}
    ${collectionsCard()}
    <section class="card"><h2>年度回顧</h2><ul class="list">${annals || '<li><span class="empty">歲末方有回顧。</span></li>'}</ul></section>
    <section class="card"><h2>帝王</h2>
      <div class="meters">
        <div class="meter"><div class="row1"><span>年歲</span><b>${U.state.age}</b></div></div>
        <div class="meter"><div class="row1"><span>征戰</span><b>${U.state.wars.length} 次 · 勝 ${wins}</b></div></div>
        <div class="meter"><div class="row1"><span>暴政</span><b>${tyrannyStatus(U.state).value} / ${tyrannyStatus(U.state).max}</b></div>
          <div class="track"><div class="fill ${tyrannyStatus(U.state).qingliuDrainOn ? 'warn' : ''}" style="width:${tyrannyStatus(U.state).value}%"></div></div>
          <div class="sub" style="margin:6px 0 0">責罰、下獄會累積暴政。暴政達 ${tyrannyStatus(U.state).threshold}，清流勢力每月下降 1${tyrannyStatus(U.state).qingliuDrainOn ? '（目前生效）' : ''}。暴政逾 40 者，另有遇刺之險。</div></div>
      </div>
      <div style="margin-top:16px"><button class="btn ghost" id="resign">禪位予皇子</button></div>
    </section>
    <section class="card"><h2>史記</h2><ul class="list">${chron || '<li><span class="empty">本朝初立，尚無史記。</span></li>'}</ul></section>`;
  document.getElementById('resign').onclick = openResignDialog;
}

// 皇子個性（立儲面板顯示用）；舊存檔無個性者顯示「—」。
export function heirPersonLabel(h){
  const p = PERSONALITIES.find(x => x.id === h.personality);
  return p ? `${p.name}：${p.description}` : '個性未明';
}

// web/ui/render-start.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { ACCESSION_POLICY_MAX, POLICIES, POLICY_KEYS } from '../../src/policy.js';
import { SCENARIOS } from '../../src/scenarios.js';
import { ERA_REASON_TEXT, PRESET_ERAS, migrateEraLog, validateEra } from '../../src/era.js';
import { DEFAULT_MODE, MODES } from '../../src/mode.js';
import { buildScroll } from '../../src/posthumous.js';
import { evaluateDynasty } from '../../src/ending.js';
import { chronicleLine } from '../../src/chronicle.js';
import { U, app } from './store.js';
import { clearSave, cloudSave, load, save } from './state-io.js';
import { esc } from './util.js';
import { newGame } from './game-flow.js';
import { render } from './render-nav.js';
import { SCEN_STATUS } from './labels.js';
import { sfx } from './audio.js';

export function paintAccPolicies(){
  const box = document.getElementById('acc-policy');
  if (!box) return;
  box.innerHTML = POLICY_KEYS.map(k => {
    const i = U.accPolicies.indexOf(k), on = i >= 0;
    const tag = on ? (i === 0 ? '主策：' : '輔策：') : '';
    return `<button type="button" class="btn ${on ? 'zhu' : 'ghost'}" data-pol="${k}" aria-pressed="${on}">${tag}${POLICIES[k].name}</button>`;
  }).join('');
  document.getElementById('acc-policy-hint').textContent = `已選 ${U.accPolicies.length} / ${ACCESSION_POLICY_MAX} 條。第一條為主策；輔策效果減半（暫定）。`;
}

export function renderStart(){
  const saved = load();
  const cs = cloudSave();
  const scenOpts = Object.values(SCENARIOS).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  app.innerHTML = `
    <section class="hero">
      <div class="seal-big" aria-hidden="true">帝</div>
      <h2>即位登基</h2>
      <p>以一位新君治理國家。每月奏摺由你裁決，朝政、後宮與東廠的走向，皆由選擇累積而成。</p>
    </section>
    <section class="card">
      <h2>開啟新局</h2>
      <label class="lbl" for="seed">種子（相同種子與相同選擇，結果一致）</label>
      <input class="seed" id="seed" placeholder="留空即隨機">
      <label class="lbl" for="era">年號（1–4 字，留空為「永和」）</label>
      <input class="seed" id="era" placeholder="自訂年號，或點選下方預設">
      <div class="opts" id="era-presets" style="grid-template-columns:repeat(3,1fr);margin:8px 0 0">${PRESET_ERAS.map(n => `<button type="button" class="btn ghost" data-era="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <p class="sub" id="era-err" style="color:var(--vermilion);margin:8px 0 0" hidden></p>
      <label class="lbl" for="scen">本紀劇本（選用）</label>
      <select class="seed" id="scen"><option value="">一般開局（不選劇本）</option>${scenOpts}</select>
      <p class="sub" id="scen-desc" style="margin:8px 0 0">不選劇本，即為自由治國的一般開局。</p>
      <label class="lbl" for="mode">局長模式</label>
      <select class="seed" id="mode">${Object.values(MODES).map(m => `<option value="${esc(m.key)}"${m.key === DEFAULT_MODE ? ' selected' : ''}>${esc(m.label)}（${m.months / 12} 年）</option>`).join('')}</select>
      <label class="lbl">即位國策（選 1–2 條）</label>
      <div class="opts" id="acc-policy" style="grid-template-columns:1fr 1fr;margin:0"></div>
      <p class="sub" id="acc-policy-hint" style="margin:8px 0 0"></p>
      <div style="margin-top:14px"><button class="btn zhu" id="start">開始新局</button>
      ${cs && cs.state ? `<button class="btn ghost" id="ccont">繼續雲端進度（${new Date(cs.savedAt).toLocaleString('zh-TW')}）</button>` : ''}
      ${saved && saved.state ? '<button class="btn ghost" id="cont">繼續本機進度</button>' : ''}</div>
    </section>`;
  paintAccPolicies();
  document.getElementById('acc-policy').onclick = e => {
    const b = e.target.closest('[data-pol]');
    if (!b) return;
    const k = b.dataset.pol, hint = document.getElementById('acc-policy-hint');
    if (U.accPolicies.includes(k)) {
      if (U.accPolicies.length === 1) { hint.textContent = '至少需保留一條國策。'; return; }
      U.accPolicies = U.accPolicies.filter(x => x !== k);
    } else if (U.accPolicies.length < ACCESSION_POLICY_MAX) {
      U.accPolicies = [...U.accPolicies, k];
    } else { hint.textContent = `最多選 ${ACCESSION_POLICY_MAX} 條，請先取消一條。`; return; }
    paintAccPolicies();
  };
  const scenSel = document.getElementById('scen');
  scenSel.onchange = () => {
    const d = SCENARIOS[scenSel.value];
    document.getElementById('scen-desc').textContent = d ? `${d.summary}　${d.goalText}` : '不選劇本，即為自由治國的一般開局。';
  };
  const eraIn = document.getElementById('era'), eraErr = document.getElementById('era-err');
  app.querySelectorAll('[data-era]').forEach(b => b.onclick = () => { eraIn.value = b.dataset.era; eraErr.hidden = true; });
  document.getElementById('start').onclick = () => {
    const raw = eraIn.value.trim();
    if (raw !== '') {
      const v = validateEra(raw);
      if (!v.ok) { eraErr.textContent = ERA_REASON_TEXT[v.reason]; eraErr.hidden = false; return; }
    }
    newGame(document.getElementById('seed').value.trim(), scenSel.value, raw, U.accPolicies.slice(), document.getElementById('mode').value);
  };
  const c = document.getElementById('cont');
  if (c) c.onclick = () => { U.seed = saved.seed; U.state = saved.state; migrateEraLog(U.state); U.reviewedCount = (U.state.annals||[]).length; render(); };
  const cc = document.getElementById('ccont');
  if (cc) cc.onclick = () => { U.seed = cs.seed; U.state = cs.state; migrateEraLog(U.state); U.reviewedCount = (U.state.annals||[]).length; save(); render(); };
}

// 結局：以諡號卷軸呈現，含諡號、四軸評分與生平紀事（含皇子夭折等紀錄）。
export function renderEnding(){
  const sc = buildScroll(U.state);
  const p = sc.posthumous;
  const title = evaluateDynasty(U.state).title;
  // 引擎的仁德分數可能帶小數（ending.js 的除法順序），此處僅於顯示時取整
  const axes = sc.axes.map(a => { const v = Math.round(a.score); return `<div class="meter"><div class="row1"><span>${esc(a.label)}</span><b>${v}</b></div>
    <div class="track"><div class="fill ${a.key==='military'?'warn':''}" style="width:${v}%"></div></div></div>`; }).join('');
  const chron = (U.state.chronicle || []).map(c => { const l = chronicleLine(c); return `<li><span>${esc(l.text)}</span><span class="loy">${esc(l.tag)}</span></li>`; }).join('');
  const scen = U.state.scenario && SCENARIOS[U.state.scenario.id]
    ? `<p class="sub">本紀「${esc(SCENARIOS[U.state.scenario.id].name)}」：${SCEN_STATUS[U.state.scenario.status] || '未完'}</p>` : '';
  app.innerHTML = `
    <section class="review ending" aria-label="諡號實錄">
      <div class="kicker" style="text-align:center">王朝落幕 · ${esc(title)}</div>
      <div class="roller" aria-hidden="true"></div>
      <article class="scroll-paper">
        <h2 class="stitle">${esc(sc.heading)}</h2>
        <div class="posth"><div class="sealmini" aria-hidden="true">${esc(p.char)}</div>
          <div><b>${esc(p.name)}</b><div class="ssub" style="margin:0;text-align:left">${esc(p.epithet)}</div></div></div>
        <div class="axes">${axes}</div>
        <p class="narr" style="margin-top:14px">${sc.lines.map(esc).join('<br>')}</p>
        ${scen}
        <h3 class="chapter">生平紀事</h3>
        <ul class="list">${chron || '<li><span class="empty">無紀錄</span></li>'}</ul>
        <button class="btn zhu" id="again">重新開局</button>
      </article>
      <div class="roller bottom" aria-hidden="true"></div>
    </section>`;
  document.getElementById('again').onclick = () => { clearSave(); U.state = null; render(); };
  sfx('end');
}

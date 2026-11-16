// web/ui/render-start.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { prepareMonth } from '../../src/month-start.js';
import { ACCESSION_POLICY_MAX, POLICIES, POLICY_KEYS } from '../../src/policy.js';
import { SCENARIO_DEFS, UNLOCKABLE_SCENARIOS, scenarioDef } from '../../src/scenarios.js';
import { ERA_REASON_TEXT, PRESET_ERAS, migrateEraLog, validateEra } from '../../src/era.js';
import { DEFAULT_MODE, MODES } from '../../src/mode.js';
import { ORIGINS, UNLOCKABLE_ORIGINS } from '../../src/origin.js';
import { CARD_TAGS, OPENING_DECK_MAX, OPENING_DECK_MIN, POLICY_CARDS, openingPoolIds } from '../../src/cards.js';
import { isUnlocked, unlockRequirementText } from '../../src/unlocks.js';
import { EDICT_DEFS, validateEdictChoice } from '../../src/edicts.js';
import { loadUnlocks, syncUnlocks, UNLOCK_FAIL_MSG } from './unlock-store.js';
import { buildScroll } from '../../src/posthumous.js';
import { evaluateDynasty } from '../../src/ending.js';
import { chronicleLine } from '../../src/chronicle.js';
import { U, app } from './store.js';
import { clearSave, cloudSave, discardCorruptSave, load, reasonText, save, saveMsg, saveTextFile } from './state-io.js';
import { esc } from './util.js';
import { newGame } from './game-flow.js';
import { render } from './render-bus.js';
import { SCEN_STATUS } from './labels.js';
import { sfx } from './audio.js';
import { currentEventPool } from './event-pool.js';

// 即位出身的目前選擇（模組層級，重繪起始畫面時保留）。
let originChoice = ORIGINS[0].id;

// 開局祖訓的目前勾選（0–2 條，模組層級，重繪時保留）。
let edictChoice = [];

const statModText = (mods) => Object.entries(mods).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('、');

// 未解鎖的傳承出身：按鈕停用並註明解鎖條件。
const originLocked = (id) => !isUnlocked(loadUnlocks(), 'origin', id);

export function paintOrigins(){
  const box = document.getElementById('origin-cards');
  if (!box) return;
  box.innerHTML = [...ORIGINS, ...UNLOCKABLE_ORIGINS].map(o => {
    const on = o.id === originChoice;
    const locked = originLocked(o.id);
    if (locked) return `<button type="button" class="btn ghost" disabled aria-disabled="true" data-origin="${esc(o.id)}" style="text-align:left;white-space:normal;display:block">
      <b>${esc(o.name)}（未解鎖）</b><br><span class="sub">${esc(unlockRequirementText('origin', o.id))}</span></button>`;
    return `<button type="button" class="btn ${on ? 'zhu' : 'ghost'}" data-origin="${esc(o.id)}" aria-pressed="${on}" style="text-align:left;white-space:normal;display:block">
      <b>${esc(o.name)}</b><br><span class="sub">${esc(o.desc)}</span><br>
      <span class="sub">開局：${esc(statModText(o.statMods))}</span><br>
      <span class="sub">利：${o.pros.map(esc).join('；')}</span><br>
      <span class="sub">弊：${o.cons.map(esc).join('；')}</span></button>`;
  }).join('');
}

// 開局策卡：可選卡池中點選 3–5 張作為本局卡池；不選則沿用全部策卡。
// 開局祖訓：未解鎖者停用並註明條件；已勾選者以 aria-pressed 標示。
export function paintEdicts(){
  const box = document.getElementById('edict-cards');
  if (!box) return;
  const record = loadUnlocks();
  box.innerHTML = EDICT_DEFS.map(d => {
    const locked = !isUnlocked(record, 'edict', d.id);
    if (locked) return `<button type="button" class="btn ghost" disabled aria-disabled="true" data-edict="${esc(d.id)}" style="text-align:left;white-space:normal;display:block">
      <b>${esc(d.name)}（未解鎖）</b><br><span class="sub">${esc(unlockRequirementText('edict', d.id))}</span></button>`;
    const on = edictChoice.includes(d.id);
    return `<button type="button" class="btn ${on ? 'zhu' : 'ghost'}" data-edict="${esc(d.id)}" aria-pressed="${on}" style="text-align:left;white-space:normal;display:block">
      <b>${esc(d.name)}</b><br><span class="sub">${esc(d.desc)}</span></button>`;
  }).join('');
}

export function paintOpeningDeck(){
  const box = document.getElementById('opening-deck');
  if (!box) return;
  const pool = openingPoolIds(null);
  box.innerHTML = pool.map(id => {
    const c = POLICY_CARDS[id];
    const on = U.openingDeck.includes(id);
    const tags = c.tags.map(t => CARD_TAGS[t]).join('');
    return `<button type="button" class="btn ${on ? 'zhu' : 'ghost'}" data-card="${esc(id)}" aria-pressed="${on}" style="text-align:left;white-space:normal">${on ? '已選：' : ''}${esc(c.name)}（${esc(tags)}）</button>`;
  }).join('');
  document.getElementById('opening-deck-hint').textContent = U.openingDeck.length === 0
    ? `未選擇則沿用全部 ${pool.length} 張策卡。可選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張作為本局卡池。`
    : `已選 ${U.openingDeck.length} / ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張。`;
}

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

// 本機自動存檔損毀時的提示卡：提供匯出損毀存檔與開新局（開新局前會另存備份）。
function corruptCard(corrupt){
  return `<section class="card" role="alert" aria-labelledby="corrupt-t">
      <h2 id="corrupt-t">本機存檔損毀</h2>
      <p class="sub" id="corrupt-d">瀏覽器中的自動存檔無法讀取（${esc(reasonText(corrupt.error))}），已停止使用。可先匯出損毀存檔留底，或開新局（開新局前會將損毀內容另存於瀏覽器備份）。</p>
      <div style="margin-top:10px"><button class="btn ghost" id="corrupt-export">匯出損毀存檔</button>
      <button class="btn zhu" id="corrupt-new">開新局</button></div>
    </section>`;
}

export function renderStart(){
  const saved = load();
  const corrupt = saved && saved.corrupt ? saved : null;
  const cs = cloudSave();
  // 傳承解鎖：併入已存檔的稱號（舊存檔亦可補記），並注入已解鎖策卡。
  const unlockSync = syncUnlocks(saved && saved.state && !saved.corrupt ? saved.state : null);
  const unlockRec = unlockSync.record;
  if (unlockSync.writeFailed) saveMsg(UNLOCK_FAIL_MSG);
  const scenOpts = Object.values(SCENARIO_DEFS).map(s => {
    const locked = !isUnlocked(unlockRec, 'scenario', s.id);
    return `<option value="${esc(s.id)}"${locked ? ' disabled' : ''}>${esc(s.name)}${locked ? '（未解鎖）' : ''}</option>`;
  }).join('');
  const lockedHints = [
    ...UNLOCKABLE_ORIGINS.filter(o => !isUnlocked(unlockRec, 'origin', o.id)).map(o => `出身「${o.name}」：${unlockRequirementText('origin', o.id)}`),
    ...Object.values(UNLOCKABLE_SCENARIOS).filter(s => !isUnlocked(unlockRec, 'scenario', s.id)).map(s => `劇本「${s.name}」：${unlockRequirementText('scenario', s.id)}`),
  ];
  app.innerHTML = `
    ${corrupt ? corruptCard(corrupt) : ''}
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
      <label class="lbl">即位出身（選 1 種，各有開局數值與利弊）</label>
      <div class="opts" id="origin-cards" style="grid-template-columns:1fr 1fr;margin:0"></div>
      <label class="lbl">開局祖訓（選 0–2 條，須已解鎖；本局只看此時的選擇）</label>
      <div class="opts" id="edict-cards" style="grid-template-columns:1fr 1fr;margin:0"></div>
      <p class="sub" id="edict-hint" style="margin:8px 0 0"></p>
      <label class="lbl">即位國策（選 1–2 條）</label>
      <div class="opts" id="acc-policy" style="grid-template-columns:1fr 1fr;margin:0"></div>
      <p class="sub" id="acc-policy-hint" style="margin:8px 0 0"></p>
      <label class="lbl">開局策卡（選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張作為本局卡池；不選則沿用全部策卡）</label>
      <div class="opts" id="opening-deck" style="grid-template-columns:1fr 1fr;margin:0"></div>
      <p class="sub" id="opening-deck-hint" style="margin:8px 0 0"></p>
      ${lockedHints.length ? `<p class="sub" id="unlock-hint" style="margin:8px 0 0">尚未解鎖：${lockedHints.map(esc).join('；')}。於各局達成對應稱號即可解鎖。</p>` : ''}
      <div style="margin-top:14px"><button class="btn zhu" id="start">開始新局</button>
      ${cs && cs.state ? `<button class="btn ghost" id="ccont">繼續雲端進度（${new Date(cs.savedAt).toLocaleString('zh-TW')}）</button>` : ''}
      ${saved && saved.state ? '<button class="btn ghost" id="cont">繼續本機進度</button>' : ''}</div>
    </section>`;
  paintAccPolicies();
  paintOrigins();
  paintEdicts();
  paintOpeningDeck();
  document.getElementById('opening-deck').onclick = e => {
    const b = e.target.closest('[data-card]');
    if (!b) return;
    const id = b.dataset.card, hint = document.getElementById('opening-deck-hint');
    if (U.openingDeck.includes(id)) {
      U.openingDeck = U.openingDeck.filter(x => x !== id);
    } else if (U.openingDeck.length < OPENING_DECK_MAX) {
      U.openingDeck = openingPoolIds(null).filter(x => x === id || U.openingDeck.includes(x));
    } else { paintOpeningDeck(); hint.textContent = `最多選 ${OPENING_DECK_MAX} 張，請先取消一張。`; return; }
    paintOpeningDeck();
  };
  document.getElementById('origin-cards').onclick = e => {
    const b = e.target.closest('[data-origin]');
    if (!b) return;
    originChoice = b.dataset.origin;
    paintOrigins();
  };
  document.getElementById('edict-cards').onclick = e => {
    const b = e.target.closest('[data-edict]');
    if (!b) return;
    const k = b.dataset.edict, hint = document.getElementById('edict-hint');
    if (edictChoice.includes(k)) edictChoice = edictChoice.filter(x => x !== k);
    else if (edictChoice.length < 2) edictChoice = [...edictChoice, k];
    else { paintEdicts(); hint.textContent = '祖訓最多選 2 條，請先取消一條。'; return; }
    hint.textContent = '';
    paintEdicts();
  };
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
    const d = scenarioDef(scenSel.value);
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
    const deckN = U.openingDeck.length;
    if (deckN !== 0 && (deckN < OPENING_DECK_MIN || deckN > OPENING_DECK_MAX)) {
      document.getElementById('opening-deck-hint').textContent = `開局策卡須選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張，或全部不選。`;
      return;
    }
    if (scenSel.value && !isUnlocked(loadUnlocks(), 'scenario', scenSel.value)) { eraErr.textContent = '此劇本尚未解鎖。'; eraErr.hidden = false; return; }
    if (originLocked(originChoice)) { eraErr.textContent = '此出身尚未解鎖，請改選其他出身。'; eraErr.hidden = false; return; }
    const ev = validateEdictChoice(edictChoice, loadUnlocks());
    if (!ev.ok) { eraErr.textContent = '祖訓選擇不合規（最多 2 條，且須已解鎖），請重新勾選。'; eraErr.hidden = false; return; }
    // 出身於開局時套用，早於月初準備（首月奏摺即含出身專屬事件）。
    newGame(document.getElementById('seed').value.trim(), scenSel.value, raw, U.accPolicies.slice(), document.getElementById('mode').value, U.openingDeck.slice(), ev.ids, originChoice);
  };
  const c = document.getElementById('cont');
  if (c) c.onclick = () => { U.seed = saved.seed; U.state = saved.state; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool()); U.reviewedCount = (U.state.annals||[]).length; render(); };
  const cc = document.getElementById('ccont');
  if (cc) cc.onclick = () => { U.seed = cs.seed; U.state = cs.state; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool()); U.reviewedCount = (U.state.annals||[]).length; save(); render(); };
  if (corrupt) {
    document.getElementById('corrupt-export').onclick = () => saveTextFile(`kingmix-save-corrupt-${new Date().toISOString().slice(0, 10)}.json`, corrupt.raw);
    document.getElementById('corrupt-new').onclick = () => { if (discardCorruptSave(corrupt.raw)) render(); };
  }
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
  const scen = U.state.scenario && scenarioDef(U.state.scenario.id)
    ? `<p class="sub">本紀「${esc(scenarioDef(U.state.scenario.id).name)}」：${SCEN_STATUS[U.state.scenario.status] || '未完'}</p>` : '';
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

// web/ui/game-flow.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { DEFAULT_MODE, MODES } from '../../src/mode.js';
import { createScenarioState, evaluateScenario } from '../../src/scenarios.js';
import { createInitialState, setStat } from '../../src/state.js';
import { setAccessionPolicies } from '../../src/policy.js';
import { EVENT_MAX_PER_RUN, isAvailable, optionOpen, recordEvent } from '../../src/events.js';
import { takeChain } from '../../src/chains.js';
import { autoAppoint, pickEvent, pickSecondMemorial } from '../../src/sim.js';
import { monthlyDrift } from '../../src/diplomacy.js';
import { advanceMonth, afterOption, applyOption, monthlyTick } from '../../src/turn.js';
import { tryAccession } from '../../src/succession.js';
import { applyDongchangAction } from '../../src/dongchang.js';
import { offerPeace, pickTactic, reconnoiter, startCampaign } from '../../src/campaign.js';
import { TACTICS, formatBattleLog } from '../../src/war.js';
import { autoDecideMemorial } from '../../src/autodecide.js';
import { fastForwardPause } from '../../src/fastforward.js';
import { U, app } from './store.js';
import { save } from './state-io.js';
import { render } from './render-nav.js';
import { rng } from './util.js';
import { recordQuarterSnapshot } from './render-court.js';
import { sfx } from './audio.js';
import { STAT } from './labels.js';

export function newGame(s, scenId, eraRaw, pols, modeKey){
  U.seed = s || String(Math.floor(Math.random()*1e9));
  const list = pols && pols.length ? pols : ['agrarian'];
  const opts = { policy: list[0], era: eraRaw, mode: MODES[modeKey] ? modeKey : DEFAULT_MODE };
  try {
    U.state = scenId ? createScenarioState(U.seed, scenId, opts) : createInitialState(U.seed, opts);
  } catch (e) {
    U.state = createInitialState(U.seed, opts);
    U.feedback = '本紀劇本載入失敗，已改為一般開局。';
  }
  setAccessionPolicies(U.state, list);
  U.reviewedCount = 0;
  U.guideArmed = true;
  save(); U.tab = 'palace'; U.panel = null; U.pick1 = null; render();
}

export function pendingCase(){ return (U.state.dongchang?.cases || []).find(c => c.status === 'leverage'); }

export function campaignActive(){ return !!(U.state.campaign && U.state.campaign.status === 'active'); }

// 連鎖事件與 sim.js 相同：每月開始時取出一則（takeChain），同月重繪沿用同一結果，故記在 state.monthChain。
export function chainEvent(id){
  const e = id ? U.events.find(x => x.id === id) : null;
  if (!e || !isAvailable(e)) return null;
  if ((U.state.eventHistory?.counts?.[id] || 0) >= EVENT_MAX_PER_RUN) return null;
  return e.options.some((o) => isAvailable(o) && optionOpen(U.state, o)) ? e : null;
}

// 早朝兩則奏摺：第 1 則必出（連鎖優先），第 2 則 50%（與 sim.js 同一 rng 路徑）。
// 每月開始時一次決定並存於 state.monthChain，同月重繪、行動後不改變。
export function morningPair(){
  const key = `${U.state.year}-${U.state.month}`;
  if (!U.state.monthChain || U.state.monthChain.key !== key) U.state.monthChain = { key, id: takeChain(U.state) };
  const mc = U.state.monthChain;
  if (!U.state.alive || pendingCase()) return { first: null, second: null, secondDone: false };
  if (!('second' in mc)) {
    const chained = chainEvent(mc.id);
    const first = chained ?? pickEvent(U.state, U.events, rng('events', U.state.year, U.state.month));
    mc.first = first ? first.id : null;
    const second = pickSecondMemorial(U.state, U.events, rng(U.state.year, U.state.month, 'morning2'), mc.first);
    mc.second = second ? second.id : null;
    mc.secondDone = false;
  }
  const byId = id => (id ? U.events.find(x => x.id === id) : null) || null;
  return { first: byId(mc.first), second: byId(mc.second), secondDone: !!mc.secondDone };
}

export function finishMonth(keepFeedback){
  if (!keepFeedback) U.feedback = '';
  const endingYear = U.state.month === 12 ? U.state.year : null;
  try { monthlyDrift(U.state, U.state.year, U.state.month); } catch(e) {} // 鄰國好感月度漂移（外交）
  monthlyTick(U.state, rng('tick', U.state.year, U.state.month));
  recordQuarterSnapshot(); // 季度結算：月底快照（須在 advanceMonth 之前，此時 state.month 為剛結束之月）
  advanceMonth(U.state);
  if (U.state.scenario) { try { evaluateScenario(U.state); } catch(e) {} }
  if (endingYear !== null && U.state.alive) {
    U.state.annals = U.state.annals || [];
    U.state.annals.push({
      year: endingYear, generation: U.state.dynasty.generation,
      treasury: Math.round(U.state.stats.treasury), people: Math.round(U.state.stats.people),
      military: Math.round(U.state.stats.military), agriculture: Math.round(U.state.stats.agriculture),
      wars: U.state.wars.length, wins: U.state.wars.filter(w => w.won).length,
      officials: U.state.officials.length, consorts: (U.state.consorts||[]).length,
      dc: U.state.dongchang.cases.filter(c => c.status !== 'closed').length
    });
  }
  autoAppoint(U.state);
  if (!U.state.alive) tryAccession(U.state);
  save(); render();
}

export function chooseDC(action){ applyDongchangAction(U.state, pendingCase().id, action); sfx('pick'); finishMonth(); }

export function chooseOption(opt, ev){
  const before = { ...U.state.stats };
  recordEvent(U.state, ev.id);
  applyOption(U.state, opt, rng('recruit', U.state.year, U.state.month));
  // 連鎖排程與君臣共歷（shared_event）皆由引擎 afterOption 處理，頁面不另行記錄。
  afterOption(U.state, ev, opt);
  const parts = Object.keys(STAT).map(k => {
    const d = Math.round(U.state.stats[k] - before[k]);
    return d ? `${STAT[k].l}${d > 0 ? '+' : ''}${d}` : null;
  }).filter(Boolean);
  U.feedback = `所選：${opt.label}。${parts.length ? '數值變化：' + parts.join('、') : '數值無明顯變化。'}`;
  sfx('pick');
  finishMonth(true);
}

// ── 親征（三回合戰役）：由事件的征戰選項進入，或由外交宣戰進入 ──
export const applyFx = (st, eff) => {
  for (const [k, v] of Object.entries(eff || {})) if (k in st.stats) setStat(st, k, st.stats[k] + v);
};

// 事件的征戰選項：先套用其餘效果，再開戰；戰事結束後才推進本月（tick）。
export function startEventCampaign(opt, ev){
  const { war, ...rest } = opt.effects || {};
  if (!war) return render();
  recordEvent(U.state, ev.id);
  applyOption(U.state, { ...opt, effects: rest }, rng('recruit', U.state.year, U.state.month));
  afterOption(U.state, ev, opt);
  const r = startCampaign(U.state, war);
  if (!r.ok) { U.feedback = '此役無法出征。'; save(); return render(); }
  U.state.campaign.tick = true;
  U.state.campaign.title = ev.name;
  U.feedback = `${ev.name}：出兵親征。`;
  sfx('pick');
  save(); render();
}

export function finishCampaignUI(f, prefix){
  const c = f.campaign;
  const word = f.outcome === 'peace' ? '和議既成，兵戈暫息'
    : f.outcome === 'talks_failed' ? (f.won ? '和議不成，然戰績居先' : '和議不成，退兵')
    : (f.won ? '大捷' : '戰敗');
  U.lastBattle = { title: c.title || '親征', lines: [...formatBattleLog({ rounds: c.rounds || [] }), `結果：${word}`] };
  U.feedback = `${prefix}${word}。`;
  sfx(f.won ? 'win' : 'lose');
  if (c.tick) return finishMonth(true);
  save(); render();
}

export function campAct(a, v){
  const c = U.state.campaign;
  if (!c || c.status !== 'active') return render();
  if (a === 'camp-recon') {
    const r = reconnoiter(U.state);
    U.feedback = r.ok ? `遣探偵察，敵軍約 ${r.estimate}。` : '此時無法偵察。';
    save(); return render();
  }
  if (a === 'camp-tactic') {
    const label = TACTICS[v] ? TACTICS[v].label : v;
    const r = pickTactic(U.state, v, applyFx);
    if (!r.ok) { U.feedback = '此戰術不可用。'; return render(); }
    if (!r.finished) {
      U.feedback = `第${r.round.round}回合${label}，${r.round.won ? '得勝' : '失利'}。`;
      save(); return render();
    }
    return finishCampaignUI(r.finished, `第${r.round.round}回合${label}，`);
  }
  if (a === 'camp-peace') {
    const r = offerPeace(U.state, applyFx);
    if (!r.ok) { U.feedback = '此時無法議和。'; return render(); }
    return finishCampaignUI(r.finished, '');
  }
}

// ── 快進（太和殿按鈕）：連續推進至多 12 個月；奏摺由系統代為批閱，遇停止條件即停並短訊告知 ──
export const FF_MONTHS = 12;

export const FF_REASON_TEXT = { death: '駕崩', campaign: '親征中', leverage: '東廠把柄', treasury: '國庫過低', people: '民心過低', power: '皇權過低' };

export function ffToast(msg){
  let el = document.getElementById('ff-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ff-toast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:4px;background:var(--ink);color:var(--paper);font-size:14px;z-index:60;box-shadow:0 6px 18px var(--shadow)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

// 代為批閱本月奏摺（早朝第一則與次奏），以 autoDecideMemorial 挑選。
export function ffDecideMonth(){
  const pair = morningPair();
  if (pair.first) {
    const d = autoDecideMemorial(U.state, pair.first, U.seed, U.state.year, U.state.month);
    if (d) {
      recordEvent(U.state, pair.first.id);
      applyOption(U.state, d.option, rng('recruit', U.state.year, U.state.month));
      afterOption(U.state, pair.first, d.option);
    }
  }
  const p2 = morningPair();
  if (p2.second && !p2.secondDone) {
    const d = autoDecideMemorial(U.state, p2.second, U.seed, U.state.year, U.state.month);
    if (d) {
      recordEvent(U.state, p2.second.id);
      applyOption(U.state, d.option, rng(U.state.year, U.state.month, 'morning2', 'recruit'));
      afterOption(U.state, p2.second, d.option);
    }
    U.state.monthChain.secondDone = true;
  }
}

// 單月推進：與 finishMonth 相同的月末流程，但不存檔、不重繪（由快進結束時一次處理）。
export function ffAdvanceMonth(){
  const endingYear = U.state.month === 12 ? U.state.year : null;
  try { monthlyDrift(U.state, U.state.year, U.state.month); } catch(e) {}
  monthlyTick(U.state, rng('tick', U.state.year, U.state.month));
  advanceMonth(U.state);
  if (U.state.scenario) { try { evaluateScenario(U.state); } catch(e) {} }
  if (endingYear !== null && U.state.alive) {
    U.state.annals = U.state.annals || [];
    U.state.annals.push({
      year: endingYear, generation: U.state.dynasty.generation,
      treasury: Math.round(U.state.stats.treasury), people: Math.round(U.state.stats.people),
      military: Math.round(U.state.stats.military), agriculture: Math.round(U.state.stats.agriculture),
      wars: U.state.wars.length, wins: U.state.wars.filter(w => w.won).length,
      officials: U.state.officials.length, consorts: (U.state.consorts||[]).length,
      dc: U.state.dongchang.cases.filter(c => c.status !== 'closed').length
    });
  }
  autoAppoint(U.state);
  if (!U.state.alive) tryAccession(U.state);
}

export function fastForward(){
  if (!U.state || !U.state.alive) return;
  let reason = null, done = 0;
  for (; done < FF_MONTHS; done++) {
    reason = fastForwardPause(U.state);
    if (reason) break;
    ffDecideMonth();
    ffAdvanceMonth();
  }
  U.feedback = '';
  save();
  render();
  ffToast(reason ? `快進中止：${FF_REASON_TEXT[reason]}（已推進 ${done} 個月）` : `已快進 ${done} 個月`);
}

export function ffMount(){
  if (!U.state || !U.state.alive) return;
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `<h2>快進</h2><p class="sub">系統代為批閱奏摺；遇駕崩、親征、東廠把柄，或國庫、民心、皇權告急即停。</p><button class="btn ghost" id="ff-btn" type="button">快進 12 個月</button>`;
  app.appendChild(card);
  document.getElementById('ff-btn').onclick = fastForward;
}

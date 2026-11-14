// web/ui/render-campaign.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { TACTICS, formatBattleLog, nominalStrength } from '../../src/war.js';
import { MAX_ROUNDS, RECON_GRAIN_COST, WINS_NEEDED } from '../../src/campaign.js';
import { U } from './store.js';
import { esc } from './util.js';
import { fbLine } from './render-nav.js';
import { battleTickMs, nextBattleSpeed, visibleRoundCount, battleFrames } from '../../src/war-autoplay.js';

// 兵種相剋（騎→盾→弓→槍→騎：前者剋後者）。僅作戰報圖示，不改動戰術數值。
export const UNIT_CHAIN = Object.freeze(['騎', '盾', '弓', '槍']);
export const unitBeats = (u) => UNIT_CHAIN[(UNIT_CHAIN.indexOf(u) + 1) % UNIT_CHAIN.length];

// 戰報捲動的播放狀態（模組層級，跨渲染保留）：shown 為已顯示回合數；速度與自動戰鬥偏好見 U.battlePrefs。
const scroll = { total: 0, shown: 0, timer: null };

// 新一役（回合數歸零或縮減）時重設；回合數增加時，新回合依播放速度逐一出現。
function syncScrollTotal(n) {
  if (n < scroll.total) { scroll.total = n; scroll.shown = Math.min(scroll.shown, n); }
  else if (n > scroll.total) scroll.total = n;
  if (n === 0) scroll.shown = 0;
  if (U.battlePrefs?.auto) scroll.shown = scroll.total;
}

function stopScrollTimer() {
  if (scroll.timer !== null) { clearInterval(scroll.timer); scroll.timer = null; }
}

function startScrollTimer() {
  if (scroll.timer !== null || scroll.shown >= scroll.total || U.battlePrefs?.auto) return;
  if (typeof setInterval !== 'function') return;
  scroll.timer = setInterval(() => {
    scroll.shown = Math.min(scroll.total, scroll.shown + 1);
    paintScroll();
    if (scroll.shown >= scroll.total) stopScrollTimer();
  }, battleTickMs(U.battlePrefs?.speed));
}

// 將播放狀態寫回畫面中的戰報捲動區（不需重繪整張卡）。
function paintScroll() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.battle-scroll').forEach((box) => {
    box.querySelectorAll('li[data-i]').forEach((li) => {
      li.hidden = Number(li.dataset.i) >= scroll.shown;
    });
    const speedBtn = box.parentElement?.querySelector('[data-battle="speed"]');
    if (speedBtn) speedBtn.textContent = `加速 x${U.battlePrefs.speed}`;
    const autoBtn = box.parentElement?.querySelector('[data-battle="auto"]');
    if (autoBtn) { autoBtn.textContent = `自動戰鬥：${U.battlePrefs.auto ? '開' : '關'}`; autoBtn.setAttribute('aria-pressed', String(U.battlePrefs.auto)); }
    const count = box.parentElement?.querySelector('[data-battle="count"]');
    if (count) count.textContent = `${scroll.shown}／${scroll.total} 回合`;
  });
}

// 點擊委派：跳過（全數顯示）與加速（x1 ↔ x2）。掛在 document 上，於每次重繪後仍有效。
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-battle]');
    if (!btn) return;
    if (btn.dataset.battle === 'skip') {
      stopScrollTimer();
      scroll.shown = scroll.total;
      paintScroll();
    } else if (btn.dataset.battle === 'speed') {
      U.battlePrefs.speed = nextBattleSpeed(U.battlePrefs.speed);
      stopScrollTimer();
      startScrollTimer();
      paintScroll();
    } else if (btn.dataset.battle === 'auto') {
      U.battlePrefs.auto = !U.battlePrefs.auto;
      if (U.battlePrefs.auto) { stopScrollTimer(); scroll.shown = scroll.total; }
      else startScrollTimer();
      paintScroll();
    }
  });
}

// 兵力條：以最近一回合的我方、敵方戰力比例呈現；尚無回合時，我方取名目戰力，敵方取偵察所得（未明則不顯示敵方）。
export function forceBarsHTML(c, state = U.state) {
  const last = (c.rounds || []).at(-1);
  let ours = last ? last.ours : null;
  if (ours == null && state) {
    try { ours = Math.round(nominalStrength(state)); } catch (e) { ours = null; }
  }
  const enemy = last ? last.enemy : (c.intel === 'scouted' ? c.estimate : null);
  const oursOk = Number.isFinite(ours) && ours > 0;
  const enemyOk = Number.isFinite(enemy) && enemy > 0;
  const total = (oursOk ? ours : 0) + (enemyOk ? enemy : 0);
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return `<div class="force-bars" aria-label="兵力對比">
    <div class="fbar"><span class="fbar-lbl">我方</span><span class="fbar-track"><span class="fbar-fill ours" style="width:${oursOk ? pct(ours) : 0}%"></span></span><span class="fbar-num">${oursOk ? ours : '—'}</span></div>
    <div class="fbar"><span class="fbar-lbl">敵方</span><span class="fbar-track"><span class="fbar-fill enemy" style="width:${enemyOk ? pct(enemy) : 0}%"></span></span><span class="fbar-num">${enemyOk ? enemy : '未明'}</span></div>
  </div>`;
}

// 兵種相剋圖示列：騎 剋 盾、盾 剋 弓、弓 剋 槍、槍 剋 騎。
export function counterIconsHTML() {
  const pairs = UNIT_CHAIN.map((u) =>
    `<span class="counter-pair"><span class="uicon">${esc(u)}</span><span class="arrow" aria-hidden="true">剋</span><span class="uicon">${esc(unitBeats(u))}</span></span>`);
  return `<div class="counter-chain" aria-label="兵種相剋：騎剋盾、盾剋弓、弓剋槍、槍剋騎">${pairs.join('<span aria-hidden="true">・</span>')}</div>`;
}

// 逐回合戰報捲動（每回合一列：戰術、雙方戰力、戰損、勝負與剋制關係）。
export function battleScrollHTML(rounds = []) {
  syncScrollTotal(rounds.length);
  if (U.battlePrefs.auto) { stopScrollTimer(); scroll.shown = scroll.total; }
  else if (scroll.shown < scroll.total) startScrollTimer();
  const frames = battleFrames(rounds);
  const items = rounds.map((r, i) => {
    const [line] = formatBattleLog({ rounds: [r] });
    const f = frames[i];
    const mark = r.line && r.line.includes('剋敵') ? '▲' : r.line && r.line.includes('遭') ? '▼' : '●';
    const tone = r.won ? 'win' : 'lose';
    return `<li data-i="${i}" class="${tone}"${i >= scroll.shown ? ' hidden' : ''}><span class="rd-mark" aria-hidden="true">${mark}</span><span>${esc(line)}${r.starved ? '（粮絕，戰力減損）' : ''}</span><span class="rd-bar" aria-label="我方${f.oursPct}％、敵方${f.enemyPct}％" style="display:inline-block;width:60px;height:6px;margin-left:6px;vertical-align:middle;background:linear-gradient(to right,var(--ours,#5a7fb0) ${f.oursPct}%,var(--enemy,#b0604a) ${f.oursPct}%)"></span></li>`;
  }).join('');
  const empty = rounds.length ? '' : '<li class="sub">尚無回合。</li>';
  return `<div class="battle-wrap">
    <div class="battle-ctl">
      <span class="sub" data-battle="count">${visibleRoundCount(U.battlePrefs, scroll.total, scroll.shown)}／${scroll.total} 回合</span>
      <button type="button" class="btn ghost mini" data-battle="auto" aria-pressed="${U.battlePrefs.auto}">自動戰鬥：${U.battlePrefs.auto ? '開' : '關'}</button>
      <button type="button" class="btn ghost mini" data-battle="skip">跳過</button>
      <button type="button" class="btn ghost mini" data-battle="speed">加速 x${U.battlePrefs.speed}</button>
    </div>
    <ol class="list battle-scroll" role="log" aria-live="polite" style="max-height:220px;overflow:auto;margin:0 0 8px">${items}${empty}</ol>
  </div>`;
}

// 本工作階段最近一役的戰報（戰役結束即清除於 state，故另存於此）
export function warLogList(rounds) {
  const lines = formatBattleLog({ rounds });
  return lines.map((line, i) => `<li><span>${esc(line)}${rounds[i]?.starved ? '（粮絕，戰力減損）' : ''}</span></li>`).join('');
}

export function lastBattleCard() {
  if (!U.lastBattle) return '';
  return `<section class="card" aria-label="上一役戰報"><h2>戰報・${esc(U.lastBattle.title)}</h2>
    <ul class="list war-log">${U.lastBattle.lines.map(l => `<li><span>${esc(l)}</span></li>`).join('')}</ul></section>`;
}

export function campaignCard() {
  const c = U.state.campaign;
  const scouted = c.intel === 'scouted';
  const tactics = Object.entries(TACTICS).map(([k, t]) => `
    <button class="opt zhu" data-act="camp-tactic" data-arg="${k}">
      <span class="mark">${t.label.slice(0,1)}</span>
      <span class="otxt"><span class="label">${t.label}</span>
      <span class="hint">耗粮 ${t.grain}${c.grain < t.grain ? '（粮草不足，戰力減損）' : ''}${t.gambleChance ? '　（有賭運，成敗難料）' : ''}</span></span></button>`).join('');
  const canRecon = c.round === 0 && !scouted;
  return `${fbLine()}<section class="card"><h2>軍務・${esc(c.title || '親征')}</h2>
    <div class="kicker">第 ${Math.min(c.round + 1, MAX_ROUNDS)} 回合　・　己勝 ${c.ourWins}　敵勝 ${c.enemyWins}</div>
    <div class="sub">至多 ${MAX_ROUNDS} 回合，先勝 ${WINS_NEEDED} 回合者勝。粮草 ${Math.floor(c.grain)}。敵情：${scouted ? `約 ${c.estimate}（誤差約 ±8%）` : '未明'}</div>
    ${forceBarsHTML(c)}
    ${counterIconsHTML()}
    ${battleScrollHTML(c.rounds || [])}
    <div class="sub" style="margin-bottom:6px">選擇本回合戰術：</div>
    <div class="opts">${tactics}</div>
    ${canRecon ? `<button class="btn ghost" data-act="camp-recon">遣探偵察（耗粮 ${RECON_GRAIN_COST}）</button>` : ''}
    ${c.round >= 1 ? `<button class="btn ghost" data-act="camp-peace">遣使議和</button>` : ''}
  </section>`;
}

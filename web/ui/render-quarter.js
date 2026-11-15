// web/ui/render-quarter.js：季度結算卡與季度快照（由 render-court.js 拆出，純搬移，行為不變）。
import { snapshotStats, summarizeQuarter } from '../../src/quarterly.js';
import { U, app } from './store.js';
import { esc } from './util.js';
import { STAT } from './labels.js';
import { render } from './render-nav.js';

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

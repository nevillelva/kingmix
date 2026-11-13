// web/ui/render-campaign.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { TACTICS, formatBattleLog } from '../../src/war.js';
import { MAX_ROUNDS, RECON_GRAIN_COST, WINS_NEEDED } from '../../src/campaign.js';
import { U } from './store.js';
import { esc } from './util.js';
import { fbLine } from './render-nav.js';

 // 本工作階段最近一役的戰報（戰役結束即清除於 state，故另存於此）
export function warLogList(rounds){
  const lines = formatBattleLog({ rounds });
  return lines.map((line, i) => `<li><span>${esc(line)}${rounds[i]?.starved ? '（粮絕，戰力減損）' : ''}</span></li>`).join('');
}

export function lastBattleCard(){
  if (!U.lastBattle) return '';
  return `<section class="card" aria-label="上一役戰報"><h2>戰報・${esc(U.lastBattle.title)}</h2>
    <ul class="list war-log">${U.lastBattle.lines.map(l => `<li><span>${esc(l)}</span></li>`).join('')}</ul></section>`;
}

export function campaignCard(){
  const c = U.state.campaign;
  const scouted = c.intel === 'scouted';
  const log = warLogList(c.rounds || []);
  const tactics = Object.entries(TACTICS).map(([k, t]) => `
    <button class="opt zhu" data-act="camp-tactic" data-arg="${k}">
      <span class="mark">${t.label.slice(0,1)}</span>
      <span class="otxt"><span class="label">${t.label}</span>
      <span class="hint">耗粮 ${t.grain}${c.grain < t.grain ? '（粮草不足，戰力減損）' : ''}${t.gambleChance ? '　（有賭運，成敗難料）' : ''}</span></span></button>`).join('');
  const canRecon = c.round === 0 && !scouted;
  return `${fbLine()}<section class="card"><h2>軍務・${esc(c.title || '親征')}</h2>
    <div class="kicker">第 ${Math.min(c.round + 1, MAX_ROUNDS)} 回合　・　己勝 ${c.ourWins}　敵勝 ${c.enemyWins}</div>
    <div class="sub">至多 ${MAX_ROUNDS} 回合，先勝 ${WINS_NEEDED} 回合者勝。粮草 ${Math.floor(c.grain)}。敵情：${scouted ? `約 ${c.estimate}（誤差約 ±8%）` : '未明'}</div>
    ${log ? `<ul class="list" style="margin-bottom:8px">${log}</ul>` : ''}
    <div class="sub" style="margin-bottom:6px">選擇本回合戰術：</div>
    <div class="opts">${tactics}</div>
    ${canRecon ? `<button class="btn ghost" data-act="camp-recon">遣探偵察（耗粮 ${RECON_GRAIN_COST}）</button>` : ''}
    ${c.round >= 1 ? `<button class="btn ghost" data-act="camp-peace">遣使議和</button>` : ''}
  </section>`;
}

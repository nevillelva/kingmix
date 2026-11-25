// web/ui/render-campaign.js：親征、戰況、戰報與上一役戰報（Canvas）。
// 繪製與版面見 canvas/campaign.js；本檔負責戰報播放狀態（依 C.T 逐回合顯示）與點擊接線（campAct）。
// 既有匯出保留名稱；回傳值由 HTML 改為資料模型（見各函式註解）。
import { formatBattleLog } from '../../src/war.js';
import { battleTickMs, normalizeBattlePrefs } from '../../src/war-autoplay.js';
import { U } from './store.js';
import { registerScreen, setScreen } from './canvas/core.js';
import { panel, text, bar, button } from './canvas/widgets.js';
import { INK } from './canvas/theme.js';
import {
  UNIT_CHAIN, unitBeats, counterPairs, forceBarModel, battleLines, reduceBattlePrefs, advanceShown, skipShown, drawCampaign,
} from './canvas/campaign.js';

export { UNIT_CHAIN, unitBeats };

// 戰報播放狀態（模組層級，跨幀保留）：shown 為已顯示回合數，total 為目前回合總數，last 為上次計時的 C.T。
const scroll = { total: 0, shown: 0, last: null, acc: 0 };

// 新一役（回合數歸零或縮減）時重設；回合數增加時，新回合依播放速度逐一出現。
function syncScrollTotal(n, prefs) {
  if (n < scroll.total) { scroll.total = n; scroll.shown = Math.min(scroll.shown, n); }
  else if (n > scroll.total) scroll.total = n;
  if (n === 0) scroll.shown = 0;
  if (prefs.auto) scroll.shown = scroll.total;
}

// 每幀依 C.T 推進播放（每 battleTickMs 顯示一回合）；自動戰鬥時全數顯示。
function tickScroll(C, prefs) {
  const t = C.T || 0;
  if (scroll.last === null) scroll.last = t;
  const dt = Math.max(0, t - scroll.last) * 1000;
  scroll.last = t;
  if (prefs.auto || scroll.shown >= scroll.total) { scroll.acc = 0; return; }
  scroll.acc += dt;
  const step = battleTickMs(prefs.speed);
  while (scroll.acc >= step && scroll.shown < scroll.total) { scroll.shown = advanceShown(scroll.shown, scroll.total); scroll.acc -= step; }
}


// 上一役戰報（與舊版相同之內容）；於朝堂等畫面以 drawLastBattleCard 繪製。原 lastBattleCard 回傳 HTML，現回傳 ''。
export function lastBattleCard() { return ''; }

// 上一役戰報卡的高度（含下方間距）；無戰報時為 0。與 drawLastBattleCard 同一版面公式。
export function lastBattleCardH(C) {
  if (!U.lastBattle) return 0;
  const u = C.U || 1, pad = 14 * u, lh = 13 * u * 1.45;
  return pad + 16 * u * 1.45 + 8 * u + U.lastBattle.lines.length * lh + pad + 10 * u;
}

// 繪製上一役戰報卡（Canvas）。回傳高度；無戰報時回傳 0。
export function drawLastBattleCard(C, x, y, w) {
  if (!U.lastBattle) return 0;
  const u = C.U || 1, pad = 14 * u;
  const lines = U.lastBattle.lines;
  const title = `戰報・${U.lastBattle.title}`;
  const lh = 13 * u * 1.45;
  const h = pad + 16 * u * 1.45 + 8 * u + lines.length * lh + pad;
  panel(x, y, w, h, {});
  text(title, x + pad, y + pad, { size: 16 * u, weight: 'bold', color: INK, maxW: w - pad * 2 });
  lines.forEach((l, i) => text(l, x + pad, y + pad + 16 * u * 1.45 + 8 * u + i * lh, { size: 13 * u, color: INK, maxW: w - pad * 2 }));
  return h + 10 * u;
}

// 點擊接線：動態匯入 game-flow.js 之 campAct（避免靜態循環依賴）。
async function campActAsync(a, v) {
  const { campAct } = await import('./game-flow.js');
  return campAct(a, v);
}

// 戰役畫面（Canvas）：每幀呼叫。無進行中的戰役時顯示空狀態。
export function drawCampaignPage(C) {
  const c = U.state?.campaign;
  const u = C.U || 1, top = (C.content?.y || 0) + 12 * u, x = (C.content?.x || 0) + 12 * u, w = (C.content?.w || C.W) - 24 * u;
  if (!c || c.status !== 'active') {
    panel(x, top, w, 60 * u, {});
    text('此時並無親征。', x + 14 * u, top + 20 * u, { size: 14 * u, color: INK });
    C.contentH = Math.max(C.contentH || 0, 100 * u);
    return;
  }
  const prefs = normalizeBattlePrefs(U.battlePrefs);
  U.battlePrefs = prefs;
  syncScrollTotal((c.rounds || []).length, prefs);
  tickScroll(C, prefs);
  drawCampaign({ panel, text, bar, button }, C, {
    c, state: U.state, prefs, shown: scroll.shown, x: (C.content?.x || 0) + 12 * u, y: top, w: (C.content?.w || C.W) - 24 * u,
    onAct: (a, v) => campActAsync(a, v),
    onPref: (action) => { U.battlePrefs = reduceBattlePrefs(normalizeBattlePrefs(U.battlePrefs), action); },
    onSkip: () => { scroll.shown = skipShown(scroll.total); },
  });
}


registerScreen('campaign', drawCampaignPage);

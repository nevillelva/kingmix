// web/ui/render-quarter.js：季度快照與季結算卡（Canvas 對話框；由 render-court.js 拆出）。
import { snapshotStats, summarizeQuarter } from '../../src/quarterly.js';
import { U } from './store.js';
import { STAT } from './labels.js';
import { openCanvasDialog } from './dialog.js';

export function recordQuarterSnapshot(){
  if (!U.state || !U.state.alive) return;
  U.state.quarterSnaps = (U.state.quarterSnaps || []).concat([{ year: U.state.year, month: U.state.month, stats: snapshotStats(U.state) }]).slice(-4);
  if (U.state.month % 3 !== 0) return;
  // 視窗 = 上季最後一個月底（若有）＋本季三個月底，使 delta 涵蓋完整三個月。
  const summary = summarizeQuarter(U.state.quarterSnaps.map(s => s.stats), U.state.year, U.state.month);
  if (summary) U.quarterCard = summary;
}

const fmt = d => { const r = Math.round(d); return (r > 0 ? '+' : '') + r; };
const lab = k => (STAT[k] ? STAT[k].l : k);
const word = x => x ? `${lab(x.key)} ${fmt(x.amount)}` : '無';

// 季結算卡的文字內容（純函式）。
export function quarterCardModel(c){
  return {
    kicker: `${c.year} 年`,
    title: `第 ${c.quarter} 季結算`,
    sub: `本季最大增益：${word(c.biggestGain)}；最大損失：${word(c.biggestDrop)}`,
    rows: Object.keys(c.delta).map(k => `${lab(k)}　${fmt(c.delta[k])}`),
  };
}

let openedFor = null;

// 顯示季結算卡（以 U.quarterCard 為準）；同一張卡只開一次。收卷或關閉即清除 U.quarterCard。
export function showQuarterCard(){
  if (!U.quarterCard || !U.state || !U.state.alive) return;
  const c = U.quarterCard;
  if (openedFor === c) return;
  openedFor = c;
  const m = quarterCardModel(c);
  const done = () => { if (U.quarterCard === c) U.quarterCard = null; openedFor = null; };
  openCanvasDialog({
    title: `${m.kicker}・${m.title}`,
    body: [m.sub, ...m.rows].join('\n'),
    buttons: [{ key: 'close', label: '收卷' }],
    dismissible: true,
    onButton: (_k, close) => { close(); },
    onClose: done,
  });
}

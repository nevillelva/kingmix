// web/ui/canvas/ministers.js：朝堂「名臣」分頁（Canvas）。列出在任大臣的姓名、官職、派系與忠誠。
// 任期與政績目前無紀錄（src 未記錄任命之月與個人政績），以「尚無紀錄」標示，見 offices.js 與 fates.js。
// 分頁列 courtPageBar 由 render-court.js 的 drawCourt 置於朝堂頂端；切換 U.courtPage（'court' 或 'ministers'）。
import { U } from '../store.js';
import { FAC, officeName } from '../labels.js';
import { render } from '../render-bus.js';
import { isCourtOfficial } from '../../../src/officials.js';
import { C } from './core.js';
import { txt, vstack, boxed, btn, tag, hrow } from './court.js';

export const COURT_PAGES = Object.freeze({ court: '朝政', ministers: '名臣' });

// 在任大臣：朝臣（不含知府）且任有官職者，依 state.officials 原序。
export function inOfficeMinisters(state) {
  return (state?.officials || []).filter((o) => isCourtOfficial(o) && o.office);
}

// 分頁列：朝政、名臣兩鈕，目前分頁以紅漆標示。
export function courtPageBar(w) {
  const onMinisters = U.courtPage === 'ministers';
  const gap = 8 * C.U;
  const bw = (w - gap) / 2;
  return hrow([
    { w: bw, item: btn(bw, COURT_PAGES.court, () => { U.courtPage = 'court'; render(); }, { lac: !onMinisters, h: 34 * C.U }) },
    { w: bw, item: btn(bw, COURT_PAGES.ministers, () => { U.courtPage = 'ministers'; render(); }, { lac: onMinisters, h: 34 * C.U }) },
  ], gap);
}

// 單一大臣卡：姓名、官職、派系與忠誠；任期與政績為尚無紀錄。
function ministerCard(o, w) {
  const f = FAC(o.faction);
  return boxed(w, (iw) => vstack([
    txt(o.personName || o.name, iw, 16, { weight: 'bold' }),
    txt(`官職　${officeName(o.office)}`, iw, 14),
    txt(`派系　${f.l}　・　忠誠 ${Math.round(o.loyalty)}`, iw, 13, { color: f.c }),
    txt('任期　尚無紀錄', iw, 13, { color: '#7a5a3a' }),
    txt('政績　尚無紀錄', iw, 13, { color: '#7a5a3a' }),
  ], 4 * C.U), { pad: 12, r: 10 });
}

// 名臣分頁的全部區塊（由上而下）：標題卡，無在任者則為空狀態卡，否則每位大臣一張卡。
export function ministersItems(w) {
  const list = inOfficeMinisters(U.state);
  const head = boxed(w, (iw) => vstack([
    tag('名臣'),
    txt('在任大臣', iw, 18, { weight: 'bold' }),
    txt(`朝中在任 ${list.length} 人。`, iw, 13),
  ], 6 * C.U), { pad: 12, r: 10 });
  if (!list.length) {
    return [head, boxed(w, (iw) => vstack([
      txt('朝中暫無在任大臣', iw, 16, { weight: 'bold' }),
      txt('任命丞相、尚書等官職後，其姓名將列於此。', iw, 13),
    ], 6 * C.U), { pad: 12, r: 10 })];
  }
  return [head, ...list.map((o) => ministerCard(o, w))];
}

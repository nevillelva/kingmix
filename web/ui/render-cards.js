// web/ui/render-cards.js：策卡國策、寶物賜予、東廠稍後處理的介面。
// 引擎模組（cards.js／items.js／relations.js／fastforward.js 的 deferLeverage）來自平行 PR，尚未合入前
// 以動態匯入載入；缺席時介面照常呈現，相關按鈕停用並註明「引擎尚未就緒」。
import { U } from './store.js';
import { esc, rng } from './util.js';
import { save } from './state-io.js';
import { render } from './render-nav.js';

// 可選引擎：匯入失敗或匯出名稱不存在時維持空物件，各處以 typeof 檢查。
export const engine = {};
const optional = (path) => import(path).then((m) => Object.assign(engine, m)).catch(() => {});
// 非同步載入，完成後重繪一次（不使用頂層 await，避免與 render-nav 的循環匯入互等）。
Promise.all([
  optional('../../src/cards.js'),
  optional('../../src/items.js'),
  optional('../../src/relations.js'),
  optional('../../src/fastforward.js'),
]).then(() => { if (U.state) render(); });

export const has = (name) => typeof engine[name] === 'function';

const cardLabel = (c) => esc(c.name ?? c.label ?? c.title ?? c.id ?? '策卡');
const cardDesc = (c) => esc(c.desc ?? c.description ?? c.text ?? '');

// 每年（正月）三選一的策卡國策。已選定本年者不再顯示。
export function policyCardsCard() {
  const s = U.state;
  if (!s || !s.alive || s.month !== 1 || !has('drawPolicyCards') || !has('choosePolicyCard')) return '';
  if ((s.flags || {}).policy_card_year === s.year) return '';
  let cards = [];
  try { cards = engine.drawPolicyCards(s, rng(s.year, 'policycards')) || []; } catch (e) { cards = []; }
  if (!Array.isArray(cards) || cards.length === 0) return '';
  const syn = synergyLine();
  return `<section class="card" data-policy-cards="${s.year}"><h2>年度策卡國策</h2>
    <div class="kicker">${s.year} 年　・　三選一，擇一施行</div>
    <div class="opts">${cards.slice(0, 3).map((c) => `<button class="opt zhu" data-act="pickcard" data-arg="${esc(c.id)}">
      <span class="mark">${cardLabel(c).slice(0, 1)}</span><span class="otxt"><span class="label">${cardLabel(c)}</span>
      <span class="hint">${cardDesc(c)}</span></span></button>`).join('')}</div>
    ${syn}</section>`;
}

// 目前生效的策卡協同（activeSynergies）。
export function synergyLine() {
  if (!has('activeSynergies')) return '';
  let list = [];
  try { list = engine.activeSynergies(U.state) || []; } catch (e) { list = []; }
  if (!Array.isArray(list) || list.length === 0) return '';
  return `<div class="sub" style="margin:10px 0 0">生效協同：${list.map((x) => esc(x.name ?? x.label ?? x.id ?? '協同')).join('、')}</div>`;
}

// 寶物賜予：列出庫中寶物，點選即賜予該官員或嬪妃。
export function giveItemMenu(targetId) {
  if (!has('giveItem') || !has('listInventory')) {
    return `<div class="loy">賜寶：引擎尚未就緒</div>`;
  }
  let inv = [];
  try { inv = engine.listInventory(U.state) || []; } catch (e) { inv = []; }
  if (!Array.isArray(inv) || inv.length === 0) return `<div class="loy">賜寶：庫中無寶物</div>`;
  return `<details class="giveitem"><summary class="btn ghost mini">賜寶</summary><div class="opts">` +
    inv.map((it) => `<button class="opt" data-act="giveitem" data-arg="${esc(it.id)}|${esc(targetId)}">
      <span class="mark">寶</span><span class="label">${esc(it.name ?? it.id)}</span></button>`).join('') +
    `</div></details>`;
}

// 東廠密報的「稍後處理」按鈕。
export function deferButton(dc) {
  const ok = has('deferLeverage');
  return `<button class="btn ghost mini" data-act="defer" data-arg="${esc(dc.id ?? dc.officialId ?? '')}" ${ok ? '' : 'disabled'}>稍後處理${ok ? '' : '（引擎尚未就緒）'}</button>`;
}

// 本卡片的行動分派，由 onAgency 先行呼叫；已處理則回傳 true。
export function handleCardAct(a, v) {
  if (a === 'pickcard') {
    const r = engine.choosePolicyCard(U.state, v);
    U.feedback = r && r.ok === false ? '此策卡未能施行。' : '策卡已定，施行於本年。';
    if (!r || r.ok !== false) { U.state.flags = U.state.flags || {}; U.state.flags.policy_card_year = U.state.year; }
    save(); render(); return true;
  }
  if (a === 'giveitem') {
    const [itemId, targetId] = v.split('|');
    const r = engine.giveItem(U.state, itemId, targetId);
    U.feedback = r && r.ok === false ? '賜寶未成。' : '寶物已賜出。';
    save(); render(); return true;
  }
  if (a === 'defer') {
    const r = engine.deferLeverage(U.state, v);
    U.feedback = r && r.ok === false ? '稍後處理未成。' : '此案暫緩，留待後議。';
    save(); render(); return true;
  }
  return false;
}


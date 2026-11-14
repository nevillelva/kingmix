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
const cardDesc = (c) => esc(c.desc ?? c.description ?? c.text ?? cardEffectText(c));
// 卡面效果：由 monthly 欄位列出，例如「農業 +0.4」。
const cardEffectText = (c) => Object.entries(c.monthly ?? {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('　');

// 每年（正月）三選一的策卡國策。已選定本年者不再顯示。
// 抽卡只在本年首次呈現時進行一次，結果寫入 state.policyCards.offer，並以 flags.policy_offer_year 記年；
// 之後重繪僅讀取既有 offer，不再重抽（drawPolicyCards 會覆寫 offer，故不可每次呼叫）。
export function policyCardsCard() {
  const s = U.state;
  if (!s || !s.alive || s.month !== 1 || !has('drawPolicyCards') || !has('choosePolicyCard')) return '';
  s.flags = s.flags || {};
  if (s.flags.policy_card_year === s.year) return '';
  if (s.flags.policy_offer_year !== s.year) {
    try { engine.drawPolicyCards(s, rng(s.year, 'policycards')); s.flags.policy_offer_year = s.year; } catch (e) { return ''; }
  }
  const ids = Array.isArray(s.policyCards?.offer) ? s.policyCards.offer : [];
  const defs = engine.POLICY_CARDS || {};
  const cards = ids.map((id) => ({ id, ...(defs[id] || {}) }));
  if (cards.length === 0) return '';
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
export function giveItemMenu(targetId, kind = 'official') {
  if (!has('giveItem') || !has('listInventory')) {
    return `<div class="loy">賜寶：引擎尚未就緒</div>`;
  }
  let inv = [];
  try { inv = engine.listInventory(U.state) || []; } catch (e) { inv = []; }
  inv = inv.filter((it) => (it.count ?? 0) > 0);
  if (inv.length === 0) return `<div class="loy">賜寶：庫中無寶物</div>`;
  // data-arg 格式：itemId|targetKind|targetId（giveItem 需要目標種類）。
  return `<details class="giveitem"><summary class="btn ghost mini">賜寶</summary><div class="opts">` +
    inv.map((it) => `<button class="opt" data-act="giveitem" data-arg="${esc(it.id)}|${esc(kind)}|${esc(targetId)}">
      <span class="mark">寶</span><span class="label">${esc(it.name ?? it.id)}（${it.count}）</span></button>`).join('') +
    `</div></details>`;
}

// 東廠密報的「稍後處理」按鈕。
export function deferButton(dc) {
  const ok = has('deferLeverage');
  return `<button class="btn ghost mini" data-act="defer" data-arg="${esc(dc.id ?? dc.officialId ?? '')}" ${ok ? '' : 'disabled'}>稍後處理${ok ? '' : '（引擎尚未就緒）'}</button>`;
}

// 暫緩之案取回鈕（東廠頁）。
export function flushButton() {
  return `<button class="btn ghost mini" data-act="flushdefer" ${has('flushDeferredLeverage') ? '' : 'disabled'}>取回暫緩之案</button>`;
}

// 本卡片的行動分派，由 onAgency 先行呼叫；已處理則回傳 true。
const REASON_TEXT = {
  bad_target_kind: '賜寶對象不合。', not_owned: '庫中無此寶物。', no_target: '查無此人。',
};
export function handleCardAct(a, v) {
  if (a === 'pickcard') {
    let r;
    try { r = engine.choosePolicyCard(U.state, v); } catch (e) { r = null; }
    const ok = !!r;
    U.feedback = ok ? '策卡已定，施行於本年。' : '此策卡未能施行。';
    if (ok) { U.state.flags = U.state.flags || {}; U.state.flags.policy_card_year = U.state.year; }
    save(); render(); return true;
  }
  if (a === 'giveitem') {
    const [itemId, kind, targetId] = v.split('|');
    const r = engine.giveItem(U.state, itemId, kind, targetId);
    U.feedback = r?.ok ? '寶物已賜出。' : `賜寶未成：${REASON_TEXT[r?.reason] ?? '無法賜予。'}`;
    save(); render(); return true;
  }
  if (a === 'defer') {
    // deferLeverage 回傳布林值（true＝已暫緩）。
    const ok = engine.deferLeverage(U.state, v) === true;
    U.feedback = ok ? '此案暫緩，留待後議。' : '稍後處理未成。';
    save(); render(); return true;
  }
  if (a === 'flushdefer') {
    // flushDeferredLeverage 回傳還原為待決的案件陣列。
    const back = engine.flushDeferredLeverage(U.state) || [];
    U.feedback = back.length ? `暫緩之案 ${back.length} 件已取回，待處置。` : '並無暫緩之案。';
    save(); render(); return true;
  }
  return false;
}

// web/ui/render-cards.js：策卡國策、寶物賜予、東廠稍後處理的畫面資料（Canvas 版）。
// 畫面以 blocks 回傳（見 canvas/d-parts.js）；點擊經 handleCardAct 執行，行為與舊版 DOM 介面相同。
import { U } from './store.js';
import { C } from './canvas/core.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { EFFECT } from './labels.js';
import { activeCards, activeSynergies, choosePolicyCard, drawPolicyCards, policyCardDef } from '../../src/cards.js';
import { giveItem, listInventory } from '../../src/items.js';
import { deferLeverage, flushDeferredLeverage } from '../../src/fastforward.js';

const policyName = (id) => { const c = policyCardDef(id); return c ? (c.name ?? c.label ?? id) : id; };
const policyEffectText = (id) => {
  const c = policyCardDef(id);
  return Object.entries(c?.monthly ?? {}).map(([k, v]) => `${EFFECT[k] ?? k} ${v > 0 ? '+' : ''}${v}`).join('　');
};

// 目前生效的策卡（activeCards）文字；無則空字串。
export function activeCardsText() {
  if (!U.state) return '';
  let ids = [];
  try { ids = activeCards(U.state) || []; } catch (e) { ids = []; }
  if (!Array.isArray(ids) || ids.length === 0) return '';
  return `生效策卡：${ids.map((id) => `${policyName(id)}（${policyEffectText(id)}）`).join('、')}`;
}

// 目前生效的策卡協同文字。
export function synergyText() {
  if (!U.state) return '';
  let list = [];
  try { list = activeSynergies(U.state) || []; } catch (e) { list = []; }
  if (!Array.isArray(list) || list.length === 0) return '';
  return `生效協同：${list.map((x) => x.name ?? x.label ?? x.id ?? '協同').join('、')}`;
}

// 每年（正月）三選一的策卡國策區塊。抽卡於月初由 prepareMonth 完成（A5）；此處僅讀取 offer，不再重抽。
// 已選定本年者、非正月、或尚未抽定者回傳空陣列。
export function policyOfferBlocks() {
  const s = U.state;
  if (!s || !s.alive || s.month !== 1 || !drawPolicyCards || !choosePolicyCard) return [];
  s.flags = s.flags || {};
  if (s.flags.policy_card_year === s.year) return [];
  if (s.flags.policy_offer_year !== s.year) return [];
  const ids = Array.isArray(s.policyCards?.offer) ? s.policyCards.offer : [];
  if (ids.length === 0) return [];
  const blocks = [
    { t: 'title', s: '年度策卡國策' },
    { t: 'text', s: `${s.year} 年　・　三選一，擇一施行` },
  ];
  for (const id of ids.slice(0, 3)) {
    const c = policyCardDef(id) || {};
    blocks.push({ t: 'text', s: `${c.name ?? id}　${c.desc ?? c.description ?? c.text ?? policyEffectText(id)}` });
    blocks.push({ t: 'btns', items: [{ label: `擇「${c.name ?? id}」`, onClick: () => handleCardAct('pickcard', id) }] });
  }
  const syn = synergyText();
  if (syn) blocks.push({ t: 'text', s: syn, size: 13 * C.U });
  return blocks;
}

// 寶物賜予：open 為 true 時列出庫中寶物（按鈕），否則只顯示「賜寶」展開鈕。
// onToggle 由畫面提供（切換展開狀態）。
export function giveItemBlocks(targetId, kind = 'official', open = false, onToggle = () => {}) {
  if (!listInventory) return [{ t: 'text', s: '賜寶：引擎尚未就緒' }];
  let inv = [];
  try { inv = listInventory(U.state) || []; } catch (e) { inv = []; }
  inv = inv.filter((it) => (it.count ?? 0) > 0);
  if (inv.length === 0) return [{ t: 'text', s: '賜寶：庫中無寶物' }];
  if (!open) return [{ t: 'btns', items: [{ label: '賜寶', onClick: onToggle, lac: false }] }];
  return [
    { t: 'btns', items: [{ label: '收起賜寶', onClick: onToggle, lac: false }] },
    { t: 'btns', items: inv.map((it) => ({
      label: `${it.name ?? it.id}（${it.count}）`,
      onClick: () => handleCardAct('giveitem', `${it.id}|${kind}|${targetId}`),
    })) },
  ];
}

// 東廠密報「稍後處理」按鈕（區塊）。
export function deferBlock(dc) {
  return { t: 'btns', items: [{ label: '稍後處理', onClick: () => handleCardAct('defer', String(dc.id ?? dc.officialId ?? '')) }] };
}

// 暫緩之案取回鈕（區塊）。
export function flushBlock() {
  return { t: 'btns', items: [{ label: '取回暫緩之案', onClick: () => handleCardAct('flushdefer', '') }] };
}

const REASON_TEXT = {
  bad_target_kind: '賜寶對象不合。', not_owned: '庫中無此寶物。', no_target: '查無此人。',
};

// 策卡區塊的行動分派（pickcard、giveitem、defer、flushdefer）；已處理則回傳 true。
export function handleCardAct(a, v) {
  if (a === 'pickcard') {
    let r;
    try { r = choosePolicyCard(U.state, v); } catch (e) { r = null; }
    const ok = !!r;
    const eff = policyEffectText(v);
    U.feedback = ok ? `已定策卡：${policyName(v)}${eff ? `（${eff}）` : ''}，施行於本年。` : '此策卡未能施行。';
    if (ok) { U.state.flags = U.state.flags || {}; U.state.flags.policy_card_year = U.state.year; }
    save(); render(); return true;
  }
  if (a === 'giveitem') {
    const [itemId, kind, targetId] = v.split('|');
    const r = giveItem(U.state, itemId, kind, targetId);
    U.feedback = r?.ok ? '寶物已賜出。' : `賜寶未成：${REASON_TEXT[r?.reason] ?? '無法賜予。'}`;
    save(); render(); return true;
  }
  if (a === 'defer') {
    // deferLeverage 回傳布林值（true＝已暫緩）。
    const ok = deferLeverage(U.state, v) === true;
    U.feedback = ok ? '此案暫緩，留待後議。' : '稍後處理未成。';
    save(); render(); return true;
  }
  if (a === 'flushdefer') {
    // flushDeferredLeverage 回傳還原為待決的案件陣列。
    const back = flushDeferredLeverage(U.state) || [];
    U.feedback = back.length ? `暫緩之案 ${back.length} 件已取回，待處置。` : '並無暫緩之案。';
    save(); render(); return true;
  }
  return false;
}

// ── 舊 DOM 相容（待 C 改寫 render-court.js 後移除）──
// 舊版 render-court.js 仍以 HTML 字串引用下列名稱；點擊仍經 onAgency → handleCardAct，行為不變。
export function deferButton(dc) {
  return `<button class="btn ghost mini" data-act="defer" data-arg="${String(dc.id ?? dc.officialId ?? '')}">稍後處理</button>`;
}
export function policyCardsCard() {
  const offer = U.state && U.state.policyCards && Array.isArray(U.state.policyCards.offer) ? U.state.policyCards.offer : [];
  const live = policyOfferBlocks().length > 0;
  const btns = live ? offer.slice(0, 3).map((id) => `<button class="opt zhu" data-act="pickcard" data-arg="${id}">${policyName(id)}</button>`).join('') : '';
  const line = activeCardsText();
  return (live ? `<section class="card"><h2>年度策卡國策</h2><div class="opts">${btns}</div></section>` : '') +
    (line ? `<div class="sub" style="margin:10px 0 0">${line}</div>` : '');
}

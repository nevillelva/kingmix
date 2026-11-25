// web/ui/render-memorial.js：奏摺（首奏與次奏）Canvas 版。事件、選項、效果籤、發言大臣、可能受影響之朝臣、親征入口、左右選取與次奏留中。
// 只讀取引擎狀態；裁決動作由呼叫端（render-court.js）以 handlers 傳入，點擊後仍走 game-flow.js。
import { afterOption, applyOption } from '../../src/turn.js';
import { isAvailable, optionOpen, recordEvent } from '../../src/events.js';
import { U } from './store.js';
import { rng } from './util.js';
import { STAT } from './labels.js';
import { sfx } from './audio.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { C } from './canvas/core.js';
import { txt, vstack, hrow, boxed, optionCard, speakerItem, affectedItem, btn, effectChipList, tag, onSwipe, guarded } from './canvas/court.js';

// 奏摺左右選取狀態：換了事件即歸零；n 為目前畫面上的可裁決項數（0 表示無首奏）。
export const memo = { key: null, sel: 0, n: 0 };
function syncMemo(ev) {
  const key = ev ? ev.id : null;
  if (memo.key !== key) { memo.key = key; memo.sel = 0; }
}

// 水平滑動（canvas/court.js 的 installSwipe）：左滑選下一項、右滑選上一項，僅於首奏可見時生效。
onSwipe((dir) => {
  if (memo.n > 1) memo.sel = (memo.sel + dir + memo.n) % memo.n;
});

// 可裁決之處置（與舊版相同的過濾）。
export function visibleOptions(ev) {
  return ev.options.filter((o) => isAvailable(o) && optionOpen(U.state, o));
}

// 可能受影響之朝臣（僅示意，規則與舊版 affectedPortraits 相同）。
export function affectedList(o, sp) {
  const keys = Object.keys(o.effects || {});
  const pool = U.state.officials.filter(x => x && (x.personName || x.name));
  let list = [];
  if (keys.includes('investigate_lowest')) {
    const low = [...pool].sort((a, b) => a.loyalty - b.loyalty)[0];
    if (low) list.push(low);
  }
  if (keys.some(k => ['official_loyalty_add', 'removeOfficial', 'tutor_teach'].includes(k))) {
    const same = pool.filter(x => sp.officialId && x.faction === (pool.find(p => p.id === sp.officialId) || {}).faction);
    list = list.concat(same.sort((a, b) => a.loyalty - b.loyalty).slice(0, 3));
  }
  const seen = new Set();
  return list.filter(x => !seen.has(x.id) && seen.add(x.id)).slice(0, 4);
}

// 發言大臣（左）與卷軸式敘事（右）並排。
export function narrRow(ev, sp, w) {
  const spW = Math.round(Math.min(150 * C.U, Math.max(120 * C.U, w * 0.4)));
  const nW = w - spW - 10 * C.U;
  return hrow([
    { w: spW, item: boxed(spW, (iw) => speakerItem(sp, iw), { pad: 8, r: 8 }) },
    { w: nW, item: boxed(nW, (iw) => vstack([
      txt(`${sp.role} 進言`, iw, 12, { color: '#7a5a3a' }),
      txt(ev.narrative || '', iw, 14),
    ], 4), { pad: 10, r: 8 }) },
  ]);
}

// 首奏：奏摺卡（每項處置一張，若有親征再加一張親征入口），以及左右選取列。
// handlers: { onPick(opt, ev), onCamp(opt, ev) }
// handlers: { onPick(opt, ev, stampKey), onCamp(opt, ev, stampKey) }；點擊經 guarded 防護（滑動放開後不裁決）。
export function memorialItem(ev, sp, w, handlers) {
  syncMemo(ev);
  const opts = visibleOptions(ev);
  const n = opts.length;
  memo.n = n;
  return boxed(w, (iw) => {
    const cards = [];
    opts.forEach((o, i) => {
      cards.push(optionCard(iw, {
        mark: o.key, label: o.label, zhu: true, sel: n > 1 && memo.sel === i,
        chips: effectChipList(o),
        extra: (ww) => affectedItem(affectedList(o, sp), ww),
        stampKey: `m${i}`,
        onClick: guarded(() => handlers.onPick(o, ev, `m${i}`)),
      }));
      if (o.effects && o.effects.war) {
        cards.push(optionCard(iw, {
          mark: '親', label: `${o.label}・親征`, zhu: true,
          hint: '三回合戰役：可偵察、選戰術、遣使議和（上一項為速決）',
          stampKey: `c${i}`,
          onClick: guarded(() => handlers.onCamp(o, ev, `c${i}`)),
        }));
      }
    });
    const navItems = [];
    if (n > 1) {
      const bw = Math.max(70 * C.U, (iw - 30 * C.U) / 4);
      const flexW = iw - 3 * bw - 3 * 10 * C.U;
      navItems.push(hrow([
        { w: bw, item: btn(bw, '◀ 上一項', guarded(() => { memo.sel = (memo.sel - 1 + n) % n; }), { h: 34 * C.U }) },
        { w: flexW, item: txt('左右滑動選擇，或點擊直接裁決', flexW, 11, { align: 'center', color: '#5a4a3a' }) },
        { w: bw, item: btn(bw, '下一項 ▶', guarded(() => { memo.sel = (memo.sel + 1) % n; }), { h: 34 * C.U }) },
        { w: bw, item: btn(bw, '裁決所選', guarded(() => handlers.onPick(opts[memo.sel], ev, `m${memo.sel}`)), { h: 34 * C.U, red: true }) },
      ]));
    }
    return vstack([
      tag(`御覽・${ev.name}`),
      txt('奏摺', iw, 12, { color: '#7a5a3a' }),
      txt(ev.name, iw, 22, { weight: 'bold' }),
      narrRow(ev, sp, iw),
      txt(`${n} 項處置可選`, iw, 13, { color: '#5a4a3a' }),
      vstack(cards, 8),
      ...navItems,
    ], 8);
  }, { pad: 12, r: 10 });
}

// 次奏：可略過；裁決不推進月份、不計行動次數。handlers: { onPick(opt, ev, stampKey), onSkip() }
export function secondItem(ev, sp, w, handlers) {
  const opts = visibleOptions(ev);
  return boxed(w, (iw) => vstack([
    tag(`次奏・${ev.name}`),
    txt('次奏　・　可略過', iw, 12, { color: '#7a5a3a' }),
    txt(ev.name, iw, 22, { weight: 'bold' }),
    narrRow(ev, sp, iw),
    txt(`${opts.length} 項處置可選；略過則不作處置，亦不計入行動次數。`, iw, 13, { color: '#5a4a3a' }),
    vstack(opts.map((o, i) => optionCard(iw, {
      mark: o.key, label: o.label, zhu: true, chips: effectChipList(o), stampKey: `s${i}`,
      onClick: guarded(() => handlers.onPick(o, ev, `s${i}`)),
    })), 8),
    btn(Math.min(iw, 150 * C.U), '略過此則', guarded(handlers.onSkip), { lac: false, h: 34 * C.U }),
  ], 8), { pad: 12, r: 10 });
}

// 次奏裁決：不推進月份、不計行動次數；第 1 則仍待裁決，月份由第 1 則推進。
export function chooseSecond(opt, ev) {
  const before = { ...U.state.stats };
  recordEvent(U.state, ev.id);
  applyOption(U.state, opt, rng(U.state.year, U.state.month, 'morning2', 'recruit'));
  afterOption(U.state, ev, opt);
  U.state.monthChain.secondDone = true;
  const parts = Object.keys(STAT).map(k => {
    const d = Math.round(U.state.stats[k] - before[k]);
    return d ? `${STAT[k].l}${d > 0 ? '+' : ''}${d}` : null;
  }).filter(Boolean);
  U.feedback = `次奏所選：${opt.label}。${parts.length ? '數值變化：' + parts.join('、') : '數值無明顯變化。'}`;
  sfx('pick');
  save(); render();
}

// 次奏留中：標記為已處理，不作處置。
export function skipSecond() {
  U.state.monthChain.secondDone = true;
  U.feedback = '次奏留中，未作處置。';
  save(); render();
}

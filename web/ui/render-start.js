// web/ui/render-start.js：開局畫面（Canvas 版）。保留舊版起始頁的全部選項：本機損毀提示、種子、年號（含預設）、本紀劇本、
// 局長模式、即位出身、開局祖訓（0–2）、即位國策（1–2）、開局策卡（3–5 或全部）、解鎖提示，以及開始新局／續玩雲端／續玩本機。
import { prepareMonth } from '../../src/month-start.js';
import { ACCESSION_POLICY_MAX, POLICIES, POLICY_KEYS } from '../../src/policy.js';
import { SCENARIO_DEFS, UNLOCKABLE_SCENARIOS, scenarioDef } from '../../src/scenarios.js';
import { ERA_REASON_TEXT, PRESET_ERAS, migrateEraLog, validateEra } from '../../src/era.js';
import { DEFAULT_MODE, MODES } from '../../src/mode.js';
import { ORIGINS, UNLOCKABLE_ORIGINS } from '../../src/origin.js';
import { CARD_TAGS, OPENING_DECK_MAX, OPENING_DECK_MIN, POLICY_CARDS, openingPoolIds } from '../../src/cards.js';
import { isUnlocked, unlockRequirementText } from '../../src/unlocks.js';
import { EDICT_DEFS, validateEdictChoice } from '../../src/edicts.js';
import { loadUnlocks, syncUnlocks, UNLOCK_FAIL_MSG } from './unlock-store.js';
import { U } from './store.js';
import { cloudSave, corruptBackupFailing, discardCorruptSave, load, reasonText, save, saveMsg, saveTextFile } from './state-io.js';
import { newGame } from './game-flow.js';
import { currentEventPool } from './event-pool.js';
import { render } from './render-bus.js';
import { C } from './canvas/core.js';
import { hit, editText } from './canvas/input.js';
import { button, panel, text, measureLines, seal } from './canvas/widgets.js';
import { INK, LAC_TEXT, RED } from './canvas/theme.js';

// 開局表單狀態（模組層級，重繪時保留；與舊版 DOM 欄位對應）。
const F = {
  seed: '',
  era: '',
  scen: '',                 // '' 為一般開局
  mode: DEFAULT_MODE,
  origin: ORIGINS[0].id,    // 即位出身
  edicts: [],               // 開局祖訓（0–2 條）
  field: null,              // 目前文字欄位（'seed' | 'era'）
  msg: { era: '', edict: '', acc: '', deck: '' }, // 各區域的提示訊息
};

// 還原開局表單為預設（測試與重新開局前使用；不影響存檔）。
export function resetStartForm() {
  F.seed = ''; F.era = ''; F.scen = ''; F.mode = DEFAULT_MODE; F.origin = ORIGINS[0].id;
  F.edicts = []; F.field = null; F.msg = { era: '', edict: '', acc: '', deck: '' };
  cache = null;
}

// 解鎖與存檔讀取結果快取（每 0.5 秒更新，避免每幀解析存檔）。
let cache = null;
let cacheAt = -Infinity;
function snapshot() {
  if (cache && C.T - cacheAt < 0.5) return cache;
  const saved = load();
  const corrupt = saved && saved.corrupt ? saved : null;
  const unlockSync = syncUnlocks(saved && saved.state && !saved.corrupt ? saved.state : null);
  cache = { saved, corrupt, cs: cloudSave(), unlockRec: unlockSync.record, writeFailed: unlockSync.writeFailed };
  cacheAt = C.T;
  return cache;
}

const statModText = (mods) => Object.entries(mods).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('、');
const originLocked = (id) => !isUnlocked(loadUnlocks(), 'origin', id);

// 排版：以內容寬度置中，y 為游標（由上往下）。回傳新的 y。
function layout() {
  const U_ = C.U;
  const cw = Math.min(C.W - 24 * U_, 640 * U_);
  return { U: U_, x: (C.W - cw) / 2, cw, pad: 10 * U_ };
}

function heading(L, y, t) {
  const s = text(t, L.x, y, { size: 18 * L.U, weight: 'bold', color: INK, maxW: L.cw });
  return s + 4 * L.U + 2 * L.U;
}

function label(L, y, t) {
  return text(t, L.x, y, { size: 14 * L.U, weight: 'bold', color: INK, maxW: L.cw }) + 6 * L.U;
}

function hint(L, y, t, tone) {
  if (!t) return 0;
  return text(t, L.x, y, { size: 13 * L.U, color: tone === 'err' ? RED : '#5a4f45', maxW: L.cw }) + 6 * L.U;
}

// 多行卡片（選項）：on 為選取（紅漆），off 為停用（灰字不可點，why 為提示）。回傳高度。
function card(L, y, w, lines, opts = {}) {
  const pad = L.pad;
  const color = opts.off ? '#8a7f70' : opts.on ? LAC_TEXT : INK;
  let h = pad * 2;
  const measured = lines.map(l => {
    const size = l.size * L.U;
    const ls = measureLines(l.t, w - 2 * pad, size, l.weight || '');
    const lh = size * 1.45;
    h += ls.length * lh + (l.gap || 0) * L.U;
    return { ...l, size, ls, lh };
  });
  panel(L.x, y, w, h, { lac: !!opts.on, r: 8 });
  let ty = y + pad;
  for (const m of measured) {
    text(m.t, L.x + pad, ty, { size: m.size, weight: m.weight || '', color: m.color || color, maxW: w - 2 * pad, lh: 1.45 });
    ty += m.ls.length * m.lh + (m.gap || 0) * L.U;
  }
  hit({ x: L.x, y, w, h }, opts.onClick || (() => {}), { disabled: !!opts.off, why: opts.why || '目前無法選擇' });
  return h + 8 * L.U;
}

// 選項格（兩欄，窄版一欄）。items: [{ lines, on, off, why, onClick }]
function grid(L, y, items) {
  const cols = L.cw >= 480 * L.U ? 2 : 1;
  const gap = 8 * L.U;
  const w = (L.cw - (cols - 1) * gap) / cols;
  let cy = y;
  for (let i = 0; i < items.length; i += cols) {
    let rowH = 0;
    for (let j = 0; j < cols && i + j < items.length; j++) {
      const it = items[i + j];
      const x = L.x + j * (w + gap);
      const sub = { ...L, x };
      const h = card(sub, cy, w, it.lines, it);
      rowH = Math.max(rowH, h);
    }
    cy += rowH;
  }
  return cy - y;
}

// 單行按鈕列（多個）：自動換行。
function buttonRow(L, y, items, btnH = 38 * L.U) {
  const gap = 8 * L.U;
  let cx = L.x, cy = y;
  for (const it of items) {
    const w = Math.max(96 * L.U, Math.min(L.cw, it.w || (it.label.length * 16 * L.U + 36 * L.U)));
    if (cx > L.x && cx + w > L.x + L.cw) { cx = L.x; cy += btnH + gap; }
    button(cx, cy, w, btnH, it.label, it.onClick, { lac: !!it.lac, off: it.off, why: it.why, fs: 14 * L.U });
    cx += w + gap;
  }
  return cy + btnH - y;
}

// 文字欄位：點擊後以隱藏的 <input id="ime"> 接收輸入（支援中文輸入法）。
function field(L, y, key, title, placeholder) {
  let h = label(L, y, title);
  const bh = 40 * L.U;
  const val = F[key];
  panel(L.x, y + h, L.cw, bh, { r: 6, fill: 'rgba(255,250,236,.95)' });
  const shown = val === '' ? placeholder : val;
  text(shown, L.x + 10 * L.U, y + h + 11 * L.U, { size: 15 * L.U, color: val === '' ? '#8a7f70' : INK, maxW: L.cw - 20 * L.U });
  if (F.field === key && Math.floor(C.T * 2) % 2 === 0) {
    C.ctx.fillStyle = INK;
    C.ctx.fillRect(L.x + 12 * L.U + Math.min(L.cw - 40 * L.U, C.ctx.measureText(val).width), y + h + 9 * L.U, 2 * L.U, bh - 18 * L.U);
  }
  hit({ x: L.x, y: y + h, w: L.cw, h: bh }, () => beginEdit(key));
  return h + bh + 10 * L.U;
}

function beginEdit(key) {
  F.field = key;
  editText(F[key], v => { F[key] = v; if (key === 'era') F.msg.era = ''; });
}

// 開局時的驗證與啟動（與舊版 start 按鈕相同順序與訊息）。
function startNew(cacheSnap) {
  const raw = F.era.trim();
  if (raw !== '') {
    const v = validateEra(raw);
    if (!v.ok) { F.msg.era = ERA_REASON_TEXT[v.reason]; return; }
  }
  const deckN = U.openingDeck.length;
  if (deckN !== 0 && (deckN < OPENING_DECK_MIN || deckN > OPENING_DECK_MAX)) {
    F.msg.deck = `開局策卡須選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張，或全部不選。`;
    return;
  }
  if (F.scen && !isUnlocked(cacheSnap.unlockRec, 'scenario', F.scen)) { F.msg.era = '此劇本尚未解鎖。'; return; }
  if (originLocked(F.origin)) { F.msg.era = '此出身尚未解鎖，請改選其他出身。'; return; }
  const ev = validateEdictChoice(F.edicts, loadUnlocks());
  if (!ev.ok) { F.msg.era = '祖訓選擇不合規（最多 2 條，且須已解鎖），請重新勾選。'; return; }
  // 出身於開局時套用，早於月初準備（首月奏摺即含出身專屬事件）。
  newGame(F.seed.trim(), F.scen, raw, U.accPolicies.slice(), F.mode, U.openingDeck.slice(), ev.ids, F.origin);
}

function resumeSaved(state, seed) {
  U.seed = seed; U.state = state; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool());
  U.reviewedCount = (U.state.annals || []).length;
}

// 解鎖寫入失敗提示（A-048）：只在寫入失敗狀態由「否」轉「是」時提示一次，不於每幀重複推送。
let lastUnlockFail = false;
export function unlockFailNotice(prev, now) { return !!now && !prev; }

// 損毀提示卡：匯出損毀存檔、開新局（開新局前另存備份）。備份失敗時常駐警示（A-002）。
function corruptCard(L, y, corrupt) {
  const lines = [
    { t: '本機存檔損毀', size: 16, weight: 'bold' },
    { t: `瀏覽器中的自動存檔無法讀取（${reasonText(corrupt.error)}），已停止使用。可先匯出損毀存檔留底，或開新局（開新局前會將損毀內容另存於瀏覽器備份）。`, size: 13, gap: 8 },
  ];
  if (corruptBackupFailing()) lines.push({ t: '上次無法備份損毀存檔（儲存空間可能已滿），開新局前請先按「匯出損毀存檔」留底。', size: 13, color: RED, gap: 8 });
  let h = card(L, y, L.cw, lines, {});
  h += buttonRow(L, y + h, [
    { label: '匯出損毀存檔', onClick: () => { const d = new Date().toISOString().slice(0, 10); saveTextFile(`kingmix-save-corrupt-${d}.json`, corrupt.raw); } },
    { label: '開新局', lac: true, onClick: () => { if (discardCorruptSave(corrupt.raw)) render(); } },
  ]) + 4 * L.U;
  return h;
}

export function renderStart() {
  const L = layout();
  const snap = snapshot();
  const corrupt = snap.corrupt;
  if (unlockFailNotice(lastUnlockFail, snap.writeFailed)) saveMsg(UNLOCK_FAIL_MSG);
  lastUnlockFail = !!snap.writeFailed;
  const unlockRec = snap.unlockRec;
  let y = 14 * L.U;

  if (corrupt) y += corruptCard(L, y, corrupt) + 10 * L.U;

  // 英雄區：朱印與即位說明
  seal(C.W / 2, y + 34 * L.U, 56 * L.U, '帝', 0);
  y += 72 * L.U;
  text('即位登基', C.W / 2, y, { size: 24 * L.U, weight: 'bold', color: INK, align: 'center', maxW: L.cw });
  y += 36 * L.U;
  y += text('以一位新君治理國家。每月奏摺由你裁決，朝政、後宮與東廠的走向，皆由選擇累積而成。', L.x, y, { size: 14 * L.U, color: '#5a4f45', maxW: L.cw, align: 'left' }) + 16 * L.U;

  // ── 開啟新局
  y += heading(L, y, '開啟新局');
  y += field(L, y, 'seed', '種子（相同種子與相同選擇，結果一致）', '留空即隨機');
  y += field(L, y, 'era', '年號（1–4 字，留空為「永和」）', '自訂年號，或點選下方預設');
  y += buttonRow(L, y, PRESET_ERAS.map(n => ({ label: n, w: L.cw / 3 - 8 * L.U, onClick: () => { F.era = n; F.msg.era = ''; } })), 36 * L.U) + 6 * L.U;
  y += hint(L, y, F.msg.era, 'err');

  // 本紀劇本
  y += label(L, y, '本紀劇本（選用）');
  const scenItems = [{ id: '', name: '一般開局（不選劇本）', locked: false }, ...Object.values(SCENARIO_DEFS).map(s => ({ id: s.id, name: s.name, locked: !isUnlocked(unlockRec, 'scenario', s.id) }))];
  y += grid(L, y, scenItems.map(s => ({
    lines: [{ t: s.locked ? `${s.name}（未解鎖）` : s.name, size: 15, weight: 'bold' }],
    on: F.scen === s.id,
    off: s.locked,
    why: '此劇本尚未解鎖',
    onClick: () => { F.scen = s.id; },
  })));
  {
    const d = scenarioDef(F.scen);
    y += text(d ? `${d.summary}　${d.goalText}` : '不選劇本，即為自由治國的一般開局。', L.x, y, { size: 13 * L.U, color: '#5a4f45', maxW: L.cw }) + 12 * L.U;
  }

  // 局長模式
  y += label(L, y, '局長模式');
  y += grid(L, y, Object.values(MODES).map(m => ({
    lines: [{ t: `${m.label}（${m.months / 12} 年）`, size: 15, weight: 'bold' }],
    on: F.mode === m.key,
    onClick: () => { F.mode = m.key; },
  })));
  y += 8 * L.U;

  // 即位出身
  y += label(L, y, '即位出身（選 1 種，各有開局數值與利弊）');
  y += grid(L, y, [...ORIGINS, ...UNLOCKABLE_ORIGINS].map(o => {
    const locked = originLocked(o.id);
    if (locked) return {
      lines: [{ t: `${o.name}（未解鎖）`, size: 15, weight: 'bold' }, { t: unlockRequirementText('origin', o.id), size: 13 }],
      off: true, why: '此出身尚未解鎖',
    };
    return {
      on: o.id === F.origin,
      lines: [
        { t: o.name, size: 15, weight: 'bold' },
        { t: o.desc, size: 13 },
        { t: `開局：${statModText(o.statMods)}`, size: 13 },
        { t: `利：${o.pros.join('；')}`, size: 13 },
        { t: `弊：${o.cons.join('；')}`, size: 13 },
      ],
      onClick: () => { F.origin = o.id; },
    };
  }));
  y += 8 * L.U;

  // 開局祖訓
  y += label(L, y, '開局祖訓（選 0–2 條，須已解鎖；本局只看此時的選擇）');
  y += grid(L, y, EDICT_DEFS.map(d => {
    const locked = !isUnlocked(unlockRec, 'edict', d.id);
    if (locked) return { lines: [{ t: `${d.name}（未解鎖）`, size: 15, weight: 'bold' }, { t: unlockRequirementText('edict', d.id), size: 13 }], off: true, why: '此祖訓尚未解鎖' };
    const on = F.edicts.includes(d.id);
    return {
      on,
      lines: [{ t: d.name, size: 15, weight: 'bold' }, { t: d.desc, size: 13 }],
      onClick: () => {
        if (on) F.edicts = F.edicts.filter(x => x !== d.id);
        else if (F.edicts.length < 2) F.edicts = [...F.edicts, d.id];
        else { F.msg.edict = '祖訓最多選 2 條，請先取消一條。'; return; }
        F.msg.edict = '';
      },
    };
  }));
  y += hint(L, y + 4 * L.U, F.msg.edict, 'err') + 6 * L.U;

  // 即位國策
  y += label(L, y, '即位國策（選 1–2 條）');
  y += grid(L, y, POLICY_KEYS.map(k => {
    const i = U.accPolicies.indexOf(k), on = i >= 0;
    const tag = on ? (i === 0 ? '主策：' : '輔策：') : '';
    return {
      on,
      lines: [{ t: `${tag}${POLICIES[k].name}`, size: 15, weight: 'bold' }],
      onClick: () => {
        if (on) {
          if (U.accPolicies.length === 1) { F.msg.acc = '至少需保留一條國策。'; return; }
          U.accPolicies = U.accPolicies.filter(x => x !== k);
        } else if (U.accPolicies.length < ACCESSION_POLICY_MAX) {
          U.accPolicies = [...U.accPolicies, k];
        } else { F.msg.acc = `最多選 ${ACCESSION_POLICY_MAX} 條，請先取消一條。`; return; }
        F.msg.acc = '';
      },
    };
  }));
  y += hint(L, y + 4 * L.U, F.msg.acc || `已選 ${U.accPolicies.length} / ${ACCESSION_POLICY_MAX} 條。第一條為主策；輔策效果減半（暫定）。`, 'plain');

  // 開局策卡
  const pool = openingPoolIds(null);
  y += label(L, y, `開局策卡（選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張作為本局卡池；不選則沿用全部策卡）`);
  y += grid(L, y, pool.map(id => {
    const cd = POLICY_CARDS[id];
    const on = U.openingDeck.includes(id);
    const tags = cd.tags.map(t => CARD_TAGS[t]).join('');
    return {
      on,
      lines: [{ t: `${on ? '已選：' : ''}${cd.name}（${tags}）`, size: 14, weight: 'bold' }],
      onClick: () => {
        if (U.openingDeck.includes(id)) {
          U.openingDeck = U.openingDeck.filter(x => x !== id);
        } else if (U.openingDeck.length < OPENING_DECK_MAX) {
          U.openingDeck = openingPoolIds(null).filter(x => x === id || U.openingDeck.includes(x));
        } else { F.msg.deck = `最多選 ${OPENING_DECK_MAX} 張，請先取消一張。`; return; }
        F.msg.deck = '';
      },
    };
  }));
  const deckHint = F.msg.deck || (U.openingDeck.length === 0
    ? `未選擇則沿用全部 ${pool.length} 張策卡。可選 ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張作為本局卡池。`
    : `已選 ${U.openingDeck.length} / ${OPENING_DECK_MIN}–${OPENING_DECK_MAX} 張。`);
  y += hint(L, y + 4 * L.U, deckHint, F.msg.deck ? 'err' : 'plain');

  // 解鎖提示
  const lockedHints = [
    ...UNLOCKABLE_ORIGINS.filter(o => !isUnlocked(unlockRec, 'origin', o.id)).map(o => `出身「${o.name}」：${unlockRequirementText('origin', o.id)}`),
    ...Object.values(UNLOCKABLE_SCENARIOS).filter(s => !isUnlocked(unlockRec, 'scenario', s.id)).map(s => `劇本「${s.name}」：${unlockRequirementText('scenario', s.id)}`),
  ];
  if (lockedHints.length) y += text(`尚未解鎖：${lockedHints.join('；')}。於各局達成對應稱號即可解鎖。`, L.x, y, { size: 13 * L.U, color: '#5a4f45', maxW: L.cw }) + 10 * L.U;

  // 動作列
  const actions = [{ label: '開始新局', lac: true, onClick: () => startNew(snap) }];
  if (snap.cs && snap.cs.state) {
    actions.push({ label: `繼續雲端進度（${new Date(snap.cs.savedAt).toLocaleString('zh-TW')}）`, w: L.cw, onClick: () => { resumeSaved(snap.cs.state, snap.cs.seed); save(); render(); } });
  }
  if (snap.saved && snap.saved.state) {
    actions.push({ label: '繼續本機進度', onClick: () => { resumeSaved(snap.saved.state, snap.saved.seed); render(); } });
  }
  y += buttonRow(L, y + 6 * L.U, actions) + 24 * L.U;

  C.contentH = y;
}

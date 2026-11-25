// web/ui/overlays.js：覆蓋層（Canvas）。新手提要、禪位確認、年號覆蓋層與新年去重；皆以 dialog.js 的堆疊對話框呈現。
import { eraYearText } from '../../src/era.js';
import { U } from './store.js';
import { finishMonth } from './game-flow.js';
import { sfx } from './audio.js';
import { openCanvasDialog } from './dialog.js';

// ── 新手提要：僅新局首月顯示；關閉後寫入 localStorage（失敗則本次工作階段內隱藏）
export const GUIDE_KEY = 'kingmix-guide-v1';

export const GUIDE_LINES = Object.freeze([
  '奏摺：早朝臣子呈上奏摺，點選或左右滑動即可裁決，每一道批示都會留下後果。',
  '太和殿：朝政奏摺處理之所，待批件數顯示於此，亦可在此快進。',
  '快進：於太和殿連續推進至多 12 個月，奏摺由系統代為批閱，遇大事即停。',
  '時段：一日分早朝、午後與夜間。早朝批閱奏摺；午後三選一、夜間二選一，行動有限，不可盡取。',
]);

export function guideDismissed(){ try { return localStorage.getItem(GUIDE_KEY) !== null; } catch (e) { return false; } }

let guideOpen = false;

function dismissGuide(){
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
  U.guideArmed = false;
  guideOpen = false;
}

export function guideMount(){
  if (!U.guideArmed || !U.state) return;
  if (!U.state.alive || U.state.month !== 1 || guideDismissed()) { U.guideArmed = false; return; }
  if (guideOpen) return;
  guideOpen = true;
  openCanvasDialog({
    title: '初入宮城・御前提要',
    body: GUIDE_LINES.map((l) => `・${l}`).join('\n'),
    buttons: [{ key: 'ok', label: '知道了', plain: true }],
    dismissible: true,
    onButton: (_k, close) => { dismissGuide(); close(); },
    onClose: () => dismissGuide(), // 任何關閉方式（按鈕、Esc、點背景）皆視為已看過
  });
}

// 禪位確認：頁內對話框（不使用 confirm()），取消或 Esc 即關閉；確認後結束本世，由太子或成年皇子即位。
export function openResignDialog(){
  const heir = U.state.dynasty.crownPrince ? U.state.heirs.find(h => h.id === U.state.dynasty.crownPrince) : null;
  const who = heir ? `太子${heir.personName || heir.name}` : '成年皇子中擇定之人';
  openCanvasDialog({
    title: '禪位予皇子',
    body: `禪位即結束本世，由${who}即位。此舉不可復原，史冊將記下此次禪位。`,
    buttons: [{ key: 'cancel', label: '取消', plain: true }, { key: 'ok', label: '確認禪位' }],
    dismissible: true,
    onButton: (key, close) => {
      if (key === 'ok') { close(); confirmResign(); return; }
      close();
    },
  });
}

export function confirmResign(){
  if (!U.state || !U.state.alive) return;
  U.state.campaign = null;
  U.state.alive = false; U.state.endReason = 'resigned';
  U.feedback = '';
  finishMonth();
}

// ── 新年年號覆蓋層：每逢一月第一次進入時顯示，點擊或 Esc 關閉；每局每年一次。改元時亦即時顯示 ──
export const shownNewYear = new Set();

// 每個種子只存一鍵 kingmix.newyear.<seed>，值為最後顯示的年份（舊格式鍵於 main.js 開機時清除）。
export function newYearKey(){ return `kingmix.newyear.${U.seed}`; }

function lastNewYearShown(key){
  try { const v = localStorage.getItem(key); return v === null ? null : Number(v); } catch (e) { return null; }
}

export function markNewYearShown(){
  const key = newYearKey();
  shownNewYear.add(`${key}#${U.state.year}`);
  try { localStorage.setItem(key, String(U.state.year)); } catch (e) {}
}

export function openNianhao(title, sub){
  openCanvasDialog({
    title,
    body: `第${U.state.dynasty.generation}世 · ${U.state.year}年\n${sub}`,
    buttons: [{ key: 'ok', label: '點擊繼續' }],
    dismissible: true,
    onButton: (_k, close) => close(),
  });
  sfx('bell');
}

export function showNewYear(){
  if (!U.state || !U.state.alive || U.state.month !== 1) return;
  const key = newYearKey(), year = U.state.year, mark = `${key}#${year}`;
  if (shownNewYear.has(mark) || lastNewYearShown(key) === year) return;
  markNewYearShown();
  openNianhao(eraYearText(U.state), '新歲伊始，萬象更新。');
}

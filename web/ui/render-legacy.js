// web/ui/render-legacy.js：歷代帝王（史冊）畫面（Canvas）與跨局紀錄存取。
import { legacyFromState, recordRun, summarizeLegacy } from '../../src/legacy.js';
import { DEFAULT_MODE } from '../../src/mode.js';
import { U } from './store.js';
import { save } from './state-io.js';
import { LEGACY_END, MODE_TEXT } from './labels.js';
import { registerScreen, setScreen } from './canvas/core.js';
import { panel, text, measureLines } from './canvas/widgets.js';
import { INK } from './canvas/theme.js';
import { drawTable } from './dialog.js';

// ── 歷代帝王：跨局史冊存於 localStorage；一局結束時記錄一次（以 state.legacyRecorded 防重）。
export const LEGACY_KEY = 'kingmix-legacy-v1';
export function loadLegacy(){ try { const r = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }

export function recordLegacyOnce(){
  if (!U.state || U.state.alive || U.state.legacyRecorded) return;
  try {
    const next = recordRun(loadLegacy(), { ...legacyFromState(U.state), mode: U.state.mode ?? DEFAULT_MODE });
    localStorage.setItem(LEGACY_KEY, JSON.stringify(next));
  } catch (e) {}
  U.state.legacyRecorded = true;
  save();
}

export const LEGACY_COLS = Object.freeze([
  { label: '局', weight: 0.6 }, { label: '模式', weight: 1.2 }, { label: '種子', weight: 1.4 }, { label: '在位年', weight: 0.9 },
  { label: '世數', weight: 0.8 }, { label: '結局', weight: 1.4 }, { label: '稱號', weight: 1.6 },
]);

// 表列與統計（純函式）：最新一局列於最上。
export function legacyModel(runs){
  const sum = summarizeLegacy(runs);
  const rows = runs.slice().reverse().map((r, i) => [
    runs.length - i, MODE_TEXT[r.mode] ?? '—', r.seed ?? '—', r.years ?? '—', r.generations ?? '—',
    LEGACY_END[r.endReason] ?? r.endReason ?? '—', r.finalTitle ?? '—',
  ]);
  const sub = `共 ${sum.runs} 局　平均在位 ${sum.avgYears} 年${sum.bestTitle ? `　首見稱號：${sum.bestTitle}` : ''}`;
  return { sum, rows, sub };
}

export const LEGACY_EMPTY = '尚無已結束的局，待一局終了後，史冊方會記下。';

// 繪製（Canvas）：由 registerScreen('legacy') 每幀呼叫。
export function drawLegacy(C){
  const runs = loadLegacy();
  const m = legacyModel(runs);
  const u = C.U || 1, x = (C.content?.x || 0) + 12 * u, w = (C.content?.w || C.W) - 24 * u;
  let y = (C.content?.y || 0) + 12 * u;
  const pad = 14 * u, subLines = measureLines(m.sub, w - 28 * u, 13 * u, '');
  const cardH = 12 * u + 12 * u * 1.45 + 2 * u + 20 * u * 1.45 + 6 * u + subLines.length * 13 * u * 1.45 + 18 * u;
  panel(x, y, w, cardH, {});
  text('史冊', x + pad, y + 12 * u, { size: 12 * u, color: INK });
  text('歷代帝王', x + pad, y + 12 * u + 12 * u * 1.45 + 2 * u, { size: 20 * u, weight: 'bold', color: INK });
  text(m.sub, x + pad, y + 12 * u + 12 * u * 1.45 + 2 * u + 20 * u * 1.45 + 6 * u, { size: 13 * u, color: INK, maxW: w - 28 * u });
  y += cardH + 10 * u;
  if (runs.length) {
    C.contentH = Math.max(C.contentH || 0, y + drawTable(C, { x, y, w, cols: LEGACY_COLS, rows: m.rows }) + 40 * u);
  } else {
    panel(x, y, w, 60 * u, {});
    text(LEGACY_EMPTY, x + pad, y + 20 * u, { size: 14 * u, color: INK, maxW: w - 28 * u });
    C.contentH = Math.max(C.contentH || 0, y + 80 * u);
  }
}

// 切換至歷代帝王畫面（原 renderLegacy 之進入點）。
export function renderLegacy(){ setScreen('legacy'); }

registerScreen('legacy', drawLegacy);

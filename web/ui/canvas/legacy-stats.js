// web/ui/canvas/legacy-stats.js：歷代「統計對照」畫面（Canvas）與帝王表／統計對照分頁列。
// 只讀既有史冊紀錄（localStorage 的 kingmix-legacy-v1），不新增儲存欄位。
import { summarizeLegacy } from '../../../src/legacy.js';
import { registerScreen, setScreen } from './core.js';
import { panel, text, button, measureLines } from './widgets.js';
import { INK } from './theme.js';
import { U } from '../store.js';
import { LEGACY_END, MODE_TEXT } from '../labels.js';
import { loadLegacy } from '../legacy-store.js';

export const LEGACY_TABS = Object.freeze([
  { key: 'legacy', label: '帝王表' },
  { key: 'legacy-stats', label: '統計對照' },
]);

export const LEGACY_STATS_EMPTY = '尚無已結束的局，待一局終了後，史冊方會記下。';

// 統計與各朝對照列（純函式）：最新一局列於最上；稱號與結局依次數遞減排序。
export function legacyStatsModel(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const sum = summarizeLegacy(list);
  const years = list.map(r => r.years).filter(Number.isFinite);
  const maxYears = years.length ? Math.max(...years) : 0;
  const endDist = Object.entries(sum.endReasonCounts)
    .map(([key, count]) => ({ key, label: LEGACY_END[key] ?? key, count }))
    .sort((a, b) => b.count - a.count);
  const titleCount = {};
  for (const r of list) if (r.finalTitle != null) titleCount[r.finalTitle] = (titleCount[r.finalTitle] || 0) + 1;
  const titleDist = Object.entries(titleCount)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const rows = list
    .map((r, i) => ({
      no: i + 1,
      mode: MODE_TEXT[r.mode] ?? '—',
      years: r.years ?? '—',
      generations: r.generations ?? '—',
      end: LEGACY_END[r.endReason] ?? r.endReason ?? '—',
      title: r.finalTitle ?? '—',
    }))
    .reverse();
  return { runs: sum.runs, avgYears: sum.avgYears, maxYears, endDist, titleDist, rows };
}

// 切換分頁：同時更新 U.tab，使 render-nav 的分派（setScreen(U.tab)）與之一致。
export function switchLegacyTab(key) {
  U.tab = key;
  setScreen(key);
}

// 分頁列（兩顆鈕）；回傳列高。供帝王表畫面於頂部呼叫，active 為目前頁的 key。
export function drawLegacyTabs(C, active, y) {
  const u = C.U || 1;
  const x0 = (C.content?.x || 0) + 12 * u;
  const w = (C.content?.w || C.W) - 24 * u;
  const gap = 8 * u, h = 34 * u, tw = (w - gap) / LEGACY_TABS.length;
  LEGACY_TABS.forEach((t, i) => {
    button(x0 + i * (tw + gap), y, tw, h, t.label, () => switchLegacyTab(t.key), { lac: t.key === active, fs: 14 * u });
  });
  return h;
}

// 單一區塊：面板＋標題＋逐行文字（超寬自動換行）；回傳區塊高度。
function block(C, x, y, w, title, lines) {
  const u = C.U || 1;
  const pad = 14 * u, size = 13 * u, lh = size * 1.45, innerW = w - 28 * u;
  const body = lines.flatMap(s => measureLines(String(s), innerW, size, ''));
  const titleH = 20 * u * 1.45;
  const h = pad + titleH + 4 * u + body.length * lh + pad;
  panel(x, y, w, h, {});
  text(title, x + pad, y + pad, { size: 16 * u, weight: 'bold', color: INK });
  let yy = y + pad + titleH + 4 * u;
  for (const ln of body) { text(ln, x + pad, yy, { size, color: INK, maxW: innerW }); yy += lh; }
  return h;
}

// 繪製（Canvas）：由 registerScreen('legacy-stats') 每幀呼叫；runs 預設讀取既有史冊。
export function drawLegacyStats(C, runs = loadLegacy()) {
  const u = C.U || 1;
  const x = (C.content?.x || 0) + 12 * u;
  const w = (C.content?.w || C.W) - 24 * u;
  let y = (C.content?.y || 0) + 12 * u;
  y += drawLegacyTabs(C, 'legacy-stats', y) + 12 * u;

  const m = legacyStatsModel(runs);
  if (!m.runs) {
    y += block(C, x, y, w, '統計對照', [LEGACY_STATS_EMPTY]) + 10 * u;
  } else {
    y += block(C, x, y, w, '總覽', [
      `共 ${m.runs} 局`,
      `平均在位 ${m.avgYears} 年`,
      `最長在位 ${m.maxYears} 年`,
    ]) + 10 * u;
    y += block(C, x, y, w, '各結局分布', m.endDist.map(d => `${d.label}　${d.count} 局`)) + 10 * u;
    y += block(C, x, y, w, '各稱號分布', m.titleDist.map(t => `${t.title}　${t.count} 局`)) + 10 * u;
    y += block(C, x, y, w, '各朝對照', m.rows.map(r =>
      `第${r.no}局｜${r.mode}｜在位 ${r.years} 年｜${r.generations} 世｜${r.end}｜${r.title}`)) + 10 * u;
  }
  C.contentH = Math.max(C.contentH || 0, y + 40 * u);
}

registerScreen('legacy-stats', C => drawLegacyStats(C));

// web/ui/render-gallery.js：圖鑑（Canvas）。以 galleryProgress 計算收藏進度；未解鎖條目以「？？？」示意；含出身事件。
import { withAllOriginEvents } from '../../src/origin.js';
import { GALLERY_CATEGORIES, galleryProgress, galleryRegistry } from '../../src/gallery.js';
import { U } from './store.js';
import { loadLegacy } from './render-legacy.js';
import { registerScreen, setScreen } from './canvas/core.js';
import { panel, text } from './canvas/widgets.js';
import { INK } from './canvas/theme.js';
import { drawTable, drawChips } from './dialog.js';

export const CAT_TEXT = { emperor: '先帝', official: '具名官員', event: '事件', battle: '戰功' };

// 圖鑑模型（純函式）：總進度、類別表、各類別條目（未解鎖者名稱為「？？？」）。
export function galleryModel(state, runs, events){
  const progress = galleryProgress(state, runs, withAllOriginEvents(events));
  const registry = galleryRegistry(withAllOriginEvents(events));
  const unlockedIds = new Set(progress.unlocked.map(e => e.id));
  const categories = GALLERY_CATEGORIES.map(c => ({
    key: c,
    label: CAT_TEXT[c],
    unlocked: progress.categories[c].unlocked,
    total: progress.categories[c].total,
    entries: (registry[c] || []).map(e => ({ id: e.id, on: unlockedIds.has(e.id), label: unlockedIds.has(e.id) ? e.name : '？？？' })),
  }));
  return { total: progress.total, categories };
}

// 繪製（Canvas）：由 registerScreen('gallery') 每幀呼叫。
export function drawGallery(C){
  const m = galleryModel(U.state, loadLegacy(), U.events);
  const u = C.U || 1, x = (C.content?.x || 0) + 12 * u, w = (C.content?.w || C.W) - 24 * u;
  const pad = 14 * u;
  let y = (C.content?.y || 0) + 12 * u;
  const head = `共收集 ${m.total.unlocked} / ${m.total.total}`;
  panel(x, y, w, 96 * u, {});
  text('圖鑑', x + pad, y + 12 * u, { size: 12 * u, color: INK });
  text('收藏進度', x + pad, y + 28 * u, { size: 20 * u, weight: 'bold', color: INK });
  text(head, x + pad, y + 60 * u, { size: 13 * u, color: INK });
  y += 106 * u;
  const rows = m.categories.map(c => [c.label, `${c.unlocked} / ${c.total}`]);
  y += drawTable(C, { x, y, w, cols: [{ label: '類別', weight: 1 }, { label: '進度', weight: 1 }], rows }) + 12 * u;
  for (const c of m.categories) {
    const cardTop = y;
    panel(x, cardTop, w, 40 * u, {});
    text(c.label, x + pad, cardTop + 10 * u, { size: 12 * u, color: INK });
    text(`已收集 ${c.unlocked} / ${c.total}`, x + pad, cardTop + 24 * u, { size: 12 * u, color: INK });
    y = cardTop + 48 * u;
    if (c.entries.length) {
      y += drawChips(C, { x: x + pad, y, w: w - pad * 2, items: c.entries.map(e => ({ label: e.label, on: e.on })) }) + 14 * u;
    } else {
      text('尚無條目。', x + pad, y, { size: 13 * u, color: INK });
      y += 22 * u + 14 * u;
    }
    y += 10 * u;
  }
  C.contentH = Math.max(C.contentH || 0, y + 30 * u);
}

// 切換至圖鑑畫面（原 renderGallery 之進入點）。
export function renderGallery(){ setScreen('gallery'); }

registerScreen('gallery', drawGallery);

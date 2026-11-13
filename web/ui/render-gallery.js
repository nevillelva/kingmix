// web/ui/render-gallery.js：圖鑑頁。以 galleryProgress 計算收藏進度；未解鎖條目以「？？？」示意。
import { GALLERY_CATEGORIES, galleryProgress, galleryRegistry } from '../../src/gallery.js';
import { U, app } from './store.js';
import { loadLegacy } from './render-legacy.js';
import { esc } from './util.js';

const CAT_TEXT = { emperor: '先帝', official: '具名官員', event: '事件', battle: '戰功' };

export function renderGallery(){
  const progress = galleryProgress(U.state, loadLegacy(), U.events);
  const registry = galleryRegistry(U.events);
  const unlockedIds = new Set(progress.unlocked.map(e => e.id));

  const summary = GALLERY_CATEGORIES.map(c => {
    const p = progress.categories[c];
    return `<tr><td>${CAT_TEXT[c]}</td><td>${p.unlocked} / ${p.total}</td></tr>`;
  }).join('');

  const sections = GALLERY_CATEGORIES.map(c => {
    const entries = registry[c];
    const chips = entries.map(e => unlockedIds.has(e.id)
      ? `<li class="gal-item on">${esc(e.name)}</li>`
      : `<li class="gal-item">？？？</li>`).join('');
    return `<section class="card"><div class="kicker">${CAT_TEXT[c]}</div>
      <p class="sub">已收集 ${progress.categories[c].unlocked} / ${progress.categories[c].total}</p>
      ${entries.length ? `<ul class="gal-list">${chips}</ul>` : '<p class="sub">尚無條目。</p>'}
    </section>`;
  }).join('');

  app.innerHTML = `
    <section class="card"><div class="kicker">圖鑑</div><h2>收藏進度</h2>
      <p class="sub">共收集 ${progress.total.unlocked} / ${progress.total.total}</p>
      <table class="legacy-tbl"><thead><tr><th>類別</th><th>進度</th></tr></thead><tbody>${summary}</tbody></table>
    </section>
    ${sections}`;
}

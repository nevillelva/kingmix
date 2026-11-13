// web/ui/render-legacy.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { legacyFromState, recordRun, summarizeLegacy } from '../../src/legacy.js';
import { DEFAULT_MODE } from '../../src/mode.js';
import { U, app } from './store.js';
import { save } from './state-io.js';
import { esc } from './util.js';
import { LEGACY_END, MODE_TEXT } from './labels.js';

// ── 段落目標（章節）：頂欄顯示目前章節；章節變動時短訊告知。同一局內首次繪製不發訊。
export const LEGACY_KEY = 'kingmix-legacy-v1';

// ── 歷代帝王：跨局史冊存於 localStorage；一局結束時記錄一次（以 state.legacyRecorded 防重）。
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

export function renderLegacy(){
  const runs = loadLegacy();
  const sum = summarizeLegacy(runs);
  const rows = runs.slice().reverse().map((r, i) => `<tr><td>${runs.length - i}</td><td>${esc(MODE_TEXT[r.mode] ?? '—')}</td><td>${esc(r.seed ?? '—')}</td><td>${esc(r.years ?? '—')}</td><td>${esc(r.generations ?? '—')}</td><td>${esc(LEGACY_END[r.endReason] ?? r.endReason ?? '—')}</td><td>${esc(r.finalTitle ?? '—')}</td></tr>`).join('');
  app.innerHTML = `
    <section class="card"><div class="kicker">史冊</div><h2>歷代帝王</h2>
      <p class="sub">共 ${sum.runs} 局　平均在位 ${sum.avgYears} 年${sum.bestTitle ? `　首見稱號：${esc(sum.bestTitle)}` : ''}</p>
      ${runs.length ? `<div style="overflow-x:auto"><table class="legacy-tbl"><thead><tr><th>局</th><th>模式</th><th>種子</th><th>在位年</th><th>世數</th><th>結局</th><th>稱號</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="sub">尚無已結束的局，待一局終了後，史冊方會記下。</p>'}
    </section>`;
}

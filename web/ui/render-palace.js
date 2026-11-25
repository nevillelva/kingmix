// web/ui/render-palace.js：宮城（Canvas）。以等角鳥瞰圖呈現御書房、後宮、慈寧宮、太和殿、校場、東廠與五處設施空地；
// 點選地標即前往對應分頁。紅點：pendingMarks(state) 所列之宮室；待批件數與史冊、嬪妃、子嗣之數字由既有狀態取得。
import { U } from './store.js';
import { campaignActive, morningPair, pendingCase } from './game-flow.js';
import { levelWord } from './util.js';
import { render } from './render-bus.js';
import { FACILITIES, constructionOf, facilityLevels } from '../../src/facilities.js';
import { C, registerScreen, setScreen } from './canvas/core.js';
import { panel } from './canvas/widgets.js';
import { tx, btn } from './canvas/bfx.js';
import { drawPalaceScene, palaceZones, drawSeasonTint } from './canvas/palace.js';
import { drawSideRow, keepOverlays } from './render-side.js';

// 宮城引擎（src/palace.js：pendingMarks、seasonFor）可能尚未合入；以動態匯入防護，缺漏時宮城照常呈現。
let engine = {};
import('../../src/palace.js').then((m) => {
  engine = m;
  if (U.state && U.tab === 'palace') render();
}, () => {});

// 待批件數：東廠密報或戰事優先；否則為早朝的第一則與次奏（未留中者）。
export function pendingMemorials() {
  if (!U.state || !U.state.alive) return 0;
  if (pendingCase() || campaignActive()) return 1;
  const p = morningPair();
  return (p.first ? 1 : 0) + (p.second && !p.secondDone ? 1 : 0);
}

// 紅點：pendingMarks(state) 所列之宮室（可為宮室代號、分頁名，或含 id 的物件）。
export function markedSet() {
  if (typeof engine.pendingMarks !== 'function' || !U.state) return new Set();
  try {
    const out = new Set();
    for (const x of Array.from(engine.pendingMarks(U.state) ?? [])) {
      const v = typeof x === 'string' ? x : x && (x.buildingId ?? x.zone ?? x.building ?? x.id ?? x.t);
      if (v) out.add(v);
    }
    return out;
  } catch { return new Set(); }
}

// 季節：seasonFor(state) 可用則採之，缺漏時沿用 html[data-season]（與舊版相同）。
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export function seasonOf() {
  let s = null;
  if (typeof engine.seasonFor === 'function' && U.state) {
    try { s = engine.seasonFor(U.state); } catch { s = null; }
  }
  s = s || (typeof document !== 'undefined' ? document.documentElement?.dataset?.season : '') || '';
  return SEASONS.includes(s) ? s : '';
}

// 地標點選：設施空地前往設施頁，其餘依 nav.tab 前往分頁。
export function goZone(z) {
  if (z.facility) U.tab = 'facility';
  else U.tab = z.nav?.tab ?? 'palace';
  U.panel = null;
  U.pick1 = null;
  render();
}

// 繪製宮城畫面（每幀；C 為 core 的繪製狀態，座標以內容區為準）。宮城不捲動。
export function drawPalaceScreen() {
  const g = C.ctx;
  if (!g || !U.state) return;
  const u = C.U;
  const W = C.W, y0 = C.content.y, areaH = C.content.h;
  const openCases = (U.state.dongchang?.cases || []).filter((c) => c.status !== 'closed').length;
  const facilities = facilityLevels(U.state);
  const jobs = constructionOf(U.state);
  const zones = palaceZones({
    pend: pendingMemorials(),
    marks: markedSet(),
    openCases,
    armLevel: levelWord('armament'),
    counts: { annals: (U.state.annals || []).length, consorts: (U.state.consorts || []).length, heirs: (U.state.heirs || []).length },
    facilities,
    jobs,
    facilityName: Object.fromEntries(Object.entries(FACILITIES).map(([k, v]) => [k, v.name])),
  });
  const headH = 44 * u, noteH = 40 * u, rowH = 44 * u, sideH = 64 * u;
  const sceneTop = y0 + headH;
  const sceneH = Math.max(160 * u, areaH - headH - noteH - rowH - sideH - 8 * u);
  panel(12 * u, y0 + 6 * u, W - 24 * u, 36 * u, { fill: 'rgba(255,250,236,.7)' });
  tx('宮城', 26 * u, y0 + 14 * u, 18, { weight: 'bold' });
  tx('點選宮室，前往其所主之事。', 96 * u, y0 + 17 * u, 13, { color: 'rgba(28,26,23,.6)' });
  drawPalaceScene(zones, goZone, W, sceneH, sceneTop);
  const season = seasonOf();
  if (season) { g.save(); g.translate(0, sceneTop); drawSeasonTint(g, season, W, sceneH); g.restore(); }
  tx('太和殿處理朝政奏摺；御書房（史冊與帝王）、校場（朝臣任免）、後宮與慈寧宮（嬪妃與子嗣）、東廠各司其事；空地可營造宮內設施。', 16 * u, sceneTop + sceneH + 2 * u, 12, { color: 'rgba(28,26,23,.6)', maxW: W - 32 * u });
  const by = sceneTop + sceneH + noteH;
  const bw = Math.min(170 * u, W / 2 - 18 * u);
  btn(12 * u, by, bw, 36 * u, '展開全國輿圖', () => { U.tab = 'map'; U.panel = null; U.pick1 = null; render(); }, { ghost: true });
  btn(W - 12 * u - bw, by, bw, 36 * u, '營造宮內設施', () => { U.tab = 'facility'; U.panel = null; U.pick1 = null; render(); }, { ghost: true });
  drawSideRow(12 * u, by + rowH, W - 24 * u);
  C.contentH = 0; // 宮城不捲動
  keepOverlays();
}

// 導覽：進入宮城頁。
export function renderPalace() {
  setScreen('palace');
}

registerScreen('palace', drawPalaceScreen);

// web/ui/render-map.js：全國輿圖（Canvas）。六府依城防著色、府印顯示知府首字，割據、天災與權臣狀況於圖上與頂部標示；
// 點州府看詳情並可巡幸、攻城；點鄰國開外交面板。巡幸與攻城之結果寫入詳情區（U.mapNote）。
import { ensureCity } from '../../src/city.js';
import { NEIGHBORS, diplomacyOf } from '../../src/diplomacy.js';
import { PREFECTURE_DEFS, governorOf } from '../../src/economy.js';
import { attackCity, captureStatus } from '../../src/city-capture.js';
import { tourWithEncounter } from '../../src/side-events.js';
import { prefectureLatePressure } from '../../src/late-pressure.js';
import * as tour from '../../src/tour.js';
import { C, registerScreen, setScreen } from './canvas/core.js';
import { hit } from './canvas/input.js';
import { bar } from './canvas/widgets.js';
import { tx, btn, pnl } from './canvas/bfx.js';
import { GOLD, RED, PAPER, INK as INK_TEXT } from './canvas/theme.js';
import { MAP_SHAPE, defenseColor, peopleColor, mapTransform, pathBBox, drawShape, drawGovernorBadge, drawPrefectureOverlay, ministerBanner } from './map-svg.js';
import { U } from './store.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { prefecturePressureText, courtMinisterText } from './render-pressure.js';
import { showEncounter, keepOverlays } from './render-side.js';

export { MAP_SHAPE };

const ATTACK_REASON = {
  unknown: '查無此府。', not_rebel: '此府民心尚安，並無叛亂或失守，不可攻。', cooldown: '本年已攻過此府，須待來年再議。',
};
const TOUR_REASON = {
  unknown: '查無此府。', here: '天子已在此府。', busy: '巡幸之後正在整頓，尚未可再行。', treasury: '國庫不足，無力支付沿途費用。',
};
const initialOf = (gov, p) => (gov?.personName || gov?.name || p?.governor?.name || '—').slice(0, 1);
const hasTour = () => !!tour && typeof tour.tourTo === 'function';

// 巡幸狀態（一行）與近況（至多三則）；引擎回傳格式不明時只取可讀字串。
function tourStatusText(state, id) {
  if (typeof tour.prefectureStatus !== 'function') return null;
  try {
    const row = (tour.prefectureStatus(state) || []).find((x) => x?.id === id);
    return row ? `民心 ${row.morale}　${row.visited ? '曾巡幸' : '未巡幸'}` : null;
  } catch (e) { return null; }
}
function tourEventLines(state, id) {
  if (typeof tour.tourEvents !== 'function') return [];
  try {
    return (tour.tourEvents(state) || []).filter((e) => !e?.prefId || e.prefId === id).slice(-3).map((e) => e?.text || e?.msg || String(e));
  } catch (e) { return []; }
}

// 詳情區的資料（純函式，不改 state）；府不存在時回傳 null。
export function mapDetailModel(state, prefId) {
  const def = PREFECTURE_DEFS.find((x) => x.id === prefId);
  const p = def ? ensureCity(state).find((x) => x.id === prefId) : null;
  if (!def || !p) return null;
  const gov = governorOf(state, p);
  const cap = captureStatus(state, prefId);
  const defense = Math.max(0, Math.min(100, Math.round(p.defense ?? 50)));
  return {
    id: prefId,
    name: def.name,
    govLine: `知府 ${gov?.personName || gov?.name || p.governor?.name || '缺'}　政 ${gov?.abilities?.politics ?? p.governor?.abilities?.politics ?? '—'}　${p.output === 'agriculture' ? '農產' : '商產'}`,
    yieldLine: `城防 ${defense}　產值 ${Number(p.yield || 0).toFixed(2)}`,
    defense,
    statusText: tourStatusText(state, prefId),
    pressure: prefecturePressureText(state, prefId),
    events: tourEventLines(state, prefId),
    rebel: !!cap.rebel,
    occupied: !!cap.occupied,
    besieged: !!cap.besieged,
    attackable: !!cap.attackable,
    attackChance: cap.attackable ? Math.round(cap.chance * 100) : 0,
    attackHint: cap.attackable ? '' : (ATTACK_REASON[cap.reason] ?? ''),
  };
}

// 巡幸：tourWithEncounter 回傳 { ok, reason, encounter, error }；失敗時狀態不變，僅顯示原因。
export function tourAct(prefId) {
  let r;
  try { r = tourWithEncounter(U.state, prefId); } catch (e) { r = { ok: false, reason: null, error: e }; }
  const name = PREFECTURE_DEFS.find((x) => x.id === prefId)?.name ?? '';
  U.mapNote = r?.ok ? `天子巡幸${name}，所至府民心、城防皆增。` : (TOUR_REASON[r?.reason] ?? `巡幸未成：${r?.error?.message || '未知原因'}`);
  save();
  render();
  if (r?.ok && r.encounter) showEncounter(r.encounter, name);
  return !!r?.ok;
}

// 攻城：由玩家主動觸發，結果寫入詳情區。
export function attackAct(prefId) {
  let r;
  try { r = attackCity(U.state, prefId); } catch (e) { r = { ok: false, reason: null, error: e }; }
  U.mapNote = r?.ok ? r.text : (ATTACK_REASON[r?.reason] ?? `攻城未成：${r?.error?.message || '未知原因'}`);
  save();
  render();
  return !!r?.ok;
}

function selectPref(id) {
  U.mapSel = id;
  U.mapNote = '';
  render();
}

export function drawMapScreen() {
  const g = C.ctx;
  const state = U.state;
  if (!g || !state) return;
  const u = C.U;
  const W = C.W, y0 = C.content.y, H = y0 + C.content.h;
  const pad = 12 * u;
  const prefs = ensureCity(state);
  const d = diplomacyOf(state);
  const people = Math.round(state.stats.people);
  const wide = W > 640 * u;
  const mapX = pad, mapY = y0 + 96 * u;
  const mapW = wide ? Math.min(W * 0.56, 620 * u) : W - pad * 2;
  const mapH = wide ? H - mapY - pad : Math.min((H - y0) * 0.46, 380 * u);
  const detX = wide ? mapX + mapW + 16 * u : pad, detY = wide ? mapY : mapY + mapH + 10 * u;
  const detW = wide ? W - detX - pad : W - pad * 2;

  // 頂部：民心、城防色例、權臣狀況
  pnl(pad, y0 + 8 * u, W - pad * 2, 44 * u, { fill: 'rgba(255,250,236,.7)' });
  tx('全國輿圖', pad + 12 * u, y0 + 16 * u, 16, { weight: 'bold' });
  tx(String(people), pad + 118 * u, y0 + 16 * u, 16, { weight: 'bold', color: peopleColor(people) });
  tx('（全國）', pad + 146 * u, y0 + 18 * u, 12, { color: 'rgba(28,26,23,.6)' });
  [[10, '城防低'], [50, '中'], [90, '高']].forEach(([v, label], i) => {
    const lx = pad + 220 * u + i * 72 * u;
    g.save(); g.fillStyle = defenseColor(v); g.fillRect(lx, y0 + 20 * u, 12 * u, 12 * u); g.restore();
    tx(label, lx + 16 * u, y0 + 18 * u, 12, { color: 'rgba(28,26,23,.6)' });
  });
  tx(ministerBanner(courtMinisterText(state)), pad + 12 * u, y0 + 60 * u, 12, { color: 'rgba(28,26,23,.6)', maxW: W - pad * 2 - 24 * u });

  // 版圖
  const tr = mapTransform(mapW, mapH);
  const X = (x) => mapX + tr.ox + x * tr.s;
  const Y = (y) => mapY + tr.oy + y * tr.s;
  const sel = U.mapSel;
  g.save();
  g.beginPath(); g.rect(mapX, mapY, mapW, mapH); g.clip();
  g.translate(mapX + tr.ox, mapY + tr.oy); g.scale(tr.s, tr.s);
  for (const id of Object.keys(MAP_SHAPE.nb)) {
    drawShape(g, MAP_SHAPE.nb[id].d, { fill: 'rgba(170,150,110,.35)', stroke: '#8a7a4a', lineWidth: 1 });
  }
  for (const def of PREFECTURE_DEFS) {
    const p = prefs.find((x) => x.id === def.id);
    const sh = MAP_SHAPE.pref[def.id];
    if (!sh) continue;
    const defense = Math.round(p?.defense ?? 50);
    const cap = captureStatus(state, def.id);
    const lp = prefectureLatePressure(state, def.id);
    drawShape(g, sh.d, { fill: defenseColor(defense), stroke: def.id === sel ? '#e6b84a' : '#5a4a2a', lineWidth: def.id === sel ? 3 : 1 });
    drawPrefectureOverlay(g, sh.d, { autonomous: !!lp?.autonomous, disasters: lp?.disasterCount ?? 0, besieged: cap.besieged, rebel: cap.rebel, occupied: cap.occupied });
  }
  g.restore();

  // 府名、城防、府印與鄰國標籤（畫布座標）
  const labelSz = (n) => Math.max(9, n * tr.s * 1.1) / C.U;
  for (const def of PREFECTURE_DEFS) {
    const sh = MAP_SHAPE.pref[def.id];
    const p = prefs.find((x) => x.id === def.id);
    if (!sh) continue;
    const cap = captureStatus(state, def.id);
    const gov = p ? governorOf(state, p) : null;
    tx(def.name, X(sh.x), Y(sh.y) - 8 * u, labelSz(12), { weight: 'bold', align: 'center', color: INK_TEXT });
    tx(`城防 ${Math.round(p?.defense ?? 50)}${cap.rebel ? ' 叛' : cap.occupied ? ' 失' : ''}`, X(sh.x), Y(sh.y) + 6 * u, labelSz(10), { align: 'center', color: 'rgba(28,26,23,.6)' });
    drawGovernorBadge(g, X(sh.b[0]), Y(sh.b[1]), initialOf(gov, p));
    const bb = pathBBox(sh.d);
    hit({ x: X(bb.x), y: Y(bb.y), w: bb.w * tr.s, h: bb.h * tr.s }, () => selectPref(def.id));
  }
  const dip = Object.fromEntries(NEIGHBORS.map((n) => [n.id, d[n.id]]));
  for (const n of NEIGHBORS) {
    const sh = MAP_SHAPE.nb[n.id];
    const s = dip[n.id];
    if (!sh || !s) continue;
    tx(`${n.name}　好感 ${s.attitude}${s.allied ? ' 盟' : s.kin > 0 ? ' 婚' : ''}`, X(sh.x), Y(sh.y), labelSz(11), { align: 'center' });
    const bb = pathBBox(sh.d);
    hit({ x: X(bb.x), y: Y(bb.y), w: bb.w * tr.s, h: bb.h * tr.s }, () => { U.tab = 'court'; U.panel = 'diplo'; U.pick1 = null; render(); });
  }

  // 詳情
  const m = sel ? mapDetailModel(state, sel) : null;
  pnl(detX, detY, detW, wide ? H - detY - pad : Math.min(H - detY - pad, 340 * u), { fill: PAPER });
  let y = detY + 12 * u;
  const lx = detX + 12 * u, lw = detW - 24 * u;
  if (!m) {
    tx('點選州府，檢視其知府、城防與巡幸狀況。點邊界鄰國可開外交面板。', lx, y, 13, { color: 'rgba(28,26,23,.6)', maxW: lw });
    C.contentH = 0;
    keepOverlays();
    return;
  }
  tx(m.name, lx, y, 18, { weight: 'bold' }); y += 30 * u;
  y += tx(m.govLine, lx, y, 13, { color: 'rgba(28,26,23,.6)', maxW: lw }) + 2 * u;
  y += tx(m.yieldLine, lx, y, 13, { color: 'rgba(28,26,23,.6)' }) + 4 * u;
  bar(lx, y + 4 * u, lw, 10 * u, m.defense, 100, m.defense < 40 ? RED : GOLD); y += 22 * u;
  if (m.statusText) { tx(m.statusText, lx, y, 13, { color: 'rgba(28,26,23,.6)' }); y += 20 * u; }
  y += tx(m.pressure, lx, y, 13, { color: 'rgba(28,26,23,.6)', maxW: lw }) + 4 * u;
  if (m.rebel) { y += tx('叛亂：民心渙散，可遣兵攻城平定。', lx, y, 13, { color: RED, maxW: lw }) + 4 * u; }
  if (m.occupied) { y += tx('敵方佔領：此府失守，可遣兵攻回。', lx, y, 13, { color: RED, maxW: lw }) + 4 * u; }
  if (m.besieged) { y += tx('攻城中：本年攻城未克，圍城待來年。', lx, y, 13, { color: RED, maxW: lw }) + 4 * u; }
  for (const e of m.events) { y += tx(`・${e}`, lx, y, 12, { color: 'rgba(28,26,23,.6)', maxW: lw }) + 4 * u; }
  if (m.attackHint) { y += tx(m.attackHint, lx, y, 12, { color: 'rgba(28,26,23,.6)', maxW: lw }) + 4 * u; }
  if (U.mapNote) { y += tx(U.mapNote, lx, y, 13, { color: RED, maxW: lw }) + 8 * u; }
  y += 8 * u;
  const bw = Math.min(150 * u, (detW - 36 * u) / 3);
  btn(detX + 12 * u, y, bw, 34 * u, hasTour() ? '巡幸' : '巡幸（待接線）', () => tourAct(m.id), { disabled: !hasTour(), why: '巡幸功能尚未接線' });
  btn(detX + 24 * u + bw, y, bw, 34 * u, m.attackable ? `攻城（約 ${m.attackChance}%）` : '攻城', () => attackAct(m.id), { disabled: !m.attackable, why: m.attackHint || '目前不可攻城' });
  btn(detX + 36 * u + bw * 2, y, bw, 34 * u, '朝堂修繕', () => { U.tab = 'court'; U.panel = 'city'; U.pick1 = null; render(); }, { ghost: true });
  C.contentH = 0;
  keepOverlays();
}

// 導覽：由宮城或底部鈕進入輿圖。
export function renderMap() {
  setScreen('map');
}

registerScreen('map', drawMapScreen);

// web/ui/canvas/harem.js：後宮畫面（Canvas）與選秀納妃覆蓋層。
// 功能與舊 render-officials.js 之 renderHarem 一一對應：嬪妃（含賜寶）、外戚、太后、未了請求、子嗣（含排課與伴讀）。
// 選秀納妃接 src/draft.js（draftSlate、pickConsort、pickAllConsorts）；數值、名額、國庫成本與上限皆以引擎為準。
import { C, registerScreen, setScreen } from './core.js';
import { hit, modal } from './input.js';
import { bar, portrait, toast } from './widgets.js';
import { GOLD, PAPER, RED, DRED, LAC_TEXT } from './theme.js';
import { tx, btn, pnl } from './bfx.js';
import { U } from '../store.js';
import { save } from '../state-io.js';
import { render } from '../render-bus.js';
import { FAC } from '../labels.js';
import { has, engine, handleCardAct } from '../render-cards.js';
import { setCourseAct, companionAct, canSchedule, curriculumSummary } from '../render-curriculum.js';
import { COURSES, CURRICULUM_MIN_AGE, curriculumEntry } from '../../../src/curriculum.js';
import { COMPANION_MIN_AGE, companionOf, companionSponsor } from '../../../src/companions.js';
import { BOND_THRESHOLD } from '../../../src/bonds.js';
import { isCourtOfficial } from '../../../src/officials.js';
import { describeConsort, describeTraits } from '../../../src/people.js';
import { illnessLabel } from '../../../src/heir-status.js';
import { WAIJIA_THRESHOLD, TAIHOU_OPPOSE, taihouOpposes } from '../../../src/harem.js';
import { draftSlate, draftStatus, pickConsort, pickAllConsorts, DRAFT_SIZE, DRAFT_COST, CONSORT_CAP } from '../../../src/draft.js';

const COMPANION_CANDIDATES = 3; // 伴讀舉薦候選人數（依忠誠由高至低）
const LINE = 19; // 內文行距（邏輯像素）
const MUTED = 'rgba(28,26,23,.6)';
const REASON = {
  no_slot: '無此秀女。',
  no_mode: '選秀之式不明。',
  full: `後宮已滿（上限 ${CONSORT_CAP} 位），容不下。`,
  treasury: '國庫不足，無力選秀。',
};
let draftOpen = false;
let giftFor = null; // 賜寶對話所屬嬪妃 id；null 表示未開啟

// ── 純函式：畫面資料（不讀寫 DOM，供測試） ──
export function haremModel(state) {
  const h = state.harem || {};
  const consorts = state.consorts || [];
  const nameOf = (id) => {
    const c = consorts.find((x) => x.id === id);
    return c ? (c.personName || `嬪妃 ${c.id}`) : '（已故）';
  };
  const families = Object.entries(h.waijia || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: FAC(k).l, v, warn: v >= WAIJIA_THRESHOLD }));
  const dom = h.dominant
    ? `外戚坐大：${FAC(h.dominant.family).l}之家，以${nameOf(h.dominant.consortId)}為首。`
    : '尚無外戚坐大。';
  const demands = (h.demands || []).filter((d) => d.status === 'open').slice(-6).reverse()
    .map((d) => ({ id: d.id, text: `${nameOf(d.consortId)} 請「${d.kind}」`, fam: FAC(d.family).l }));
  const candidates = (state.officials || []).filter(isCourtOfficial)
    .sort((a, b) => b.loyalty - a.loyalty || a.id.localeCompare(b.id))
    .slice(0, COMPANION_CANDIDATES);
  return {
    consorts: consorts.map((c) => ({
      id: c.id,
      text: c.family ? describeConsort(c) : (c.personName || `嬪妃 ${c.id}`),
      name: c.personName || c.id,
    })),
    dom,
    families,
    demands,
    taihou: { power: (h.taihou && h.taihou.power) || 0, opposes: taihouOpposes(state, 'heir') },
    heirs: (state.heirs || []).map((x) => {
      const entry = curriculumEntry(state, x.id);
      const companion = companionOf(state, x.id);
      const male = x.gender === 'm' || x.gender === 'male';
      return {
        id: x.id,
        female: !male,
        label: `${male ? '皇子' : '皇女'} · ${x.age} 歲`,
        traits: describeTraits(x).join('、'),
        ill: illnessLabel(x) || '',
        ability: Object.values(x.abilities || {}).reduce((a, b) => a + b, 0),
        age: Number(x.age),
        canSchedule: canSchedule(x),
        course: entry?.course ?? null,
        summary: curriculumSummary(entry),
        companion,
        sponsor: companion ? companionSponsor(state, x.id) : null,
        candidates: !companion && Number(x.age) >= COMPANION_MIN_AGE ? candidates : [],
      };
    }),
  };
}

// 選秀可用性（純函式）：本次秀女與雨露均霑之可否。
export function draftAvailability(state) {
  const all = draftStatus(state, 'all');
  return {
    slate: draftSlate(state),
    canAll: all.ok,
    allReason: all.ok ? null : all.reason,
  };
}

export function canOpenDraft(state) {
  return state.consorts.length < CONSORT_CAP;
}

// ── 選秀覆蓋層：畫面每幀若仍開啟即重新請求（A 的 modal 規則） ──
export function openDraft() {
  if (U.state) draftOpen = true;
}
export function closeDraft() {
  draftOpen = false;
}
export function isDraftOpen() {
  return draftOpen;
}

// 獨寵一人：點選一位秀女。成功即寫入引擎、存檔並關閉覆蓋層。
export function choosePick(slot) {
  return afterDraft(pickConsort(U.state, slot), (c) => `獨寵「${c[0].personName}」，入宮為嬪。`);
}
// 雨露均霑：四人皆入宮。
export function choosePickAll() {
  return afterDraft(pickAllConsorts(U.state), (c) => `雨露均霑，${c.length} 位秀女同入宮。`);
}
function afterDraft(r, okText) {
  if (!r.ok) {
    U.feedback = REASON[r.reason] ?? '選秀未成。';
    toast(U.feedback);
    return false;
  }
  U.feedback = `${okText(r.consorts)}（國庫 −${r.cost}）`;
  closeDraft();
  save();
  render();
  return true;
}

function drawDraftModal() {
  const g = C.ctx;
  if (!g || !U.state) return;
  const W = C.W, H = C.H, u = C.U;
  const av = draftAvailability(U.state);
  const bw = Math.min(W * 0.7, 520 * u), bx = W / 2 - bw / 2, by = 24 * u;
  pnl(bx, by, bw, 56 * u, { fill: DRED, block: true });
  tx('選秀納妃', W / 2, by + 14 * u, 22, { weight: 'bold', color: LAC_TEXT, align: 'center', maxW: bw });
  const cols = W > H * 1.05 ? 4 : 2, rows = DRAFT_SIZE / cols;
  const top = by + 72 * u, avail = H - top - 110 * u;
  let cw = Math.min((W * 0.86) / cols - 12 * u, 180 * u), chh = cw * 1.36;
  if (chh * rows + 40 * u * rows > avail) { chh = (avail - 40 * u * rows) / rows; cw = chh / 1.36; }
  const gx = (W - cols * cw - (cols - 1) * 12 * u) / 2;
  av.slate.forEach((c, i) => {
    const x = gx + (i % cols) * (cw + 12 * u), y = top + Math.floor(i / cols) * (chh + 40 * u);
    pnl(x - 4 * u, y - 4 * u, cw + 8 * u, chh + 36 * u, { fill: DRED, block: true });
    portrait(x, y, cw, chh, { k: 'f', robe: ['#e48fae', '#e6b84a', '#4f9a62', '#8f66c4'][i % 4] });
    tx(`${c.personName}　${FAC(c.family).l}`, x + cw / 2, y + chh + 6 * u, 12, { color: LAC_TEXT, align: 'center', maxW: cw });
    hit({ x, y, w: cw, h: chh + 30 * u }, () => choosePick(c.slot));
  });
  const by2 = H - 74 * u, bww = Math.min(170 * u, W * 0.28);
  btn(W / 2 - bww * 1.6 - 6 * u, by2, bww, 46 * u, '獨寵一人', () => toast(`點選一位秀女（國庫 −${DRAFT_COST.single}）`), { sub: `國庫 −${DRAFT_COST.single}` });
  btn(W / 2 - bww / 2, by2, bww, 46 * u, '雨露均霑', choosePickAll, { sub: `四人皆納 國庫 −${DRAFT_COST.all}`, disabled: !av.canAll, why: REASON[av.allReason] ?? '' });
  btn(W / 2 + bww * 0.6 + 6 * u, by2, bww, 46 * u, '退下', closeDraft, { ghost: true });
  const note = av.canAll ? `後宮 ${U.state.consorts.length} / ${CONSORT_CAP}` : (REASON[av.allReason] ?? '');
  tx(note, W / 2, H - 22 * u, 13, { color: LAC_TEXT, align: 'center', maxW: W * 0.9 });
}

// ── 賜寶：列出庫中寶物，點選即賜予該嬪妃（經 render-cards 的 giveitem 行為） ──
export function giftItems() {
  if (!has('giveItem') || !has('listInventory')) return null;
  let inv = [];
  try { inv = engine.listInventory(U.state) || []; } catch (e) { inv = []; }
  return inv.filter((it) => (it.count ?? 0) > 0);
}
export function openGift(consortId) {
  if (U.state) giftFor = consortId;
}
export function closeGift() {
  giftFor = null;
}
function drawGiftModal(consortId) {
  const g = C.ctx;
  if (!g) return;
  const W = C.W, H = C.H, u = C.U;
  const inv = giftItems();
  const bw = Math.min(W * 0.8, 420 * u), bx = W / 2 - bw / 2, bh = Math.min(H * 0.6, 420 * u), by = H * 0.2;
  pnl(bx, by, bw, bh, { fill: PAPER, block: true });
  tx('賜寶', W / 2, by + 14 * u, 20, { weight: 'bold', align: 'center', maxW: bw });
  if (inv === null) tx('賜寶：引擎尚未就緒。', bx + 16 * u, by + 56 * u, 14, { maxW: bw - 32 * u });
  else if (inv.length === 0) tx('賜寶：庫中無寶物。', bx + 16 * u, by + 56 * u, 14, { maxW: bw - 32 * u });
  else inv.forEach((it, i) => {
    btn(bx + 16 * u, by + 56 * u + i * 40 * u, bw - 32 * u, 34 * u, `${it.name ?? it.id}（${it.count}）`, () => {
      handleCardAct('giveitem', `${it.id}|consort|${consortId}`);
      closeGift();
    });
  });
  btn(bx + bw / 2 - 60 * u, by + bh - 50 * u, 120 * u, 36 * u, '退下', closeGift, { ghost: true });
}

// ── 畫面（座標為內容區座標，由 core 捲動；C.contentH 回報內容總高） ──
// 段落：回傳段落之下緣 y。
function para(x, y, str, size, opts = {}) {
  return y + tx(str, x, y, size, { lh: 1.4, ...opts });
}
function heirHeight(h) {
  let hgt = 30 + LINE; // 標題與能力
  if (h.traits) hgt += LINE;
  if (h.ill) hgt += LINE;
  if (!h.canSchedule) return hgt + LINE + 10;
  hgt += LINE + 30; // 課表摘要與課程鈕列
  if (h.companion) hgt += LINE;
  if (h.candidates.length) hgt += LINE + 30;
  return hgt + 10;
}

export function drawHaremScreen() {
  const g = C.ctx;
  const state = U.state;
  if (!g || !state) return;
  const u = C.U;
  const W = C.content.w || C.W, y0 = C.content.y;
  const m = haremModel(state);
  const pad = 16 * u;
  const wide = W > 700 * u;
  const colW = wide ? Math.min((W - pad * 3) / 2, 480 * u) : W - pad * 2;
  const xL = pad, xR = wide ? pad * 2 + colW : pad;
  let yL = y0 + 60 * u, yR = y0 + 60 * u;

  pnl(pad, y0 + 8 * u, W - pad * 2, 40 * u, { fill: 'rgba(255,250,236,.7)' });
  tx(`後宮　嬪妃 ${m.consorts.length} / ${CONSORT_CAP}`, pad + 12 * u, y0 + 18 * u, 18, { weight: 'bold' });
  if (canOpenDraft(state)) btn(W - pad - 128 * u, y0 + 14 * u, 116 * u, 30 * u, '選秀納妃', openDraft);
  else btn(W - pad - 128 * u, y0 + 14 * u, 116 * u, 30 * u, '後宮已滿', () => {}, { disabled: true, why: `後宮已滿（上限 ${CONSORT_CAP}）` });

  // 嬪妃
  yL = para(xL, yL, '嬪妃', 16, { weight: 'bold' }) + 4 * u;
  if (m.consorts.length === 0) yL = para(xL, yL, '後宮空虛，待選秀入宮。', 13, { color: MUTED });
  for (const c of m.consorts) {
    pnl(xL, yL, colW, 56 * u);
    portrait(xL + 8 * u, yL + 8 * u, 40 * u, 40 * u, { k: 'f', robe: '#8f66c4' });
    tx(c.text, xL + 58 * u, yL + 8 * u, 13, { maxW: colW - 150 * u });
    btn(xL + colW - 84 * u, yL + 14 * u, 74 * u, 28 * u, '賜寶', () => openGift(c.id), { ghost: true });
    yL += 64 * u;
  }

  // 外戚
  yL += 8 * u;
  yL = para(xL, yL, '外戚', 16, { weight: 'bold' }) + 4 * u;
  yL = para(xL, yL, `${m.dom}　坐大門檻 ${WAIJIA_THRESHOLD}`, 13, { maxW: colW });
  if (m.families.length === 0) yL = para(xL, yL + 4 * u, '尚無外戚勢力。', 13, { color: MUTED });
  for (const f of m.families) {
    tx(f.label, xL, yL, 13);
    bar(xL + 64 * u, yL + 5 * u, colW - 110 * u, 12 * u, Math.min(100, f.v), 100, f.warn ? RED : GOLD);
    tx(String(Math.round(f.v)), xL + colW, yL, 13, { weight: 'bold', align: 'right', maxW: 40 * u });
    yL += 24 * u;
  }
  if (m.demands.length) {
    yL = para(xL, yL + 6 * u, '未了請求', 16, { weight: 'bold' }) + 4 * u;
    for (const d of m.demands) yL = para(xL + 8 * u, yL, `${d.text}（${d.fam}）`, 13, { maxW: colW - 16 * u });
  }

  // 太后
  let yT = wide ? yR : yL + 10 * u;
  yT = para(xR, yT, '太后', 16, { weight: 'bold' }) + 4 * u;
  tx(`太后勢 ${Math.round(m.taihou.power)}`, xR, yT, 13);
  bar(xR + 90 * u, yT + 5 * u, colW - 110 * u, 12 * u, Math.min(100, m.taihou.power), 100, m.taihou.power >= TAIHOU_OPPOSE ? RED : GOLD);
  yT += 26 * u;
  yT = para(xR, yT, m.taihou.opposes ? `太后勢高（達 ${TAIHOU_OPPOSE}），反對皇嗣相關之議。` : `太后勢未達 ${TAIHOU_OPPOSE}，尚不干政。`, 13, { color: MUTED, maxW: colW }) + 8 * u;

  // 子嗣
  yT = para(xR, yT, '子嗣', 16, { weight: 'bold' }) + 4 * u;
  if (m.heirs.length === 0) yT = para(xR, yT, '尚無子嗣。', 13, { color: MUTED });
  for (const h of m.heirs) yT = drawHeir(h, xR, yT, colW, u);

  if (U.feedback) tx(U.feedback, pad, C.content.y + C.content.h - 30 * u, 13, { color: RED, maxW: W - pad * 2 });

  C.contentH = Math.max(yL, yT) - y0 + 40 * u;

  // 對話框：每幀重新請求（A 的 modal 規則）
  if (draftOpen) modal(drawDraftModal, closeDraft);
  if (giftFor !== null) { const id = giftFor; modal(() => drawGiftModal(id), closeGift); }
}

function drawHeir(h, x, y, colW, u) {
  const hgt = heirHeight(h) * u;
  pnl(x, y, colW, hgt);
  tx(`${h.label}　能力 ${h.ability}`, x + 10 * u, y + 8 * u, 14, { weight: 'bold', maxW: colW - 20 * u });
  let yy = y + 30 * u;
  if (h.traits) yy = para(x + 10 * u, yy, h.traits, 12, { color: MUTED, maxW: colW - 20 * u });
  if (h.ill) yy = para(x + 10 * u, yy, h.ill, 12, { color: RED, maxW: colW - 20 * u });
  if (!h.canSchedule) {
    para(x + 10 * u, yy, `課表：年幼，${CURRICULUM_MIN_AGE} 歲方入學。`, 12, { color: MUTED, maxW: colW - 20 * u });
    return y + hgt + 10 * u;
  }
  yy = para(x + 10 * u, yy, `課表：${h.summary}`, 12, { color: MUTED, maxW: colW - 20 * u });
  const keys = Object.keys(COURSES);
  const bw = (colW - 20 * u - (keys.length - 1) * 4 * u) / keys.length;
  keys.forEach((k, i) => {
    btn(x + 10 * u + i * (bw + 4 * u), yy + 2 * u, bw, 26 * u, COURSES[k].label, () => setCourseAct(`${h.id}|${k}`), { ghost: k !== h.course });
  });
  yy += 34 * u;
  if (h.companion) {
    const who = h.sponsor ? (h.sponsor.personName ?? h.sponsor.name) : '（舉薦人已不在朝）';
    para(x + 10 * u, yy, `伴讀：由${who}舉薦　相得 ${h.companion.bond}/${BOND_THRESHOLD}`, 12, { color: MUTED, maxW: colW - 20 * u });
  } else if (h.candidates.length) {
    yy = para(x + 10 * u, yy, '伴讀：尚未舉薦（耗午後一次行動）', 12, { color: MUTED, maxW: colW - 20 * u });
    const cw = (colW - 20 * u - (h.candidates.length - 1) * 4 * u) / h.candidates.length;
    h.candidates.forEach((o, i) => {
      btn(x + 10 * u + i * (cw + 4 * u), yy + 2 * u, cw, 26 * u, `舉薦${o.personName ?? o.name}`, () => companionAct(`${h.id}|${o.id}`), { ghost: true });
    });
  }
  return y + hgt + 10 * u;
}

// 導覽：由宮城或底部鈕進入後宮頁（setScreen 於切換時歸零捲動）。
export function renderHarem() {
  setScreen('harem');
}

registerScreen('harem', drawHaremScreen);

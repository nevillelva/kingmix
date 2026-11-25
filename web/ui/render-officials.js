// web/ui/render-officials.js：朝臣、任免・官職、東廠、漕運、忠誠與派系、帝王（國勢／史記）的 Canvas 畫面。
// 畫面：drawOfficials（朝臣）、drawDC（東廠）、drawThrone（帝王）。后宮與子嗣（renderHarem）歸 B，不在此檔。
// 行為與舊版 DOM 介面一致：任免、東廠、漕運、黨爭、進諫、禪位皆走既有引擎函式與 useAction 記帳。
import { FACTIONS, isCourtOfficial, loyaltySafetyStatus } from '../../src/officials.js';
import { ASSASSIN_LOW_LOYALTY } from '../../src/assassination.js';
import { buildGeneralCard, isGeneral } from '../../src/general-cards.js';
import { BOND_THRESHOLD, isBonded, remonstrate, sharedCount } from '../../src/bonds.js';
import { describeTraits } from '../../src/people.js';
import { OFFICES, assignOffice, dismissOffice, officeFit, officeHolder, suggestCandidate } from '../../src/offices.js';
import { POLICIES } from '../../src/policy.js';
import { FACTION_POLICY, BALANCED_EFFICIENCY, FACTION_FORCE_THRESHOLD, FORCE_MONTHS, factionsBalanced, forcingFaction, strongFactionCount } from '../../src/factions.js';
import { partisanStatus, respondPartisanDemand } from '../../src/partisan.js';
import { canalStatus, dispatchCanalPatrol, CANAL_PATROL_COST, CANAL_PATROL_MONTHS, CANAL_DISLOYAL } from '../../src/canal.js';
import { governorOf, PREFECTURE_DEFS, TAX_TIERS, administrativeEfficiency, ensureEconomy } from '../../src/economy.js';
import { COLLECTIONS, collectionProgress } from '../../src/collections.js';
import { chronicleLine } from '../../src/chronicle.js';
import { tyrannyStatus } from '../../src/dongchang.js';
import { scenarioDef, evaluateScenario } from '../../src/scenarios.js';
import { U } from './store.js';
import { FAC, ABIL, SCEN_LABEL, SCEN_STATUS, STAT, officeName, heirPersonLabel } from './labels.js';
import { fmt, gapText, pctOf, reqText, rng } from './util.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { actionsLeft, useAction } from './render-actions.js';
import { giveItemBlocks, deferBlock, flushBlock } from './render-cards.js';
import { relationsBlock } from './render-relations.js';
import { prefecturePressureText, courtMinisterText } from './render-pressure.js';
import { confirmResign } from './overlays.js';
import { C, currentScreen } from './canvas/core.js';
import { modal } from './canvas/input.js';
import { bar, button, panel, portrait, text } from './canvas/widgets.js';
import { INK, LAC_TEXT, GOLD } from './canvas/theme.js';
import { pad, gapOf, contentBox, card, cardHeight, section, feedbackBlock, setContentHeight, heading } from './canvas/d-parts.js';
import { personFromRecord } from './canvas/people.js';

export { heirPersonLabel };

const S = () => C.U;
const dis = () => !U.state.alive || actionsLeft() <= 0;

// 紀錄展開中的朝臣卡與賜寶選單（僅存於記憶體，不寫入存檔）。
const expanded = new Set();
const giveOpen = new Set();
const toggleIn = (set) => (id) => { if (set.has(id)) set.delete(id); else set.add(id); render(); };

// ── 忠誠安全線（純文字） ──
export function safetyText(o, bonded) {
  if (bonded) return '忠誠安全線：君臣相得，忠誠凍結，不受安全線影響。';
  const st = loyaltySafetyStatus(o, U.state.factions[o.faction] ?? 0);
  return `忠誠安全線：${FAC(o.faction).l}勢 ${Math.round(st.influence)} ／ 需 ${Math.ceil(st.need)}，${st.ok ? '已達，忠誠穩定' : '未達，忠誠每月流失'}`;
}

// ── 進諫、黨爭：與 render-actions.js onAgency 相同的引擎呼叫與記帳 ──
function remonstrateAct(id) {
  if (actionsLeft() <= 0) return;
  const off = U.state.officials.find((o) => o.id === id);
  const r = remonstrate(U.state, id, rng('remon', U.state.year, U.state.month, id));
  if (!r) return render();
  const nm = off ? (off.personName || off.name) : '某臣';
  return useAction(r.died ? `${nm}進諫忤旨，被貶除名。` : `${nm}進諫，陛下納諫，君臣更見相得。`);
}

function partisanAct(v) {
  if (actionsLeft() <= 0) return;
  const [id, response] = String(v).split(':');
  const r = respondPartisanDemand(U.state, Number(id), response);
  if (!r.ok) {
    U.feedback = r.reason === 'dc_busy' ? '東廠案件已滿，清洗暫緩，訴求仍待裁決。' : '此訴求已了。';
    return render();
  }
  const msg = {
    balanced: '駁回聯名彈劾，平衡各方，耗皇權。',
    rallied: '扶植進逼之派，其餘兩派下降。',
    purged: '血腥清洗敵對派系，暴政上升，朝臣忠誠下滑。',
    warned: '東廠案件已滿，清洗改為告誡。',
    lapsed: '被彈劾者已不在朝，訴求作廢。',
  }[r.outcome];
  return useAction(msg);
}

// ── 任免 ──
function appointPanelOpen(k) { U.pick1 = k; U.panel = 'appoint2'; render(); }
function closePanel() { U.panel = null; U.pick1 = null; render(); }

function assignAct(id) {
  const off = U.state.officials.find((o) => o.id === id);
  const gaps = assignOffice(U.state, id, U.pick1);
  return useAction(`任命${off ? (off.personName || off.name) : ''}為${officeName(U.pick1)}${gaps.length ? '（能力未達標，效果打折）' : ''}。`);
}

function suggestAct(k) {
  const c = suggestCandidate(U.state, k);
  if (!c) { U.feedback = '朝中無閒置之臣可薦。'; return render(); }
  const gaps = assignOffice(U.state, c.id, k);
  return useAction(`依吏部建議，任命${c.personName || c.name}為${officeName(k)}${gaps.length ? '（未達標，效果打折）' : ''}。`);
}

function dismissAct(k) {
  const prev = dismissOffice(U.state, k);
  if (!prev) { U.feedback = `${officeName(k)}本無人任職。`; return render(); }
  return useAction(`免去${prev.personName || prev.name}之${officeName(k)}，官職暫缺。`);
}

// 任免區塊（單一紙本區塊內的多列）。
function officeBlocks() {
  const d = dis();
  const out = [];
  for (const k of Object.keys(OFFICES)) {
    const h = officeHolder(U.state, k);
    const gaps = h ? officeFit(h, k) : [];
    const status = !h ? '空缺' : gaps.length ? '未達標' : '達標';
    const sug = suggestCandidate(U.state, k);
    const sugFit = sug ? officeFit(sug, k) : null;
    out.push({ t: 'title', s: `${officeName(k)}　${status}` });
    out.push({ t: 'text', s: `現任：${h ? (h.personName || h.name) : '虛位'}${gaps.length ? `　未達：${gapText(gaps)}` : ''}　需求：${reqText(k)}`, size: 13 * S() });
    out.push({ t: 'text', s: `吏部建議：${sug ? `${sug.personName || sug.name}（${sugFit.length ? '未達標' : '達標'}）` : '無閒置之臣可薦'}`, size: 13 * S() });
    const items = [
      { label: '任命', onClick: () => appointPanelOpen(k), off: d, why: '本月行動已盡' },
      { label: '依建議任命', onClick: () => suggestAct(k), off: d || !sug, why: sug ? '本月行動已盡' : '朝中無閒置之臣可薦' },
    ];
    if (h) items.push({ label: '免職', onClick: () => dismissAct(k), off: d, why: '本月行動已盡' });
    out.push({ t: 'btns', items });
    out.push({ t: 'gap', h: 6 * S() });
  }
  return out;
}

// 候選人面板（任命時展開）。
function candidateBlocks() {
  const k = U.pick1;
  const d = dis();
  const cur = officeHolder(U.state, k);
  const cands = U.state.officials.filter((o) => o.office !== k);
  const blocks = [{ t: 'title', s: `選擇人選任${officeName(k)}` }, { t: 'text', s: `需求：${reqText(k)}`, size: 13 * S() }];
  if (cands.length === 0) blocks.push({ t: 'text', s: '朝中無可任之臣。' });
  else {
    blocks.push({ t: 'btns', items: cands.map((o) => {
      const g = officeFit(o, k);
      return {
        label: `${o.personName || o.name}${o.office ? `（${officeName(o.office)}）` : ''}`,
        sub: `${FAC(o.faction).l}　${g.length ? '未達標：' + gapText(g) : '達標'}`,
        onClick: () => assignAct(o.id), off: d, why: '本月行動已盡', lac: false,
      };
    }) });
  }
  if (cur) blocks.push({ t: 'text', s: `原任${cur.personName || cur.name}將卸任。`, size: 13 * S() });
  blocks.push({ t: 'btns', items: [{ label: '取消', onClick: closePanel, lac: false }] });
  return blocks;
}

// ── 黨爭 ──
function partisanBlocks() {
  const s = partisanStatus(U.state);
  if (!s.enabled) return [];
  const d = actionsLeft() <= 0;
  const head = s.stage === 'standoff' ? `對峙：${FAC(s.petitioner).l}與${FAC(s.rival).l}相持` : '朝中尚無對峙';
  const hold = s.balanceMonths > 0 ? `　均衡期尚餘 ${s.balanceMonths} 月` : '';
  const out = [
    { t: 'title', s: '黨爭' },
    { t: 'text', s: `${head}${hold}　黨錮 ${s.bans} 次　未了 ${s.openDemands.length} / ${s.openLimit}` },
  ];
  for (const dm of s.openDemands.slice(-3)) {
    out.push({ t: 'text', s: `${FAC(dm.petitioner).l}聯名彈劾${dm.officialName || '某臣'}（${FAC(dm.rival).l}）` });
    out.push({ t: 'btns', items: [
      { label: '平衡各方', onClick: () => partisanAct(`${dm.id}:balance`), off: d, why: '本月行動已盡', lac: false },
      { label: `扶植${FAC(dm.petitioner).l}`, onClick: () => partisanAct(`${dm.id}:rally`), off: d, why: '本月行動已盡' },
      { label: '血腥清洗', onClick: () => partisanAct(`${dm.id}:purge`), off: d, why: '本月行動已盡', lac: false },
    ] });
  }
  return out;
}

// 朝局的壓力文字（與 render-court 的 pressureLine 同義，改為純文字列）。
function pressureTexts() {
  const p = U.state.factionPressure || {};
  const parts = [];
  const fc = forcingFaction(U.state.factions);
  if (fc) {
    const pol = POLICIES[FACTION_POLICY[fc]];
    parts.push(`${FAC(fc).l}勢過 ${FACTION_FORCE_THRESHOLD}，已持續 ${p.forcedMonths || 0} / ${FORCE_MONTHS} 月${pol ? `，將逼迫國策改為「${pol.name}」` : ''}。`);
  }
  if (strongFactionCount(U.state.factions) === 3) parts.push('三派並立：官員忠誠每月流失。');
  if (factionsBalanced(U.state.factions)) parts.push(`三派均衡：行政效率 ${BALANCED_EFFICIENCY}，稅制增減打折。`);
  const last = (p.forcedPolicies || []).slice(-1)[0];
  if (last) parts.push(`近例：${FAC(last.faction).l}逼迫，國策由「${POLICIES[last.from]?.name || '—'}」改為「${POLICIES[last.to]?.name || '—'}」。`);
  return parts;
}

// 派系比例條（自訂繪製）。
function factionBar(f) {
  const total = Object.values(f).reduce((a, b) => a + b, 0) || 1;
  return {
    t: 'custom', h: 12 * S(),
    fn: (x, y, w) => {
      const ctx = C.ctx;
      let cx = x;
      for (const [k, v] of Object.entries(f)) {
        const sw = (w * v) / total;
        ctx.fillStyle = FAC(k).c; ctx.fillRect(cx, y, sw, 12 * S());
        cx += sw;
      }
    },
  };
}

// ── 人物卡 ──
// 人物卡展開內容（同舊版 personCard）：年歲與派系官職、安全線、五項能力、特質、進諫或共歷、賜寶。
export function personBlocks(o) {
  const bonded = isBonded(U.state, o.id);
  const shared = sharedCount(U.state, o.id);
  const f = FAC(o.faction);
  const traits = describeTraits(o).slice(0, 3).join('　');
  const blocks = [
    { t: 'text', s: `${o.age ?? '—'} 歲　${f.l}　${o.office ? officeName(o.office) : '閒置'}${bonded ? '　君臣相得' : ''}`, size: 13 * S() },
    { t: 'text', s: safetyText(o, bonded), size: 13 * S() },
    { t: 'text', s: `能力　${Object.keys(ABIL).map((k) => `${ABIL[k]} ${o.abilities?.[k] ?? '—'}`).join('　')}`, size: 13 * S() },
  ];
  if (traits) blocks.push({ t: 'text', s: traits, size: 13 * S() });
  if (bonded) blocks.push({ t: 'btns', items: [{ label: '進諫', onClick: () => remonstrateAct(o.id), off: dis(), why: '本月行動已盡' }] });
  else if (shared) blocks.push({ t: 'text', s: `共歷 ${shared} / ${BOND_THRESHOLD}`, size: 13 * S() });
  blocks.push(...giveItemBlocks(o.id, 'official', giveOpen.has(o.id), () => toggleIn(giveOpen)(o.id)));
  return blocks;
}

// 朝臣卡規格（紅漆金邊）：標頭為頭像、姓名、官職與忠誠條；展開後顯示人物卡內容。武將加經歷、兵力、派系。
export function officialSpec(o, general = false) {
  const f = FAC(o.faction);
  const pol = POLICIES[FACTION_POLICY[o.faction]];
  const loy = Math.max(0, Math.min(100, o.loyalty));
  const stance = loy >= 60 ? '效忠' : loy >= ASSASSIN_LOW_LOYALTY ? '觀望' : '離心';
  const gen = general ? buildGeneralCard(o) : null;
  const low = loy < ASSASSIN_LOW_LOYALTY;
  const isOpen = expanded.has(o.id);
  const metaBase = `${o.office ? officeName(o.office) : '閒置'}　${stance}${pol ? `　主「${pol.name}」` : ''}`;
  const meta = gen && gen.loyaltyWarn ? `${metaBase}　忠誠偏低` : metaBase;
  const blocks = [];
  if (isOpen) {
    if (gen) {
      blocks.push({ t: 'text', s: `經歷：${gen.age !== null ? `${gen.age} 歲` : '年歲不詳'}，${gen.office ? `現任${officeName(gen.office)}` : '閒置待命'}`, size: 13 * S() });
      blocks.push({ t: 'text', s: `兵力：統御 ${gen.command ?? '—'}`, size: 13 * S() });
      blocks.push({ t: 'text', s: `所屬派系：${f.l}`, size: 13 * S() });
    }
    blocks.push(...personBlocks(o));
  }
  return {
    lac: true,
    tone: LAC_TEXT,
    onClick: () => toggleIn(expanded)(o.id),
    header: {
      h: 60 * S(),
      draw: (x, y, w) => {
        const sc = S(), pw = 44 * sc, ph = 56 * sc, tx = x + pw + 10 * sc, tw = w - pw - 60 * sc;
        portrait(x, y, pw, ph, personFromRecord(o, { general, robe: f.c }));
        text(o.personName || o.name, tx, y, { size: 15 * sc, weight: 'bold', color: LAC_TEXT, maxW: tw });
        text(String(Math.round(loy)), x + w, y, { size: 16 * sc, weight: 'bold', color: low ? GOLD : '#c9e6c0', align: 'right', maxW: 56 * sc });
        text(meta, tx, y + 20 * sc, { size: 12 * sc, color: 'rgba(246,230,184,.8)', maxW: tw });
        const bw = Math.max(0, w - pw - 70 * sc);
        // 忠誠條：低於安全門檻者以警示色標示。
        bar(tx, y + 44 * sc, bw, 8 * sc, loy, 100, low ? '#c04a3a' : GOLD);
      },
    },
    blocks,
  };
}

// 排列卡片（每列 2 張，窄版 1 張）；回傳高度。
function gridOf(x, y, w, specs) {
  const cols = w >= 560 * S() ? 2 : 1;
  const cw = (w - gapOf() * (cols - 1)) / cols;
  let cy = y;
  for (let i = 0; i < specs.length; i += cols) {
    const row = specs.slice(i, i + cols);
    const rowH = Math.max(...row.map((sp) => cardHeight(cw, sp)));
    row.forEach((sp, j) => card(x + j * (cw + gapOf()), cy, cw, sp));
    cy += rowH + gapOf();
  }
  return cy - y;
}

// ── 朝臣頁 ──
// 單行提示文字，回傳高度。
function textLine(x, y, w, s) {
  return text(s, x, y, { size: 13 * S(), maxW: w }) + gapOf();
}

export function drawOfficials() {
  const box = contentBox();
  const { x, w } = box;
  const inner = w - 2 * pad();
  let y = box.y;
  const f = U.state.factions;
  const legend = Object.entries(f).map(([k, v]) => `${FAC(k).l} ${Math.round(v)}`).join('　');
  const fb = feedbackBlock();
  if (fb) y += card(x, y, w, { lac: false, blocks: [fb] }) + gapOf();

  const court = U.state.officials.filter(isCourtOfficial);
  const local = U.state.officials.filter((o) => !isCourtOfficial(o));

  y += section(x, y, w, '朝局', [
    factionBar(f),
    { t: 'gap', h: 6 * S() },
    { t: 'text', s: legend, size: 13 * S() },
    ...pressureTexts().map((s) => ({ t: 'text', s, size: 13 * S() })),
    { t: 'text', s: courtMinisterText(U.state), size: 13 * S() },
    ...partisanBlocks(),
  ]) + gapOf();

  y += section(x, y, w, '朝臣關係圖', [relationsBlock(U.state, inner)]) + gapOf();

  const officeRows = [
    { t: 'text', s: '需求未達者仍可任命，效果打折。免職後的空缺，若有完全達標之臣，月末由吏部自動補任。', size: 13 * S() },
    ...officeBlocks(),
    ...(U.panel === 'appoint2' && OFFICES[U.pick1] ? candidateBlocks() : []),
  ];
  y += section(x, y, w, '任免・官職', officeRows) + gapOf();

  for (const k of FACTIONS) {
    const list = court.filter((o) => o.faction === k).sort((a, b) => b.loyalty - a.loyalty);
    y += heading(x, y, w, `${FAC(k).l}　${list.length} 人`, FAC(k).c);
    if (list.length === 0) y += textLine(x, y, w, '此派無朝臣。');
    else y += gridOf(x, y, w, list.map((o) => officialSpec(o, isGeneral(o)))) + gapOf();
  }
  if (local.length) {
    y += heading(x, y, w, `外任知府　${local.length} 人`, INK);
    y += gridOf(x, y, w, local.map((o) => officialSpec(o, false))) + gapOf();
  }
  if (court.length + local.length === 0) y += textLine(x, y, w, '朝中無人。');
  setContentHeight(y);
}

// ── 東廠頁 ──
const STATUS_TEXT = { leverage: '把柄待決', deferred: '暫緩', investigating: '調查中' };

export function patrolAct(id) {
  const r = dispatchCanalPatrol(U.state, id);
  U.feedback = r.ok ? '已派東廠巡漕，該府六月內免於貪腐與劫掠。' : ({ limit: '本月巡漕派遣已達上限。', treasury: '國庫不足，無力派遣巡漕。', unknown: '無此府。', disabled: '此局未開放漕運。' }[r.reason] || '巡漕未成。');
  if (r.ok) save();
  render();
}

export function drawDC() {
  const box = contentBox();
  const { x, w } = box;
  let y = box.y;
  const off = (id) => (U.state.officials.find((o) => o.id === id) || {}).name || '（已去職）';
  const open = U.state.dongchang.cases.filter((c) => c.status !== 'closed');
  const closed = U.state.dongchang.cases.filter((c) => c.status === 'closed').slice(-8).reverse();
  const deferredN = open.filter((c) => c.status === 'deferred').length;
  const fb = feedbackBlock();
  if (fb) y += card(x, y, w, { lac: false, blocks: [fb] }) + gapOf();

  // 進行中：每案一張紅漆卡，附把柄等級與稍後處理鈕。
  const caseCards = open.length
    ? open.map((c) => ({
      lac: true,
      blocks: [
        { t: 'title', s: off(c.officialId) },
        { t: 'text', s: STATUS_TEXT[c.status] ?? c.status, size: 13 * S() },
        { t: 'text', s: `把柄等級 ${[1, 2, 3].map((i) => (i <= c.level ? '●' : '○')).join('')}`, size: 13 * S() },
        ...(c.status === 'leverage' ? [deferBlock(c)] : []),
      ],
    }))
    : [{ lac: true, blocks: [{ t: 'text', s: '目前無案件。' }] }];
  if (deferredN) caseCards[caseCards.length - 1].blocks.push(flushBlock());
  y += heading(x, y, w, '進行中');
  for (const sp of caseCards) y += card(x, y, w, sp) + gapOf();

  // 漕運
  const canalRows = canalStatus(U.state).map((st) => {
    const pref = U.state.prefectures.find((p) => p.id === st.id);
    const gov = governorOf(U.state, pref);
    const name = (PREFECTURE_DEFS.find((d) => d.id === st.id) || {}).name || st.id;
    const loss = gov && gov.loyalty < CANAL_DISLOYAL ? '貪腐風險' : '無貪腐風險';
    const blocks = [
      { t: 'title', s: name },
      { t: 'text', s: `知府${gov ? `忠誠 ${Math.round(gov.loyalty)}` : '缺位'}　${loss}`, size: 13 * S() },
    ];
    blocks.push(st.patrolling
      ? { t: 'text', s: `巡漕中 · 尚餘 ${st.patrolLeft} 月` }
      : { t: 'btns', items: [{ label: `東廠巡漕（耗 ${CANAL_PATROL_COST} 國庫，${CANAL_PATROL_MONTHS} 月）`, onClick: () => patrolAct(st.id) }] });
    return blocks;
  });
  const canalLog = (U.state.canalLog || []).slice(-6).reverse();
  const canalBlocks = [
    { t: 'title', s: '漕運' },
    { t: 'text', s: '知府忠誠低則稅入於解送途中被貪腐；叛亂或民心低落之府另有劫掠風險。巡漕可免除該府損耗，並小幅增收。', size: 13 * S() },
    ...canalRows.flat(),
  ];
  if (canalLog.length) {
    canalBlocks.push({ t: 'text', s: '近期損耗', size: 12.5 * S() });
    for (const x2 of canalLog) canalBlocks.push({ t: 'text', s: `${(PREFECTURE_DEFS.find((d) => d.id === x2.prefecture) || {}).name || x2.prefecture}　${x2.year}年${x2.month}月 損 ${x2.lost}${x2.causes.includes('raid') ? '（劫掠）' : ''}`, size: 13 * S() });
  }
  y += card(x, y, w, { lac: true, blocks: canalBlocks }) + gapOf();

  y += card(x, y, w, {
    lac: true,
    blocks: [
      { t: 'title', s: '近期結案' },
      ...(closed.length ? closed.map((c) => ({ t: 'text', s: `${off(c.officialId)}　${c.outcome || '結案'}`, size: 13 * S() })) : [{ t: 'text', s: '尚無結案。' }]),
    ],
  }) + gapOf();
  setContentHeight(y);
}

// ── 帝王頁（國勢、本紀、收藏、史記、禪位） ──
let resignOpen = false;

function scenarioBlocks() {
  const s = U.state.scenario;
  const def = s && scenarioDef(s.id);
  if (!def) return null;
  let p = null;
  try { p = evaluateScenario(U.state); } catch (e) { p = null; }
  const blocks = [
    { t: 'title', s: `本紀・${def.name}` },
    { t: 'text', s: def.goalText, size: 13 * S() },
    { t: 'text', s: SCEN_STATUS[s.status] || s.status, size: 12.5 * S() },
  ];
  if (p) for (const r of p.progress) blocks.push({ t: 'kv', k: `${SCEN_LABEL[r.key] || r.key} 目標 ${r.target}`, v: r.met ? '已達' : '未達' });
  return blocks;
}

function economyBlocks() {
  const econ = ensureEconomy(U.state);
  const eff = administrativeEfficiency(U.state);
  const blocks = [
    { t: 'title', s: '稅制與州府' },
    { t: 'text', s: `目前稅制：${TAX_TIERS.map((t) => (t === econ.tax ? `【${t}稅】` : `${t}稅`)).join('　')}`, size: 13 * S() },
    { t: 'text', s: `行政效率 ${eff}${eff < 1 ? '（三派均衡，稅制增減打折）' : ''}`, size: 13 * S() },
  ];
  for (const p of U.state.prefectures || []) {
    blocks.push({ t: 'kv', k: p.name, v: `產值 ${Number(p.yield || 0).toFixed(2)}` });
    blocks.push({ t: 'text', s: `知府${p.governor?.name || '—'}　政 ${p.governor?.abilities?.politics ?? '—'}　${p.output === 'agriculture' ? '農產' : '商產'}　城防 ${Math.round(p.defense ?? 50)}`, size: 12.5 * S() });
    blocks.push({ t: 'text', s: prefecturePressureText(U.state, p.id), size: 12.5 * S() });
  }
  if (!(U.state.prefectures || []).length) blocks.push({ t: 'text', s: '尚無州府資料。' });
  return blocks;
}

function collectionBlocks() {
  const bonuses = (U.state.collections && U.state.collections.bonuses) || [];
  const blocks = [{ t: 'title', s: '收藏' }];
  for (const id of Object.keys(COLLECTIONS)) {
    const p = collectionProgress(U.state, id), set = COLLECTIONS[id];
    blocks.push({ t: 'kv', k: p.name, v: `${p.have}/${p.total}` });
    blocks.push({ t: 'bar', v: p.have, max: p.total, color: p.complete ? GOLD : undefined });
    blocks.push({ t: 'text', s: `收齊加成：${STAT[set.bonus.stat].l} +${set.bonus.amount}${bonuses.includes(id) ? '（已得）' : ''}`, size: 12.5 * S() });
  }
  return blocks;
}

export function drawThrone() {
  const box = contentBox();
  const { x, w } = box;
  let y = box.y;
  const sb = scenarioBlocks();
  if (sb) y += section(x, y, w, '', sb) + gapOf();
  const wins = U.state.wars.filter((ww) => ww.won).length;
  const ty = tyrannyStatus(U.state);
  const meters = Object.keys(STAT).flatMap((k) => [
    { t: 'kv', k: STAT[k].l, v: `${fmt(k, U.state.stats[k])}` },
    { t: 'bar', v: pctOf(k), max: 100, color: pctOf(k) < 25 ? '#c04a3a' : pctOf(k) > 70 ? GOLD : undefined },
  ]);
  y += section(x, y, w, '國勢', meters) + gapOf();
  y += section(x, y, w, '', economyBlocks()) + gapOf();
  y += section(x, y, w, '', collectionBlocks()) + gapOf();
  const annals = (U.state.annals || []).slice().reverse();
  y += section(x, y, w, '年度回顧', annals.length
    ? annals.map((a) => ({ t: 'text', s: `第${a.generation}世 ${a.year}年　國庫 ${a.treasury}　民心 ${a.people}　兵力 ${a.military}　勝 ${a.wins}/${a.wars}`, size: 13 * S() }))
    : [{ t: 'text', s: '歲末方有回顧。' }]) + gapOf();
  y += section(x, y, w, '帝王', [
    { t: 'kv', k: '年歲', v: `${U.state.age}` },
    { t: 'kv', k: '征戰', v: `${U.state.wars.length} 次 · 勝 ${wins}` },
    { t: 'kv', k: '暴政', v: `${ty.value} / ${ty.max}` },
    { t: 'bar', v: ty.value, max: 100, color: ty.qingliuDrainOn ? '#c04a3a' : undefined },
    { t: 'text', s: `責罰、下獄會累積暴政。暴政達 ${ty.threshold}，清流勢力每月下降 1${ty.qingliuDrainOn ? '（目前生效）' : ''}。暴政逾 40 者，另有遇刺之險。`, size: 12.5 * S() },
    { t: 'btns', items: [{ label: '禪位予皇子', onClick: openResign, lac: false }] },
  ]) + gapOf();
  const chron = (U.state.chronicle || []).map((c) => chronicleLine(c));
  y += section(x, y, w, '史記', chron.length
    ? chron.map((l) => ({ t: 'text', s: `${l.text}　${l.tag}`, size: 13 * S() }))
    : [{ t: 'text', s: '本朝初立，尚無史記。' }]) + gapOf();
  if (resignOpen && currentScreen() === 'throne') modal((cc) => drawResignDialog(cc), () => { resignOpen = false; });
  setContentHeight(y);
}

// 開啟禪位確認（帝王頁按鈕與測試共用）。
export function openResign() { resignOpen = true; render(); }
export function isResignOpen() { return resignOpen; }

// 禪位確認對話框（文字同舊 openResignDialog）。
function drawResignDialog(cc) {
  const S0 = cc.U, m = 22 * S0;
  const heir = U.state.dynasty.crownPrince ? U.state.heirs.find((h) => h.id === U.state.dynasty.crownPrince) : null;
  const who = heir ? `太子${heir.personName || heir.name}` : '成年皇子中擇定之人';
  const w = Math.min(cc.W - 2 * m, 420 * S0), h = 200 * S0;
  const x = (cc.W - w) / 2, y = (cc.H - h) / 2;
  panel(x, y, w, h, { block: true, r: 10 });
  text('禪位予皇子', x + 20 * S0, y + 18 * S0, { size: 18 * S0, weight: 'bold', color: INK, maxW: w - 40 * S0 });
  text(`禪位即結束本世，由${who}即位。此舉不可復原，史冊將記下此次禪位。`, x + 20 * S0, y + 52 * S0, { size: 14 * S0, color: INK, maxW: w - 40 * S0 });
  button(x + w - 186 * S0, y + h - 56 * S0, 80 * S0, 36 * S0, '取消', () => { resignOpen = false; render(); }, { lac: false, fs: 14 * S0 });
  button(x + w - 96 * S0, y + h - 56 * S0, 80 * S0, 36 * S0, '確認禪位', () => { resignOpen = false; confirmResign(); render(); }, { fs: 14 * S0 });
}

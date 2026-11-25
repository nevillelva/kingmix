// web/ui/canvas/campaign.js：戰役畫面的 Canvas 版（親征、戰況、戰報捲動、自動戰鬥、跳過、加速）。
// 數值與流程只讀 src/campaign.js、src/war.js、src/war-autoplay.js；本檔不改動任何規則，顯示數值一律讀 state／campaign。
// 繪製使用 A 的 widgets.js（panel／text／bar／button），點擊區域由 widgets 經 input.js 的 hit 登記。
// 點擊一律回呼至呼叫端（應為 game-flow.js 的 campAct），與舊版行為一致。
import { TACTICS, formatBattleLog, nominalStrength } from '../../../src/war.js';
import { MAX_ROUNDS, PEACE_TRIBUTE_COST, RECON_GRAIN_COST, WINS_NEEDED } from '../../../src/campaign.js';
import { battleFrames, nextBattleSpeed, visibleRoundCount } from '../../../src/war-autoplay.js';
import { panel, text, bar, button } from './widgets.js';
import { INK, RED } from './theme.js';

// 兵種相剋（騎→盾→弓→槍→騎：前者剋後者）。僅作戰報圖示，不改動戰術數值。
export const UNIT_CHAIN = Object.freeze(['騎', '盾', '弓', '槍']);
export const unitBeats = (u) => UNIT_CHAIN[(UNIT_CHAIN.indexOf(u) + 1) % UNIT_CHAIN.length];

// 排版基準值（像素，繪製時乘上 C.U 縮放）。
export const LAYOUT = Object.freeze({ pad: 16, row: 22, btnH: 44, gap: 8, barH: 16, ctlH: 30, ctlW: 96, labelW: 48, countW: 56, maxLogRows: 8 });

// 兵力對比：優先取最近一回合之我方、敵方戰力；尚無回合時我方取名目戰力，敵方取偵察所得（未明則為 null）。
export function forceBarModel(c, state) {
  const last = (c.rounds || []).at(-1);
  let ours = last ? last.ours : null;
  if (ours == null && state) {
    try { ours = Math.round(nominalStrength(state)); } catch (e) { ours = null; }
  }
  const enemy = last ? last.enemy : (c.intel === 'scouted' ? c.estimate : null);
  const oursOk = Number.isFinite(ours) && ours > 0;
  const enemyOk = Number.isFinite(enemy) && enemy > 0;
  const total = (oursOk ? ours : 0) + (enemyOk ? enemy : 0);
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return {
    ours: oursOk ? ours : null,
    enemy: enemyOk ? enemy : null,
    oursPct: oursOk ? pct(ours) : 0,
    enemyPct: enemyOk ? pct(enemy) : 0,
  };
}

// 兵種相剋圖示列的配對（騎剋盾、盾剋弓、弓剋槍、槍剋騎）。
export function counterPairs() {
  return UNIT_CHAIN.map((u) => ({ a: u, b: unitBeats(u) }));
}

// 戰報偏好的切換（自動戰鬥開關、1×↔2× 加速）。回傳新物件；跳過不屬於偏好，見 skipShown。
export function reduceBattlePrefs(prefs, action) {
  if (action === 'auto') return { ...prefs, auto: !prefs.auto };
  if (action === 'speed') return { ...prefs, speed: nextBattleSpeed(prefs.speed) };
  return prefs;
}

// 播放一格：已顯示回合數加一，不超過總數。
export function advanceShown(shown, total) {
  return Math.min(total, shown + 1);
}

// 跳過：全數顯示。
export function skipShown(total) {
  return total;
}

// 逐回合戰報列（每列：標記、文字、勝負色調、我方／敵方占比）。hidden 為尚未播放到之列。
export function battleLines(rounds = [], prefs = { auto: false, speed: 1 }, shown = 0) {
  const frames = battleFrames(rounds);
  const visible = visibleRoundCount(prefs, rounds.length, shown);
  return rounds.map((r, i) => {
    const [head] = formatBattleLog({ rounds: [r] });
    const mark = r.line && r.line.includes('剋敵') ? '▲' : r.line && r.line.includes('遭') ? '▼' : '●';
    return {
      index: i,
      text: `${head}${r.starved ? '（粮絕，戰力減損）' : ''}`,
      mark,
      tone: r.won ? 'win' : 'lose',
      oursPct: frames[i].oursPct,
      enemyPct: frames[i].enemyPct,
      hidden: i >= visible,
    };
  });
}

// 戰術按鈕（三種戰術；粮草不足、賭運等提示與舊版相同）。
export function tacticOptions(c) {
  return Object.entries(TACTICS).map(([key, t]) => ({
    act: 'camp-tactic',
    arg: key,
    label: t.label,
    hint: `耗粮 ${t.grain}${c.grain < t.grain ? '（粮草不足，戰力減損）' : ''}${t.gambleChance ? '　（有賭運，成敗難料）' : ''}`,
  }));
}

// 戰況文字：標題、回合與勝負、粮草與敵情（未明或約值）。
export function campaignHeader(c) {
  const scouted = c.intel === 'scouted';
  return {
    title: `軍務・${c.title || '親征'}`,
    kicker: `第 ${Math.min(c.round + 1, MAX_ROUNDS)} 回合　・　己勝 ${c.ourWins}　敵勝 ${c.enemyWins}`,
    sub: `至多 ${MAX_ROUNDS} 回合，先勝 ${WINS_NEEDED} 回合者勝。粮草 ${Math.floor(c.grain)}。敵情：${scouted ? `約 ${c.estimate}（誤差約 ±8%）` : '未明'}`,
  };
}

// 本回合可用之其他行動（與 campAct 之條件一致）：偵察僅於第 0 回合且敵情未明；議和於第 1 回合起；歲幣需有鄰國。
export function campaignActions(c) {
  const out = [];
  if (c.round === 0 && c.intel !== 'scouted') out.push({ act: 'camp-recon', label: `遣探偵察（耗粮 ${RECON_GRAIN_COST}）` });
  if (c.round >= 1) out.push({ act: 'camp-peace', label: '遣使議和' });
  if (c.neighborId) out.push({ act: 'camp-tribute', label: `歲幣求和（耗國庫 ${PEACE_TRIBUTE_COST}）` });
  return out;
}

// 版面配置（純函式）：u 為 C.U 縮放倍率。回傳各區塊矩形與內容總高度 h（供 C.contentH 讓內容區可捲動）。
// 戰報僅列出已播放之列，至多 maxLogRows 列（最新者在下）。
export function campaignLayout(c, { x = 0, y = 0, w = 640, u = 1, prefs = { auto: false, speed: 1 }, shown = 0 } = {}) {
  const L = LAYOUT;
  const s = (v) => v * u;
  const pad = s(L.pad), row = s(L.row), gap = s(L.gap);
  const inner = w - pad * 2;
  let cy = y + pad;
  const titleAt = { x: x + pad, y: cy }; cy += row + s(10);
  const kickerAt = { x: x + pad, y: cy }; cy += row;
  const subAt = { x: x + pad, y: cy }; cy += row * 2 + s(4);
  const barRect = (dy) => ({ x: x + pad + s(L.labelW), y: cy + dy, w: inner - s(L.labelW) - s(L.countW), h: s(L.barH) });
  const bars = [{ key: 'ours', rect: barRect(0) }, { key: 'enemy', rect: barRect(s(L.barH) + s(6)) }];
  cy += (s(L.barH) + s(6)) * 2 + gap;
  const counterAt = { x: x + pad, y: cy }; cy += row + gap;
  const lines = battleLines(c.rounds || [], prefs, shown);
  const ctlW = s(L.ctlW), ctlH = s(L.ctlH);
  const ctl = {
    count: { x: x + pad, y: cy + s(7), text: `${visibleRoundCount(prefs, lines.length, shown)}／${lines.length} 回合` },
    auto: { x: x + w - pad - ctlW * 3 - gap * 2, y: cy, w: ctlW, h: ctlH, label: `自動戰鬥：${prefs.auto ? '開' : '關'}` },
    skip: { x: x + w - pad - ctlW * 2 - gap, y: cy, w: ctlW, h: ctlH, label: '跳過' },
    speed: { x: x + w - pad - ctlW, y: cy, w: ctlW, h: ctlH, label: `加速 x${prefs.speed}` },
  };
  cy += ctlH + gap;
  const rows = [];
  const visibleLines = lines.filter((l) => !l.hidden).slice(-L.maxLogRows);
  if (!lines.length) { rows.push({ kind: 'empty', x: x + pad, y: cy, text: '尚無回合。' }); cy += row; }
  for (const l of visibleLines) { rows.push({ kind: 'log', x: x + pad, y: cy, line: l, w: inner }); cy += row; }
  cy += gap;
  const tacticsLabelAt = { x: x + pad, y: cy }; cy += row + s(4);
  const tactics = tacticOptions(c).map((opt) => {
    const rect = { x: x + pad, y: cy, w: inner, h: s(L.btnH) };
    cy += s(L.btnH) + gap;
    return { opt, rect };
  });
  const actions = [];
  let ax = x + pad;
  for (const a of campaignActions(c)) {
    const aw = Math.max(s(160), a.label.length * s(14) + s(24));
    actions.push({ opt: a, rect: { x: ax, y: cy, w: aw, h: s(L.btnH) } });
    ax += aw + gap;
  }
  if (actions.length) cy += s(L.btnH) + gap;
  cy += pad;
  return {
    h: cy - y,
    panel: { x, y, w, h: cy - y },
    titleAt, kickerAt, subAt, bars, counterAt, ctl,
    header: campaignHeader(c),
    logRows: rows, tacticsLabelAt, tactics, actions,
    counterPairs: counterPairs(),
    pad, row, gap,
  };
}

// 繪製。api 為 { panel, text, bar, button }（即 widgets.js 之匯出；測試時可注入替身）。C 為 core.js 的繪製狀態：
// 讀取 C.U（縮放）、C.W（寬度）；寫入 C.contentH 使內容區可捲動。點擊經 onAct(act, arg)、onPref(action)、onSkip() 回呼。
// state 僅供兵力名目戰力之讀取；不寫入任何狀態。
export function drawCampaign(api, C, { c, state = null, prefs = { auto: false, speed: 1 }, shown = 0, x = 0, y = 0, w = C.W || 640, onAct, onPref, onSkip }) {
  const u = C.U || 1;
  const lay = campaignLayout(c, { x, y, w, u, prefs, shown });
  const fb = forceBarModel(c, state);
  C.contentH = Math.max(C.contentH || 0, lay.h);
  api.panel(lay.panel.x, lay.panel.y, lay.panel.w, lay.panel.h, {});
  api.text(lay.header.title, lay.titleAt.x, lay.titleAt.y, { size: 18 * u, weight: 'bold', color: INK });
  api.text(lay.header.kicker, lay.kickerAt.x, lay.kickerAt.y, { size: 14 * u, color: INK });
  api.text(lay.header.sub, lay.subAt.x, lay.subAt.y, { size: 13 * u, color: INK, maxW: w - lay.pad * 2 });
  const vals = { ours: fb.ours, enemy: fb.enemy };
  const pcts = { ours: fb.oursPct, enemy: fb.enemyPct };
  for (const b of lay.bars) {
    api.text(b.key === 'ours' ? '我方' : '敵方', b.rect.x - LAYOUT.labelW * u, b.rect.y - 2 * u, { size: 13 * u, color: INK });
    api.bar(b.rect.x, b.rect.y, b.rect.w, b.rect.h, pcts[b.key], 100, b.key === 'ours' ? '#5a7fb0' : '#b0604a');
    const v = vals[b.key];
    api.text(v == null ? (b.key === 'ours' ? '—' : '未明') : String(v), b.rect.x + b.rect.w + 8 * u, b.rect.y - 2 * u, { size: 13 * u, color: INK });
  }
  api.text(`兵種相剋：${lay.counterPairs.map((p) => `${p.a}剋${p.b}`).join('、')}`, lay.counterAt.x, lay.counterAt.y, { size: 13 * u, color: INK });
  api.text(lay.ctl.count.text, lay.ctl.count.x, lay.ctl.count.y, { size: 13 * u, color: INK });
  const ctlOpts = { fs: 12 * u, lac: false };
  api.button(lay.ctl.auto.x, lay.ctl.auto.y, lay.ctl.auto.w, lay.ctl.auto.h, lay.ctl.auto.label, () => onPref?.('auto'), ctlOpts);
  api.button(lay.ctl.skip.x, lay.ctl.skip.y, lay.ctl.skip.w, lay.ctl.skip.h, lay.ctl.skip.label, () => onSkip?.(), ctlOpts);
  api.button(lay.ctl.speed.x, lay.ctl.speed.y, lay.ctl.speed.w, lay.ctl.speed.h, lay.ctl.speed.label, () => onPref?.('speed'), ctlOpts);
  for (const r of lay.logRows) {
    if (r.kind === 'empty') { api.text(r.text, r.x, r.y, { size: 13 * u, color: INK }); continue; }
    const color = r.line.tone === 'win' ? '#2e6b3a' : RED;
    api.text(`${r.line.mark} ${r.line.text}`, r.x, r.y, { size: 13 * u, color, maxW: r.w - 80 * u });
    api.bar(r.x + r.w - 60 * u, r.y + 5 * u, 60 * u, 6 * u, r.line.oursPct, 100, '#5a7fb0');
  }
  api.text('選擇本回合戰術：', lay.tacticsLabelAt.x, lay.tacticsLabelAt.y, { size: 13 * u, color: INK });
  for (const t of lay.tactics) {
    api.button(t.rect.x, t.rect.y, t.rect.w, t.rect.h, t.opt.label, () => onAct?.(t.opt.act, t.opt.arg), { sub: t.opt.hint, fs: 15 * u });
  }
  for (const a of lay.actions) {
    api.button(a.rect.x, a.rect.y, a.rect.w, a.rect.h, a.opt.label, () => onAct?.(a.opt.act), { fs: 14 * u });
  }
  return lay;
}

// 畫面登記用的實際繪製（使用 widgets.js 之實作）。由畫面路由於每幀呼叫，例如：
//   registerScreen('campaign', (C) => drawCampaignScreen(C, { c, state, prefs, shown, onAct: campAct, ... }));
export function drawCampaignScreen(C, opts) {
  return drawCampaign({ panel, text, bar, button }, C, opts);
}

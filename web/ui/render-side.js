// web/ui/render-side.js：側線玩法介面（Canvas）：微服私訪奇遇對話、煉丹狀況、側線開關。
// 只呼叫 src/side-events.js 既有 API（含唯讀的 alchemyStatus），不在此直接寫入 state；抉擇經 resolveEncounter 裁決。
import { ALCHEMY_COST, alchemyStatus, pendingEncounter, resolveEncounter, sideEventsEnabled, setSideEventsEnabled } from '../../src/side-events.js';
import { PREFECTURE_DEFS } from '../../src/economy.js';
import { SOOTHE_COST } from '../../src/encounter-data.js';
import { U } from './store.js';
import { esc } from './util.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { C } from './canvas/core.js';
import { modal } from './canvas/input.js';
import { panel } from './canvas/widgets.js';
import { tx, btn } from './canvas/bfx.js';
import { RED } from './canvas/theme.js';

const EFFECT_NAME = {
  morale: '所至府民心', benevolence: '仁德', prestige: '威儀', literature: '文學',
  military: '兵力', treasury: '國庫', health: '健康', charm: '聲色',
};

const ALCHEMY_REASON = {
  disabled: '側線已關閉，無從煉丹。',
  cooldown: '本月已煉過丹，每月至多一次。',
  treasury: `國庫不足，煉丹需耗國庫 ${ALCHEMY_COST}。`,
};

const ENCOUNTER_REASON = {
  none: '此事已了。',
  no_choice: '無此抉擇。',
  treasury: `國庫不足，安撫需耗國庫 ${SOOTHE_COST}。`,
  no_prefecture: '所至州府已不可查。',
};

// 效果列表文字，例如「仁德+3、所至府民心+4」。
export function effectsText(effects) {
  return Object.entries(effects)
    .map(([k, d]) => `${EFFECT_NAME[k] ?? k}${d >= 0 ? '+' : ''}${d}`)
    .join('、');
}

// 煉丹按鈕的可用性與說明文字（純函式，不改 state）。
export function alchemyAvailability(state) {
  const st = alchemyStatus(state);
  return {
    ok: st.ok,
    reason: st.reason,
    text: st.ok
      ? `耗國庫 ${ALCHEMY_COST}，每月至多一次；成則健康、聲色增益，敗則健康受損。`
      : ALCHEMY_REASON[st.reason],
  };
}

// 煉丹結果文字：成功、失敗，或未成之原因。
export function alchemyResultText(r) {
  if (!r || !r.ok) return ALCHEMY_REASON[r?.reason] ?? '煉丹未成。';
  const fx = effectsText(r.effects);
  return r.outcome === 'success'
    ? `煉丹成功：${fx}，國庫耗 ${ALCHEMY_COST}。`
    : `煉丹失敗：${fx}，國庫耗 ${ALCHEMY_COST}。`;
}

// 奇遇對話的 HTML 字串（純函式，供測試與舊版對照；畫面本身以 Canvas 繪製）。
export function encounterHtml(enc, placeName) {
  const where = placeName ? `於${esc(placeName)}` : '途中';
  const choices = enc.choices
    ? `<div class="dlg-btns">${['punish', 'soothe'].map((k) => `<button type="button" class="btn ${k === 'punish' ? '' : 'zhu'} mini" data-dlg="${k}">${esc(enc.choices[k].label)}</button>`).join('')}</div>
    <p class="hint" data-dlg-msg></p>`
    : `<div class="dlg-btns"><button type="button" class="btn zhu mini" data-dlg="ok">知道了</button></div>`;
  return `<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
    <h2 id="dlg-t">微服私訪・${esc(enc.title)}</h2>
    <p id="dlg-d">${where}，${esc(enc.narrative)}</p>
    ${enc.choices ? '<p class="hint">嚴懲：府民心上升、知府忠誠下降，知府或將離心割據。安撫：耗國庫，府民心小升。</p>' : `<p class="hint">${esc(effectsText(enc.effects ?? {}))}</p>`}
    ${choices}
  </div>`;
}

// ── 奇遇覆蓋層（Canvas） ──
// 待決的奇遇與其所在府名；覆蓋層於每幀由 keepOverlays() 重新請求（A 的 modal 規則）。
let active = null; // { enc, placeName, msg }

// 顯示奇遇對話：抉擇於此裁決（resolveEncounter），點背景關閉則待決保留。
export function showEncounter(enc, placeName) {
  active = { enc, placeName, msg: '' };
}

function dismiss() {
  active = null;
}

function decide(key) {
  const r = resolveEncounter(U.state, key);
  if (!r.ok) { active.msg = ENCOUNTER_REASON[r.reason] ?? '此舉未成。'; return; }
  U.feedback = `${r.title}：${r.text}`;
  dismiss();
  save();
  render();
}

function drawEncounter() {
  const g = C.ctx;
  if (!g || !active) return;
  const { enc, placeName, msg } = active;
  const W = C.W, H = C.H, u = C.U;
  const where = placeName ? `於${placeName}` : '途中';
  const bw = Math.min(W * 0.84, 460 * u), bx = W / 2 - bw / 2, by = H * 0.24;
  const bh = 250 * u;
  panel(bx, by, bw, bh, { fill: 'rgba(255,250,236,.97)', block: true });
  tx(`微服私訪・${enc.title}`, bx + 16 * u, by + 14 * u, 18, { weight: 'bold', maxW: bw - 32 * u });
  tx(`${where}，${enc.narrative}`, bx + 16 * u, by + 46 * u, 14, { maxW: bw - 32 * u });
  const hint = enc.choices
    ? '嚴懲：府民心上升、知府忠誠下降，知府或將離心割據。安撫：耗國庫，府民心小升。'
    : effectsText(enc.effects ?? {});
  tx(hint, bx + 16 * u, by + 110 * u, 12, { color: 'rgba(28,26,23,.6)', maxW: bw - 32 * u });
  const by2 = by + bh - 56 * u;
  if (enc.choices) {
    if (msg) tx(msg, bx + 16 * u, by2 - 22 * u, 12, { color: RED, maxW: bw - 32 * u });
    btn(bx + 16 * u, by2, (bw - 40 * u) / 2, 40 * u, enc.choices.punish.label, () => decide('punish'), { ghost: true });
    btn(bx + 24 * u + (bw - 40 * u) / 2, by2, (bw - 40 * u) / 2, 40 * u, enc.choices.soothe.label, () => decide('soothe'));
  } else {
    btn(bx + bw / 2 - 70 * u, by2, 140 * u, 40 * u, '知道了', () => { dismiss(); save(); render(); });
  }
}

// 每幀重新請求奇遇覆蓋層（由各畫面於繪製結尾呼叫）。
export function keepOverlays() {
  if (active) modal(drawEncounter, dismiss);
}

// 待決奇遇於重新載入或他處打開後仍須裁決：若尚無覆蓋層開啟，則重新顯示。
export function paintPendingEncounter() {
  if (!U.state || active) return;
  const enc = pendingEncounter(U.state);
  if (!enc) return;
  const name = PREFECTURE_DEFS.find((d) => d.id === enc.prefectureId)?.name ?? '';
  showEncounter(enc, name);
}

// 側線開關的文字與狀態。未開局時以預設（開啟）顯示並停用。
export function sideToggleLabel(on) {
  return `側線奇遇：${on ? '開' : '關'}`;
}

// 舊版 DOM 之開關鈕（index.html 之 #side-toggle）已由 Canvas 取代；此處僅在仍存在時同步文字，不影響 Canvas。
export function paintSideToggle() {
  const b = typeof document !== 'undefined' ? document.getElementById('side-toggle') : null;
  if (!b) return;
  const on = U.state ? sideEventsEnabled(U.state) : true;
  b.textContent = sideToggleLabel(on);
  b.setAttribute('aria-pressed', String(on));
  b.disabled = !U.state;
}

export function onSideToggle() {
  if (!U.state) return;
  const on = !sideEventsEnabled(U.state);
  setSideEventsEnabled(U.state, on);
  U.feedback = on ? '側線奇遇已開啟，巡幸可能遇見微服私訪之事。' : '側線奇遇已關閉，巡幸與朝政與主線完全相同。';
  save();
  render();
}

// 側線列（Canvas）：開關鈕與煉丹狀況一行。回傳佔用高度（邏輯像素，未乘縮放）。
export function drawSideRow(x, y, w) {
  const state = U.state;
  if (!C.ctx) return 0;
  const u = C.U;
  const on = state ? sideEventsEnabled(state) : true;
  panel(x, y, w, 56 * u, { fill: 'rgba(255,250,236,.7)' });
  tx('側線', x + 12 * u, y + 8 * u, 14, { weight: 'bold' });
  const av = state ? alchemyAvailability(state) : null;
  tx(av ? `煉丹：${av.text}` : '煉丹：未開局', x + 12 * u, y + 28 * u, 11, { color: 'rgba(28,26,23,.6)', maxW: w - 150 * u });
  btn(x + w - 128 * u, y + 12 * u, 116 * u, 32 * u, sideToggleLabel(on), onSideToggle, { disabled: !state, ghost: !on });
  return 64;
}

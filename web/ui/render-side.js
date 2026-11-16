// web/ui/render-side.js：側線玩法介面（微服私訪奇遇覆蓋層、煉丹說明、側線開關）。
// 只呼叫 src/side-events.js 既有 API（含唯讀的 alchemyStatus），不在此直接寫入 state。
import { ALCHEMY_COST, alchemyStatus, pendingEncounter, resolveEncounter, sideEventsEnabled, setSideEventsEnabled } from '../../src/side-events.js';
import { PREFECTURE_DEFS } from '../../src/economy.js';
import { U } from './store.js';
import { esc } from './util.js';
import { openDialog } from './dialog.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';

const EFFECT_NAME = {
  morale: '所至府民心', benevolence: '仁德', prestige: '威儀', literature: '文學',
  military: '兵力', treasury: '國庫', health: '健康', charm: '聲色',
};

import { SOOTHE_COST } from '../../src/encounter-data.js';

const ALCHEMY_REASON = {
  disabled: '側線已關閉，無從煉丹。',
  cooldown: '本月已煉過丹，每月至多一次。',
  treasury: `國庫不足，煉丹需耗國庫 ${ALCHEMY_COST}。`,
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

const ENCOUNTER_REASON = {
  none: '此事已了。',
  no_choice: '無此抉擇。',
  treasury: `國庫不足，安撫需耗國庫 ${SOOTHE_COST}。`,
  no_prefecture: '所至州府已不可查。',
};

// 奇遇覆蓋層的 HTML（純函式）。有抉擇者列出嚴懲與安撫；舊式奇遇（無抉擇）僅「知道了」。
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

// 顯示奇遇覆蓋層；抉擇於此裁決（經 side-events.js resolveEncounter），點背景關閉則待決保留。
export function showEncounter(enc, placeName) {
  openDialog({
    html: encounterHtml(enc, placeName),
    initialFocus: enc.choices ? '[data-dlg="soothe"]' : '[data-dlg="ok"]',
    onClick: (e, close) => {
      const key = e.target.closest?.('[data-dlg]')?.dataset.dlg;
      if (key === 'punish' || key === 'soothe') {
        const r = resolveEncounter(U.state, key);
        if (!r.ok) {
          const msg = e.target.closest('.dlg')?.querySelector('[data-dlg-msg]');
          if (msg) msg.textContent = ENCOUNTER_REASON[r.reason] ?? '此舉未成。';
          return;
        }
        U.feedback = `${r.title}：${r.text}`;
        close();
        save();
        render();
        return;
      }
      if (key === 'ok' || e.target === close.el) close();
    },
  });
}

// 待決奇遇於重新載入或他處打開後仍須裁決：若尚無覆蓋層開啟，則重新顯示。
export function paintPendingEncounter() {
  if (typeof document === 'undefined' || !U.state) return;
  const enc = pendingEncounter(U.state);
  if (!enc || document.querySelector('.dlg-ov')) return;
  const name = PREFECTURE_DEFS.find((d) => d.id === enc.prefectureId)?.name ?? '';
  showEncounter(enc, name);
}

// 側線開關按鈕文字與狀態。未開局時以預設（開啟）顯示並停用。
export function sideToggleLabel(on) {
  return `側線奇遇：${on ? '開' : '關'}`;
}

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

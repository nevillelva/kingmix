// web/ui/render-facility.js：宮內設施（Canvas）。顯示御花園、太醫院、翰林院、武庫、藏書閣之等級、下一級費用與效果，並可興建。
import { FACILITIES, FACILITY_IDS, FACILITY_MAX_LEVEL, buildFacility, constructionOf, facilityCost, facilityLevels } from '../../src/facilities.js';
import { STAT } from './labels.js';
import { U } from './store.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { C, registerScreen, setScreen } from './canvas/core.js';
import { tx, btn, pnl } from './canvas/bfx.js';
import { RED } from './canvas/theme.js';

const ERR_TEXT = {
  insufficient_treasury: '國庫不足，無法營造。',
  max_level: '此設施已至最高級。',
  unknown_facility: '查無此設施。',
  in_progress: '此設施正在興建，待工成再議。',
};

// 效果文字：目前等級的每月加成，以及下一級的每月加成（純函式）。
export function effectText(def, level) {
  const label = STAT[def.stat].l;
  const cur = level > 0 ? `目前每月 ${label} +${def.levels[level - 1].monthly}` : '目前尚無效果';
  const next = level < FACILITY_MAX_LEVEL ? `下一級每月 ${label} +${def.levels[level].monthly}` : '已達最高級';
  return { cur, next };
}

// 每座設施的卡片資料（純函式，不改 state）。
export function facilityCards(state) {
  const levels = facilityLevels(state);
  const treasury = Math.round(state.stats.treasury);
  return FACILITY_IDS.map((id) => {
    const def = FACILITIES[id];
    const level = levels[id];
    const { cur, next } = effectText(def, level);
    const maxed = level >= FACILITY_MAX_LEVEL;
    const job = constructionOf(state)[id];
    const cost = maxed ? null : facilityCost(state, def, level);
    return { id, name: def.name, level, cur, next, maxed, job, cost, can: !maxed && !job && treasury >= cost };
  });
}

// 興建：buildFacility 回傳 { state, ok, reason }。成功時回傳新狀態並開工，工期滿後由每月推進寫入新等級。
export function buildAct(id) {
  const res = buildFacility(U.state, id);
  if (!res.ok) { U.feedback = ERR_TEXT[res.reason] ?? '無法營造。'; render(); return false; }
  U.state = res.state;
  U.feedback = `${FACILITIES[id].name}已開工興建。`;
  save();
  render();
  return true;
}

export function drawFacilityScreen() {
  const g = C.ctx;
  if (!g || !U.state) return;
  const u = C.U;
  const W = C.W, y0 = C.content.y;
  const pad = 16 * u;
  const treasury = Math.round(U.state.stats.treasury);
  pnl(pad, y0 + 10 * u, W - pad * 2, 74 * u, { fill: 'rgba(255,250,236,.7)' });
  tx('宮內設施', pad + 14 * u, y0 + 20 * u, 20, { weight: 'bold' });
  tx(`國庫現有 ${treasury}。設施一經建成，每月為所屬屬性增益。`, pad + 14 * u, y0 + 48 * u, 13, { color: 'rgba(28,26,23,.6)', maxW: W - pad * 2 - 28 * u });
  if (U.feedback) tx(U.feedback, pad + 14 * u, y0 + 68 * u, 13, { color: RED, maxW: W - pad * 2 - 28 * u });

  const cards = facilityCards(U.state);
  const cols = W > 640 * u ? 2 : 1;
  const cw = (W - pad * 2 - (cols - 1) * 12 * u) / cols;
  const top = y0 + 100 * u;
  cards.forEach((c, i) => {
    const x = pad + (i % cols) * (cw + 12 * u), y = top + Math.floor(i / cols) * 130 * u;
    pnl(x, y, cw, 118 * u, { fill: 'rgba(255,250,236,.92)' });
    tx(c.name, x + 14 * u, y + 10 * u, 12, { color: 'rgba(28,26,23,.6)' });
    tx(`${c.name}　第 ${c.level} 級 / ${FACILITY_MAX_LEVEL}`, x + 14 * u, y + 28 * u, 17, { weight: 'bold', maxW: cw - 28 * u });
    tx(c.cur, x + 14 * u, y + 56 * u, 13, { color: 'rgba(28,26,23,.6)', maxW: cw - 28 * u });
    tx(c.next, x + 14 * u, y + 74 * u, 13, { color: 'rgba(28,26,23,.6)', maxW: cw - 28 * u });
    const label = c.maxed ? '已至最高級' : c.job ? `興建中，尚餘 ${c.job.monthsLeft} 月` : `興建（國庫 ${c.cost}）`;
    btn(x + 14 * u, y + 92 * u, cw - 28 * u, 30 * u, label, () => buildAct(c.id), { disabled: !c.can, why: c.maxed ? '已至最高級' : c.job ? '此設施正在興建' : `國庫不足（需 ${c.cost}）` });
  });
  C.contentH = top + Math.ceil(cards.length / cols) * 130 * u - y0;
}

// 導覽：由宮城空地或底部鈕進入設施頁。
export function renderFacility() {
  setScreen('facility');
}

registerScreen('facility', drawFacilityScreen);

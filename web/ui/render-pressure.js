// web/ui/render-pressure.js：後期壓力（割據、權臣、天災）的顯示文字。只讀取引擎狀態，不修改任何資料。
import { prefectureLatePressure, courtMinisterStatus } from '../../src/late-pressure.js';
import { BALANCED_EFFICIENCY, FACTION_FORCE_THRESHOLD, FACTION_POLICY, FORCE_MONTHS, factionsBalanced, forcingFaction, strongFactionCount } from '../../src/factions.js';
import { POLICIES } from '../../src/policy.js';
import { FAC } from './labels.js';

// 單府的一行摘要：割據、離心與天災紀錄。府不存在時回傳空字串。
export function prefecturePressureText(state, prefId) {
  const s = prefectureLatePressure(state, prefId);
  if (!s) return '';
  let status;
  if (s.autonomous) status = `割據中，已 ${s.autonomyMonths} 月，歸順尚餘 ${s.autonomyLeft} 月`;
  else if (s.defiantMonths > 0) status = `離心 ${s.defiantMonths} / ${s.defiantLimit} 月`;
  else status = '安穩';
  const disaster = s.lastDisaster
    ? `天災 ${s.disasterCount} 起，最近於 ${s.lastDisaster.year} 年 ${s.lastDisaster.month} 月`
    : '天災 無';
  return `${status}　${disaster}`;
}

// 朝堂權臣一行摘要：在朝者的人與派系勢力，或尚無權臣時的累積月數。
export function courtMinisterText(state) {
  const s = courtMinisterStatus(state);
  if (s.present) {
    return `權臣在朝：${s.name}（${FAC(s.faction).l}），所屬派系勢力 ${s.factionPower}，派系跌破 ${s.endBelow} 即失勢。`;
  }
  const top = s.strongest ? `${FAC(s.strongest.faction).l}勢 ${s.strongest.power}` : '—';
  return `朝中無權臣。最強派系 ${top}，高於 ${s.watchThreshold} 已 ${s.watchMonths} / ${s.watchLimit} 月。`;
}

// 派系壓力的說明行（原 render-court.js 的 pressureLine，改為純文字陣列，供 Canvas 版排版）。傳入 state，本模組不依賴 store。
export function pressureLines(state) {
  const p = state.factionPressure || {};
  const parts = [];
  const fc = forcingFaction(state.factions);
  if (fc) {
    const pol = POLICIES[FACTION_POLICY[fc]];
    parts.push(`${FAC(fc).l}勢過 ${FACTION_FORCE_THRESHOLD}，已持續 ${p.forcedMonths || 0} / ${FORCE_MONTHS} 月${pol ? `，將逼迫國策改為「${pol.name}」` : ''}。`);
  }
  if (strongFactionCount(state.factions) === 3) parts.push('三派並立：官員忠誠每月流失。');
  if (factionsBalanced(state.factions)) parts.push(`三派均衡：行政效率 ${BALANCED_EFFICIENCY}，稅制增減打折。`);
  const last = (p.forcedPolicies || []).slice(-1)[0];
  if (last) parts.push(`近例：${FAC(last.faction).l}逼迫，國策由「${POLICIES[last.from]?.name || '—'}」改為「${POLICIES[last.to]?.name || '—'}」。`);
  return parts;
}

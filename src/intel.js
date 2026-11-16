// 密折制度（A）：把既有倒數計數器轉為預警，經「管道」呈報給玩家。
//
// - intelReports(state) 為純讀取：掃描後期壓力與鄰國壓力，產生預警清單，不改動 state、不呼叫 rng、不呼叫 ensure*。
// - 管道：東廠有運作中的案件，或該預警領域有相得臣子在任（能力達 INTEL_ABILITY_MIN），才看得到預警；無管道則不出現。
// - prepareIntel(state) 於月初（month-start.js prepareMonth）呼叫：寫入 state.intel.seen 記錄已呈報者，同一預警不重複呈報；
//   預警條件消失即自 seen 移除，之後再次成立視為新一段預警。同月冪等（以 state.intel.monthKey 判斷）。
// - 預警僅為情報，不改變任何數值；不消耗亂數，與 rng 流完全無關。

import { DEFIANT_MONTHS, MINISTER_MONTHS, DISASTER_DEFENSE_BELOW, DISASTER_MORALE_BELOW } from './late-pressure.js';
import { NEIGHBORS } from './diplomacy.js';
import { PREFECTURE_DEFS } from './economy.js';
import { isBonded } from './bonds.js';
import { isCourtOfficial } from './officials.js';

export const INTEL_LEAD = 3; // 距門檻幾個月內開始預警
export const INTEL_ABILITY_MIN = 50; // 相得臣子於該領域的能力須達此值，方能作為管道
export const INTEL_WAR_PRESSURE = 0.8; // 鄰國開戰壓力達此值，預警「將犯」

// 各預警所屬領域（以官員能力鍵表示）。
export const INTEL_DOMAIN = Object.freeze({
  defiant: 'politics',
  minister: 'intellect',
  war: 'martial',
  unrest: 'command',
});

const prefName = (id) => PREFECTURE_DEFS.find((d) => d.id === id)?.name ?? id;
const neighborName = (id) => NEIGHBORS.find((n) => n.id === id)?.name ?? id;

// 鄰國壓力的純讀取版本：不呼叫 diplomacyOf（其會寫入 state.diplomacy）；缺漏時以鄰國預設值計。
function pressureOf(state, n) {
  const d = state.diplomacy?.[n.id];
  const attitude = d?.attitude ?? n.attitude;
  if (d?.allied) return 0;
  const base = (100 - attitude) / 100;
  return (d?.kin ?? 0) > 0 ? base * 0.5 : base;
}

// 純讀取：回傳目前成立的預警清單 [{ key, kind, domain, text }]。
export function intelReports(state) {
  const out = [];
  const lp = state.latePressure || {};

  for (const pref of state.prefectures || []) {
    if (!pref.autonomous && (pref.defiantMonths || 0) >= DEFIANT_MONTHS - INTEL_LEAD && (pref.defiantMonths || 0) < DEFIANT_MONTHS) {
      out.push({ key: `defiant:${pref.id}`, kind: 'defiant', domain: INTEL_DOMAIN.defiant, text: `${prefName(pref.id)}將割據` });
    }
    if (!pref.autonomous && (pref.morale ?? 100) < DISASTER_MORALE_BELOW && (pref.defense ?? 100) < DISASTER_DEFENSE_BELOW) {
      out.push({ key: `unrest:${pref.id}`, kind: 'unrest', domain: INTEL_DOMAIN.unrest, text: `${prefName(pref.id)}恐將叛亂` });
    }
  }

  if (!lp.minister && (lp.ministerMonths || 0) >= MINISTER_MONTHS - INTEL_LEAD) {
    out.push({ key: 'minister', kind: 'minister', domain: INTEL_DOMAIN.minister, text: '權臣將出現' });
  }

  for (const n of NEIGHBORS) {
    if (pressureOf(state, n) >= INTEL_WAR_PRESSURE && !(state.campaign && state.campaign.status === 'active' && state.campaign.neighborId === n.id)) {
      out.push({ key: `war:${n.id}`, kind: 'war', domain: INTEL_DOMAIN.war, text: `${neighborName(n.id)}將犯` });
    }
  }

  return out.filter((r) => hasChannel(state, r.domain));
}

// 管道：東廠有運作中案件，或該領域有相得臣子在任。純讀取。
export function hasChannel(state, domain) {
  const cases = state.dongchang?.cases || [];
  if (cases.some((c) => c.status !== 'closed')) return true;
  return (state.officials || []).some(
    (o) => isCourtOfficial(o) && isBonded(state, o.id) && (o.abilities?.[domain] ?? 0) >= INTEL_ABILITY_MIN,
  );
}

// 月初準備：寫入 state.intel（seen、monthKey、reports）。同月重複呼叫不重算。回傳 state.intel。
export function prepareIntel(state) {
  const key = `${state.year}-${state.month}`;
  if (!state.intel || typeof state.intel !== 'object') state.intel = {};
  const intel = state.intel;
  if (intel.monthKey === key) return intel;
  const seen = intel.seen && typeof intel.seen === 'object' ? intel.seen : {};
  const active = intelReports(state);
  const activeKeys = new Set(active.map((r) => r.key));
  for (const k of Object.keys(seen)) if (!activeKeys.has(k)) delete seen[k];
  const fresh = active.filter((r) => !seen[r.key]);
  for (const r of fresh) seen[r.key] = { year: state.year, month: state.month };
  intel.seen = seen;
  intel.monthKey = key;
  intel.reports = fresh;
  return intel;
}

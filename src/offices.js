// 官職需求與任命。需求取自 docs/specs/offices.md。
// 不達標仍可任命（保留玩家選擇權），但會記錄 unfit_office 警告。

import { unmetRequirements } from './officials.js';
import { PREFECTURE_DEFS, prefectOfficeKey } from './economy.js';

// 六府知府各為一個官職（prefect:<州府 id>），任免方式與其他官職相同。
const PREFECT_OFFICES = Object.fromEntries(
  PREFECTURE_DEFS.map((def) => [prefectOfficeKey(def.id), { name: `${def.name}知府`, requires: { intellect: 60, politics: 60, virtue: 60 } }]),
);

export const OFFICES = {
  chancellor: { name: '丞相', requires: { intellect: 60, politics: 60, loyalty: 80 } },
  revenue: { name: '戶部尚書', requires: { intellect: 60, politics: 60, virtue: 60 } },
  works: { name: '工部尚書', requires: { intellect: 60 } },
  war: { name: '兵部尚書', requires: { intellect: 60 } },
  tutor: { name: '太傅', requires: { intellect: 60, martial: 40, virtue: 60 } },
  ...PREFECT_OFFICES,
};

export function officeHolder(state, key) {
  return state.officials.find((o) => o.office === key) ?? null;
}

export function assignOffice(state, officialId, officeKey) {
  const office = OFFICES[officeKey];
  if (!office) throw new Error(`unknown office: ${officeKey}`);
  const official = state.officials.find((o) => o.id === officialId);
  if (!official) throw new Error(`unknown official: ${officialId}`);

  // 同一官職只能有一人；舊任者卸任
  const previous = officeHolder(state, officeKey);
  if (previous) previous.office = null;
  // 一人只能任一職；原職空出
  official.office = officeKey;

  const gaps = unmetRequirements(official, office.requires);
  if (gaps.length) {
    state.warnings.push({ turn: state.turn, key: officeKey, reason: 'unfit_office', gaps });
  }
  return gaps;
}

// 最適任建議：回傳在能力總和上最符合該職需求的未任官員（忠誠不足者不列入）
export function suggestCandidate(state, officeKey) {
  const office = OFFICES[officeKey];
  if (!office) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const o of state.officials) {
    if (o.office) continue;
    const score = Object.entries(office.requires)
      .filter(([k]) => k !== 'loyalty')
      .reduce((sum, [k, need]) => sum + Math.min(0, o.abilities[k] - need) + o.abilities[k] / 100, 0)
      + (o.loyalty >= 60 ? 0 : -100);
    if (score > bestScore || (score === bestScore && best && o.id < best.id)) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}

// 手動免職：空出官職，回傳原任者（無人任職則為 null）。空缺可由月末吏部自動補任（見 sim.js autoAppoint）。
export function dismissOffice(state, officeKey) {
  if (!OFFICES[officeKey]) throw new Error(`unknown office: ${officeKey}`);
  const holder = officeHolder(state, officeKey);
  if (holder) holder.office = null;
  return holder;
}

// 某人若任此官職，未達標的需求清單（空陣列即達標）。
export function officeFit(official, officeKey) {
  const office = OFFICES[officeKey];
  if (!office) throw new Error(`unknown office: ${officeKey}`);
  return unmetRequirements(official, office.requires);
}

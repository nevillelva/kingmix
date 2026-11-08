// 官職需求與任命。需求取自 docs/specs/offices.md。
// 不達標仍可任命（保留玩家選擇權），但會記錄 unfit_office 警告。

import { unmetRequirements } from './officials.js';

export const OFFICES = {
  chancellor: { name: '丞相', requires: { intellect: 60, politics: 60, loyalty: 80 } },
  revenue: { name: '戶部尚書', requires: { intellect: 60, politics: 60, virtue: 60 } },
  works: { name: '工部尚書', requires: { intellect: 60 } },
  war: { name: '兵部尚書', requires: { intellect: 60 } },
  prefect: { name: '知府', requires: { intellect: 60, politics: 60, virtue: 60 } },
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

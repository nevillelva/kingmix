// 東廠：調查官員 → 得到把柄 → 處置（銷毀警告 / 當場問罪 / 天牢）。
// 數值為 Phase 2 暫定值，見 docs/specs/phase2-court.md。

import { setStat } from './state.js';

export const DC_ACTIONS = ['warn', 'punish', 'prison'];

export function openInvestigation(state, officialId) {
  const dc = state.dongchang;
  const active = dc.cases.some((c) => c.officialId === officialId && c.status !== 'closed');
  if (active) return null;
  const c = {
    id: `DC${dc.nextId}`,
    officialId,
    startedTurn: state.turn,
    status: 'investigating', // investigating → leverage → closed；prison 路徑：leverage → imprisoned → …
    level: 0,
    outcome: null,
  };
  dc.nextId += 1;
  dc.cases.push(c);
  return c;
}

export function openInvestigationOnLowest(state) {
  let target = null;
  for (const o of state.officials) if (!target || o.loyalty < target.loyalty) target = o;
  return target ? openInvestigation(state, target.id) : null;
}

// 每月結算：調查成功機率隨權術上升；天牢有機會逼出供詞。
export function tickDongchang(state, rng) {
  for (const c of state.dongchang.cases) {
    if (c.status === 'investigating' && c.startedTurn < state.turn) {
      if (rng() < 0.5 + state.stats.power / 1000) {
        c.status = 'leverage';
        c.level = 1 + Math.floor(rng() * 3);
      } else {
        c.status = 'closed';
        c.outcome = 'no_evidence';
      }
    } else if (c.status === 'imprisoned' && c.imprisonedTurn < state.turn) {
      if (rng() < 0.5 && c.level < 5) {
        c.status = 'leverage';
        c.level += 1;
      } else {
        c.status = 'closed';
        c.outcome = 'no_confession';
      }
    }
  }
}

export function applyDongchangAction(state, caseId, action) {
  const c = state.dongchang.cases.find((x) => x.id === caseId);
  if (!c || c.status !== 'leverage') throw new Error(`case not pending: ${caseId}`);
  const official = state.officials.find((o) => o.id === c.officialId);

  if (action === 'warn') {
    if (official) {
      official.ambition = Math.max(0, official.ambition - 10);
      official.loyalty = Math.min(100, official.loyalty + 10);
    }
    setStat(state, 'treasury', state.stats.treasury + c.level * 10);
    c.status = 'closed';
    c.outcome = 'warned';
  } else if (action === 'punish') {
    if (official) {
      const idx = state.officials.indexOf(official);
      state.officials.splice(idx, 1);
      if (official.office) official.office = null;
      state.factions[official.faction] = Math.max(0, state.factions[official.faction] - 2);
      setStat(state, 'treasury', state.stats.treasury + c.level * 25 + Math.round((100 - official.abilities.virtue) / 4));
    }
    setStat(state, 'prestige', state.stats.prestige + 5);
    c.status = 'closed';
    c.outcome = 'punished';
  } else if (action === 'prison') {
    if (official) official.loyalty = Math.max(0, official.loyalty - 20);
    c.status = 'imprisoned';
    c.imprisonedTurn = state.turn;
    c.outcome = 'imprisoned';
  } else {
    throw new Error(`unknown dongchang action: ${action}`);
  }
  return c;
}

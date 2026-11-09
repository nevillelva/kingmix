// 東廠：調查官員 → 得到把柄 → 處置（銷毀警告 / 當場問罪 / 天牢）。
// 數值為 Phase 2 暫定值，見 docs/specs/phase2-court.md。

import { setStat } from './state.js';

export const DC_ACTIONS = ['warn', 'punish', 'prison'];
export const MAX_ACTIVE_CASES = 2; // 東廠同時最多進行的案件數（未結案者皆計入）
export const TYRANNY_GAIN = Object.freeze({ punish: 4, prison: 3 }); // 責罰、下獄累積暴政
export const TYRANNY_MAX = 100;
export const TYRANNY_QINGLIU_THRESHOLD = 30; // 暴政達此值，清流好感每月下降
export const TYRANNY_QINGLIU_DRAIN = 1;

export function activeCaseCount(state) {
  return state.dongchang.cases.filter((c) => c.status !== 'closed').length;
}

export function addTyranny(state, amount) {
  const v = Math.min(TYRANNY_MAX, Math.max(0, (state.tyranny || 0) + amount));
  state.tyranny = Math.round(v * 100) / 100;
  return state.tyranny;
}

// 每月結算：暴政過高時清流好感下降（月結，不另外觸發）。
export function applyTyrannyDrift(state) {
  if ((state.tyranny || 0) >= TYRANNY_QINGLIU_THRESHOLD) {
    state.factions.qingliu = Math.max(0, state.factions.qingliu - TYRANNY_QINGLIU_DRAIN);
  }
  return state;
}

export function openInvestigation(state, officialId) {
  const dc = state.dongchang;
  const active = dc.cases.some((c) => c.officialId === officialId && c.status !== 'closed');
  if (active) return null;
  if (activeCaseCount(state) >= MAX_ACTIVE_CASES) return null;
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
    addTyranny(state, TYRANNY_GAIN.punish);
    c.status = 'closed';
    c.outcome = 'punished';
  } else if (action === 'prison') {
    if (official) official.loyalty = Math.max(0, official.loyalty - 20);
    c.status = 'imprisoned';
    c.imprisonedTurn = state.turn;
    c.outcome = 'imprisoned';
    addTyranny(state, TYRANNY_GAIN.prison);
  } else {
    throw new Error(`unknown dongchang action: ${action}`);
  }
  return c;
}

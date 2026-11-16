// 開局狀態建立（與 sim.js 的順序一致）：出身於月初準備（prepareMonth）之前套用，
// 使首月奏摺池即含出身專屬事件（寒門崛起等）。網頁 newGame 與測試共用此函式。
//
// 順序：開局狀態 → 出身 → 接位政策 → 祖訓 → 臣子關係 → 相得之臣 → 開局策卡。
// 回傳 { state, notes }；notes 為非致命的降級提示（scenario / edicts / deck），由呼叫端決定訊息。

import { createScenarioState } from './scenarios.js';
import { createInitialState } from './state.js';
import { DEFAULT_MODE, MODES } from './mode.js';
import { applyOrigin } from './origin.js';
import { applyEdictsUnchecked } from './edicts.js';
import { seedRelations } from './relations.js';
import { seedBondedCourtOfficial } from './bonds.js';
import { setAccessionPolicies } from './policy.js';
import { setOpeningDeck } from './cards.js';

export function buildNewGame({ seed, scenId, era, policies, modeKey, deckIds, edicts, origin }) {
  const list = policies && policies.length ? policies : ['agrarian'];
  const opts = { policy: list[0], era, mode: MODES[modeKey] ? modeKey : DEFAULT_MODE };
  const notes = [];
  let state;
  try {
    state = scenId ? createScenarioState(seed, scenId, opts) : createInitialState(seed, opts);
  } catch (e) {
    state = createInitialState(seed, opts);
    notes.push('scenario');
  }
  if (origin) applyOrigin(state, origin);
  setAccessionPolicies(state, list);
  if (Array.isArray(edicts) && edicts.length) {
    try { applyEdictsUnchecked(state, edicts); } catch (e) { notes.push('edicts'); }
  }
  seedRelations(state);
  seedBondedCourtOfficial(state);
  if (Array.isArray(deckIds) && deckIds.length) {
    try { setOpeningDeck(state, deckIds); } catch (e) { notes.push('deck'); }
  }
  return { state, notes };
}

// 月結流程的單一入口：網頁（game-flow.js 的 finishMonth／ffAdvanceMonth）與無頭模擬（sim.js）共用。
// 順序：monthlyDrift → monthlyTick → 季度快照（opts.onBeforeAdvance）→ advanceMonth → 史冊年末紀錄 → autoAppoint → tryAccession。
// 季度快照位於 web/ui/render-court.js，引擎不得匯入，故以回呼傳入。

import { monthlyDrift } from './diplomacy.js';
import { monthlyTick, advanceMonth } from './turn.js';
import { autoAppoint } from './selection.js';
import { tryAccession } from './succession.js';
import { evaluateScenario } from './scenarios.js';
import { makeRng } from './rng.js';
import { pushCapped, WARNINGS_CAP } from './caps.js';

// 結算一個月。opts：
//   tickRng           月結 rng（省略時為 [seed, year, month, 'tick']，與無頭模擬一致）
//   onBeforeAdvance   於 advanceMonth 之前呼叫一次（網頁用於季度快照，此時 state.month 仍為剛結束之月）
//   withAnnals        是否寫入史冊年末紀錄（網頁為 true，預設 true）
export function endOfMonth(state, opts = {}) {
  const { year, month } = state;
  const endingYear = month === 12 ? year : null;

  try {
    monthlyDrift(state, year, month); // 鄰國好感月度漂移（外交）
  } catch (e) {
    // 漂移失敗不中止月結，但留下紀錄，避免模擬靜默吞錯。
    pushCapped(state.warnings, { turn: state.turn, key: 'diplomacy', reason: 'drift_error', message: String(e?.message ?? e) }, WARNINGS_CAP);
  }
  monthlyTick(state, opts.tickRng ?? makeRng([state.seed, year, month, 'tick']));
  opts.onBeforeAdvance?.(state);
  advanceMonth(state);
  if (state.scenario) {
    try { evaluateScenario(state); } catch (e) { /* 劇本評價失敗不影響月結 */ }
  }

  if (opts.withAnnals !== false && endingYear !== null && state.alive) {
    state.annals = state.annals || [];
    state.annals.push({
      year: endingYear, generation: state.dynasty.generation,
      treasury: Math.round(state.stats.treasury), people: Math.round(state.stats.people),
      military: Math.round(state.stats.military), agriculture: Math.round(state.stats.agriculture),
      wars: state.wars.length, wins: state.wars.filter((w) => w.won).length,
      officials: state.officials.length, consorts: (state.consorts || []).length,
      dc: state.dongchang.cases.filter((c) => c.status !== 'closed').length,
    });
  }

  autoAppoint(state);
  // 短局終局不經繼位（見 turn.js advanceMonth）；其餘駕崩或禪位皆嘗試繼位。
  if (!state.alive && state.endReason !== 'short_end') tryAccession(state);
  return state;
}

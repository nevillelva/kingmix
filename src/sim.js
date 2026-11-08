// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。
// 東廠有待處置的把柄時，該月的奏摺改為「東廠密報」。

import { createInitialState } from './state.js';
import { isEligible, isAvailable } from './events.js';
import { makeRng } from './rng.js';
import { applyOption, monthlyTick, advanceMonth } from './turn.js';
import { applyDongchangAction, DC_ACTIONS } from './dongchang.js';
import { assignOffice, suggestCandidate } from './offices.js';
import { tryAccession } from './succession.js';
import { evaluateDynasty } from './ending.js';
import { unmetRequirements } from './officials.js';
import { OFFICES } from './offices.js';

const AUTO_OFFICES = ['chancellor', 'revenue', 'works', 'war', 'tutor'];

// 吏部最適任建議：僅在候選人完全達標時自動任命，避免強迫不合格者上任。
export function autoAppoint(state) {
  for (const key of AUTO_OFFICES) {
    const holder = state.officials.find((o) => o.office === key);
    if (holder) continue;
    const candidate = suggestCandidate(state, key);
    if (candidate && unmetRequirements(candidate, OFFICES[key].requires).length === 0) {
      assignOffice(state, candidate.id, key);
    }
  }
}

// 從所有符合條件的事件中，以種子隨機挑一則；避免清單前段事件長期壟斷。
export function pickEvent(state, events, rng) {
  const eligible = events.filter((e) => isAvailable(e) && isEligible(state, e, rng));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

export function runSimulation({ seed, months, events, policy = 'agrarian' }) {
  const state = createInitialState(seed, { policy });
  const triggered = {};
  const log = [];
  const bump = (id) => { triggered[id] = (triggered[id] || 0) + 1; };

  for (let i = 0; i < months; i++) {
    if (!state.alive) {
      if (!tryAccession(state)) break;
    }
    const { year, month } = state;
    autoAppoint(state);
    const pending = state.dongchang.cases.find((c) => c.status === 'leverage');

    if (pending) {
      const pick = makeRng([seed, year, month, 'dongchang'])();
      const action = DC_ACTIONS[Math.floor(pick * DC_ACTIONS.length)];
      applyDongchangAction(state, pending.id, action);
      bump('DC');
      log.push({ year, month, event: 'DC', case: pending.id, option: action });
    } else {
      const rng = makeRng([seed, year, month, 'events']);
      const event = pickEvent(state, events, rng);
      if (event) {
        const options = event.options.filter(isAvailable);
        const pick = makeRng([seed, year, month, 'choice'])();
        const option = options[Math.floor(pick * options.length)];
        applyOption(state, option, makeRng([seed, year, month, 'recruit']));
        bump(event.id);
        log.push({ year, month, event: event.id, option: option.key });
      }
    }

    monthlyTick(state, makeRng([seed, year, month, 'tick']));
    advanceMonth(state);
  }

  return {
    seed,
    year: state.year,
    month: state.month,
    age: state.age,
    alive: state.alive,
    endReason: state.endReason,
    stats: state.stats,
    officials: state.officials.map((o) => ({ id: o.id, loyalty: o.loyalty, office: o.office, faction: o.faction })),
    factions: state.factions,
    dongchang: { open: state.dongchang.cases.filter((c) => c.status !== 'closed').length, total: state.dongchang.cases.length },
    triggered,
    policy: state.policy,
    generation: state.dynasty.generation,
    dynastyEnded: state.dynasty.ended,
    consorts: state.consorts.length,
    heirs: state.heirs.map((h) => ({ id: h.id, gender: h.gender, age: h.age })),
    chronicle: state.chronicle,
    ending: evaluateDynasty(state),
    wars: state.wars,
    warningCount: state.warnings.length,
    warningBreakdown: state.warnings.reduce((acc, w) => { const k = `${w.key}:${w.reason}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    log,
  };
}

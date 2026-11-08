// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。
// 東廠有待處置的把柄時，該月的奏摺改為「東廠密報」。

import { createInitialState } from './state.js';
import { isEligible, isAvailable } from './events.js';
import { makeRng } from './rng.js';
import { applyOption, monthlyTick, advanceMonth } from './turn.js';
import { applyDongchangAction, DC_ACTIONS } from './dongchang.js';

export function pickEvent(state, events, rng) {
  for (const event of events) {
    if (!isAvailable(event)) continue;
    if (isEligible(state, event, rng)) return event;
  }
  return null;
}

export function runSimulation({ seed, months, events, policy = 'agrarian' }) {
  const state = createInitialState(seed, { policy });
  const triggered = {};
  const log = [];
  const bump = (id) => { triggered[id] = (triggered[id] || 0) + 1; };

  for (let i = 0; i < months && state.alive; i++) {
    const { year, month } = state;
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
    wars: state.wars,
    warningCount: state.warnings.length,
    log,
  };
}

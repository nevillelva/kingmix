// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。

import { createInitialState } from './state.js';
import { isEligible, isAvailable } from './events.js';
import { makeRng } from './rng.js';
import { applyOption, monthlyTick, advanceMonth } from './turn.js';

export function pickEvent(state, events, rng) {
  for (const event of events) {
    if (!isAvailable(event)) continue;
    if (isEligible(state, event, rng)) return event;
  }
  return null;
}

export function runSimulation({ seed, months, events }) {
  const state = createInitialState(seed);
  const triggered = {};
  const log = [];

  for (let i = 0; i < months && state.alive; i++) {
    const { year, month } = state;
    const rng = makeRng([seed, year, month, 'events']);
    const event = pickEvent(state, events, rng);
    if (event) {
      const options = event.options.filter(isAvailable);
      const pick = makeRng([seed, year, month, 'choice'])();
      const option = options[Math.floor(pick * options.length)];
      applyOption(state, option);
      triggered[event.id] = (triggered[event.id] || 0) + 1;
      log.push({ year, month, event: event.id, option: option.key });
    }
    monthlyTick(state);
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
    triggered,
    warningCount: state.warnings.length,
    log,
  };
}

// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。
// 東廠有待處置的把柄時，該月的奏摺改為「東廠密報」。

import { createInitialState } from './state.js';
import { isEligible, isAvailable, eventAllowed, recordEvent, EVENT_MAX_PER_RUN } from './events.js';
import { makeRng } from './rng.js';
import { applyOption, afterOption, monthlyTick, advanceMonth } from './turn.js';
import { takeChain } from './chains.js';
import { createScenarioState, evaluateScenario, SCENARIOS } from './scenarios.js';
import { applyDongchangAction, DC_ACTIONS } from './dongchang.js';
import { assignOffice, suggestCandidate } from './offices.js';
import { tryAccession } from './succession.js';
import { evaluateDynasty } from './ending.js';
import { unmetRequirements } from './officials.js';
import { OFFICES } from './offices.js';

const AUTO_OFFICES = ['chancellor', 'revenue', 'works', 'war', 'tutor'];

// 劇本對外 id（與 scenarios.js 的內部 id 對應）；內部 id 亦接受。
export const SCENARIO_ALIASES = Object.freeze({
  youzhu: 'youth_regency',
  zhongxing: 'restoration',
  shouchengzhi: 'steady',
});

export function resolveScenarioId(id) {
  const internal = SCENARIO_ALIASES[id] ?? id;
  if (!SCENARIOS[internal]) throw new Error(`unknown scenario: ${id}`);
  return internal;
}

// 連鎖事件：不看 when 與冷卻，但仍需可用、未達每局上限。
const findChained = (events, id, state) => {
  const e = events.find((x) => x.id === id);
  if (!e || !isAvailable(e)) return null;
  if ((state.eventHistory?.counts?.[id] || 0) >= EVENT_MAX_PER_RUN) return null;
  return e.options.some(isAvailable) ? e : null;
};

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
// 加權抽選：時序事件（every_years / months）權重 3，避免被大量一般事件稀釋；其餘權重 1。
export function eventWeight(e) {
  const w = e.when || {};
  return ('every_years' in w || 'months' in w) ? 3 : 1;
}

// 被連鎖指向的事件只能經由連鎖觸發，不進入一般隨機抽選。
function chainTargetIds(events) {
  const ids = new Set();
  for (const e of events) for (const o of e.options || []) if (o.effects && o.effects.chain) ids.add(o.effects.chain);
  return ids;
}

export function pickEvent(state, events, rng, exclude = null) {
  const targets = chainTargetIds(events);
  const eligible = events.filter((e) => !targets.has(e.id) && e.id !== exclude && isAvailable(e) && eventAllowed(state, e.id) && isEligible(state, e, rng));
  if (eligible.length === 0) return null;
  const total = eligible.reduce((sum, e) => sum + eventWeight(e), 0);
  let r = rng() * total;
  for (const e of eligible) {
    r -= eventWeight(e);
    if (r < 0) return e;
  }
  return eligible[eligible.length - 1];
}

// 早朝第 2 則奏摺：每月以 50% 機率出現（同一個 rng 先抽機率、再抽事件，確定性）。
// 冷卻與每局上限沿用 pickEvent 的 eventAllowed；exclude 避免與第 1 則重複。
export const SECOND_MEMORIAL_CHANCE = 0.1;
export function pickSecondMemorial(state, events, rng, exclude = null) {
  if (!(rng() < SECOND_MEMORIAL_CHANCE)) return null;
  return pickEvent(state, events, rng, exclude);
}

// scenario 為選用：省略時行為與原本相同（標準開局、回傳不含 scenario 欄位）。
export function runSimulation({ seed, months, events, policy = 'agrarian', scenario }) {
  const state = scenario
    ? createScenarioState(seed, resolveScenarioId(scenario), { policy })
    : createInitialState(seed, { policy });
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
    // 連鎖事件先取出（每月至多一則）；東廠有把柄時該月略過，不補發。
    const chainId = takeChain(state);

    if (pending) {
      const pick = makeRng([seed, year, month, 'dongchang'])();
      const action = DC_ACTIONS[Math.floor(pick * DC_ACTIONS.length)];
      const applied = applyDongchangAction(state, pending.id, action);
      bump('DC');
      const capped = applied.cappedFrom !== undefined;
      log.push({ year, month, event: 'DC', case: pending.id, option: capped ? 'warn' : action, ...(capped ? { requested: action } : {}) });
    } else {
      const chained = chainId ? findChained(events, chainId, state) : null;
      const rng = makeRng([seed, year, month, 'events']);
      const event = chained ?? pickEvent(state, events, rng);
      if (event) {
        const options = event.options.filter(isAvailable);
        const pick = makeRng([seed, year, month, 'choice'])();
        const option = options[Math.floor(pick * options.length)];
        applyOption(state, option, makeRng([seed, year, month, 'recruit']));
        afterOption(state, event, option);
        bump(event.id);
        recordEvent(state, event.id);
        log.push({ year, month, event: event.id, option: option.key, ...(chained ? { chained: true } : {}) });
      }
      // 早朝第 2 則：第 1 則若已記錄，冷卻與上限已生效；此處另以 exclude 排除同一事件。
      const second = pickSecondMemorial(state, events, makeRng([seed, year, month, 'morning2']), event?.id ?? null);
      if (second) {
        const options = second.options.filter(isAvailable);
        const pick = makeRng([seed, year, month, 'morning2', 'choice'])();
        const option = options[Math.floor(pick * options.length)];
        applyOption(state, option, makeRng([seed, year, month, 'morning2', 'recruit']));
        afterOption(state, second, option);
        bump(second.id);
        recordEvent(state, second.id);
        log.push({ year, month, event: second.id, option: option.key, morning2: true });
      }
    }

    monthlyTick(state, makeRng([seed, year, month, 'tick']));
    advanceMonth(state);
  }

  return {
    ...(scenario ? { scenario: evaluateScenario(state) } : {}),
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
    tyranny: state.tyranny,
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

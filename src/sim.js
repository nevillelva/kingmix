// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。
// 東廠有待處置的把柄時，該月的奏摺改為「東廠密報」。

import { createInitialState } from './state.js';
import { isEligible, isAvailable, optionOpen, eventAllowed, recordEvent, EVENT_MAX_PER_RUN, situationMultiplier } from './events.js';
import { makeRng } from './rng.js';
import { autoDecideMemorial } from './autodecide.js';
import { applyOption, afterOption, monthlyTick, advanceMonth } from './turn.js';
import { ORIGINS, applyOrigin } from './origin.js';
import { seedRelations } from './relations.js';
import { PREFECTURES, tourTo } from './tour.js';
import { drawPolicyCards, choosePolicyCard } from './cards.js';
import { takeChain } from './chains.js';
import { createScenarioState, evaluateScenario, SCENARIOS } from './scenarios.js';
import { applyDongchangAction, DC_ACTIONS } from './dongchang.js';
import { assignOffice, suggestCandidate } from './offices.js';
import { tryAccession } from './succession.js';
import { evaluateDynasty } from './ending.js';
import { unmetRequirements } from './officials.js';
import { OFFICES } from './offices.js';
import { autoCampaignStep } from './campaign.js';
import { monthlyDrift } from './diplomacy.js';
import { COLLECTIONS, collectionProgress } from './collections.js';
import { autoRepairCities, ensureCity } from './city.js';
import { PREFECTURE_DEFS, prefectOfficeKey } from './economy.js';
import { DEFAULT_MODE } from './mode.js';

const AUTO_OFFICES = ['chancellor', 'revenue', 'works', 'war', 'tutor', ...PREFECTURE_DEFS.map((d) => prefectOfficeKey(d.id))];

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
  return e.options.some((o) => isAvailable(o) && optionOpen(state, o)) ? e : null;
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
// 處境觸發：傳入 state 時，數值過低的處境會對正向拉升該數值的事件乘上 SITUATION_BOOST（見 events.js）。
export function eventWeight(e, state = null) {
  const w = e.when || {};
  const base = ('every_years' in w || 'months' in w) ? 3 : 1;
  return state ? base * situationMultiplier(state, e) : base;
}

// 抽選公平加權（僅 pickEvent 使用，eventWeight 維持原值；皆為確定性計算，不耗 rng）：
// 1. 狀態觸發事件（條件含數值 / 政策 / 特質等，非純機率或時序）符合條件時加權 STATE_GATED_BOOST，
//    避免被大量機率事件稀釋而餓死。
// 2. 本局已觸發次數越多，權重依 1/(1+n)^FIRED_ALPHA 遞減，讓尚未露面的事件優先被抽中。
// 3. 久未觸發者隨時間累加權重：距上次觸發（或本局開局）每 NEGLECT_MONTHS 個月 +1 倍，最多 +NEGLECT_MAX_BONUS 倍。
export const STATE_GATED_BOOST = 2;
export const FIRED_ALPHA = 2;
export const NEGLECT_MONTHS = 24;
export const NEGLECT_MAX_BONUS = 3;
const NON_STATE_KEYS = new Set(['chance', 'every_years', 'months']);
export function isStateGated(e) {
  return Object.keys(e.when || {}).some((k) => !NON_STATE_KEYS.has(k));
}
// 死諫保底（E420）：本局尚未進諫、且君臣相得的觸發條件已連續成立 PITY_AFTER_MONTHS 個月以上時，
// 權重乘上 PITY_FACTOR，確保每局至少有機會見到死諫（本局上限仍為 EVENT_MAX_PER_RUN）。
// 進諫一次後保底即關閉。以 state.flags.remon_eligible_since（開始成立的月序）記錄連續期間。
export const REMON_EVENT_ID = 'E420';
export const PITY_AFTER_MONTHS = 12;
export const PITY_FACTOR = 40;
const monthIndex = (state) => (state.year - 1) * 12 + (state.month - 1);
export function pityMultiplier(e, state) {
  if (e.id !== REMON_EVENT_ID) return 1;
  if ((state.eventHistory?.counts?.[REMON_EVENT_ID] || 0) > 0) return 1;
  if (state.chronicle?.some((c) => c.kind === 'remonstrance')) return 1;
  const since = state.flags?.remon_eligible_since;
  if (since === undefined) return 1;
  return monthIndex(state) - since >= PITY_AFTER_MONTHS ? PITY_FACTOR : 1;
}
export function pickWeight(e, state) {
  let w = eventWeight(e, state);
  if (isStateGated(e)) w *= STATE_GATED_BOOST;
  const fired = state.eventHistory?.counts?.[e.id] || 0;
  w /= (1 + fired) ** FIRED_ALPHA;
  const now = monthIndex(state);
  const last = state.eventHistory?.last?.[e.id] ?? 0;
  w *= 1 + Math.min((now - last) / NEGLECT_MONTHS, NEGLECT_MAX_BONUS);
  w *= pityMultiplier(e, state);
  return w;
}

// 記錄死諫的連續可觸發月序：每次抽選時更新（不受早朝第 2 則的 exclude 影響）；條件中斷即清除。
function trackRemonEligibility(state, events, rng) {
  const e = events.find((x) => x.id === REMON_EVENT_ID);
  const open = !!e && isAvailable(e) && eventAllowed(state, e.id) && isEligible(state, e, rng);
  state.flags = state.flags || {};
  if (open) state.flags.remon_eligible_since ??= monthIndex(state);
  else delete state.flags.remon_eligible_since;
}

// 被連鎖指向的事件只能經由連鎖觸發，不進入一般隨機抽選。
function chainTargetIds(events) {
  const ids = new Set();
  for (const e of events) for (const o of e.options || []) if (o.effects && o.effects.chain) ids.add(o.effects.chain);
  // 刺殺奏摺只能經由刺殺引擎排入（chain），不進入一般隨機抽選。
  for (const e of events) if (e.kind === 'assassination') ids.add(e.id);
  return ids;
}

export function pickEvent(state, events, rng, exclude = null) {
  const targets = chainTargetIds(events);
  trackRemonEligibility(state, events, rng);
  const eligible = events.filter((e) => !targets.has(e.id) && e.id !== exclude && isAvailable(e) && eventAllowed(state, e.id) && isEligible(state, e, rng));
  if (eligible.length === 0) return null;
  const total = eligible.reduce((sum, e) => sum + pickWeight(e, state), 0);
  let r = rng() * total;
  for (const e of eligible) {
    r -= pickWeight(e, state);
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

// 策略選項：choose 為選用的玩家策略（見 strategy.js）；省略或回傳 null 時走預設種子隨機選擇。
function strategyOption(choose, state, event, seed, year, month) {
  if (!choose) return null;
  const options = event.options.filter((o) => isAvailable(o) && optionOpen(state, o));
  if (options.length === 0) return null;
  return choose(options, { state, event, seed, year, month }) ?? null;
}

// scenario 為選用：省略時行為與原本相同（標準開局、回傳不含 scenario 欄位）。
export function runSimulation({ seed, months, events, policy = 'agrarian', scenario, mode = DEFAULT_MODE, choose, origin }) {
  const state = scenario
    ? createScenarioState(seed, resolveScenarioId(scenario), { policy, mode })
    : createInitialState(seed, { policy, mode });
  applyOrigin(state, origin ?? ORIGINS[Math.floor(makeRng([seed, 'origin'])() * ORIGINS.length)].id); // 出身（預設依 seed 輪替，使四種出身事件皆可達）
  seedRelations(state); // 開局臣子關係網
  const triggered = {};
  const campaignSteps = {};
  const log = [];
  const bump = (id) => { triggered[id] = (triggered[id] || 0) + 1; };

  for (let i = 0; i < months; i++) {
    if (!state.alive) {
      state.campaign = null; // 皇帝駕崩時親征中止（不記入戰績）
      if (state.endReason === 'short_end' || !tryAccession(state)) break; // 短局終局不繼位
    }
    const { year, month } = state;
    autoAppoint(state);
    autoRepairCities(state); // 工部修繕城池：城防偏低且國庫充裕時，每月至多修繕一府
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
        const option = strategyOption(choose, state, event, seed, year, month) ?? autoDecideMemorial(state, event, seed, year, month)?.option;
        applyOption(state, option, makeRng([seed, year, month, 'recruit']));
        afterOption(state, event, option);
        bump(event.id);
        recordEvent(state, event.id);
        log.push({ year, month, event: event.id, option: option.key, ...(chained ? { chained: true } : {}) });
      }
      // 早朝第 2 則：第 1 則若已記錄，冷卻與上限已生效；此處另以 exclude 排除同一事件。
      const second = pickSecondMemorial(state, events, makeRng([seed, year, month, 'morning2']), event?.id ?? null);
      if (second) {
        const options = second.options.filter((o) => isAvailable(o) && optionOpen(state, o));
        const pick = makeRng([seed, year, month, 'morning2', 'choice'])();
        const option = strategyOption(choose, state, second, seed, year, month) ?? options[Math.floor(pick * options.length)];
        applyOption(state, option, makeRng([seed, year, month, 'morning2', 'recruit']));
        afterOption(state, second, option);
        bump(second.id);
        recordEvent(state, second.id);
        log.push({ year, month, event: second.id, option: option.key, morning2: true });
      }
    }

    // 親征：每月自動走一步（與奏摺並行，不改變事件抽選）；當月才開戰者留待下月。
    if (state.campaign?.status === 'active' && state.alive && state.campaign.id !== String(state.turn)) {
      const step = autoCampaignStep(state);
      campaignSteps[step.action] = (campaignSteps[step.action] || 0) + 1;
      log.push({ year, month, event: 'CAMPAIGN', ...step });
    }

    if (month === 1) { // 每年正月：抽卡（模擬以首張自動擇卡）；巡幸依年輪流至六府
      const offer = drawPolicyCards(state, makeRng([seed, year, 'cards']));
      if (offer.length) choosePolicyCard(state, offer[0]);
      tourTo(state, PREFECTURES[year % PREFECTURES.length].id);
    }
    monthlyDrift(state, year, month); // 鄰國好感月度漂移（與 web 的月結相同）
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
    campaignSteps,
    diplomacy: countDiplomacy(state.diplomacyLog),
    // 收藏集齊狀況（稽核用）：每套的件數與是否集齊
    // 州府城防（稽核用）：各府城防與最近修繕年
    prefectures: ensureCity(state).map((p) => ({ id: p.id, defense: Math.round(p.defense), repairedYear: p.repairedYear })),
    // 君臣相得者（稽核用）：解鎖者 id 與其當前忠誠
    bonded: state.officials.filter((o) => state.bonds?.unlocked?.[o.id]).map((o) => ({ id: o.id, loyalty: o.loyalty, prefecture: o.prefecture ?? null })),
    collections: Object.fromEntries(Object.keys(COLLECTIONS).map((id) => [id, collectionProgress(state, id)])),
    warningCount: state.warnings.length,
    warningBreakdown: state.warnings.reduce((acc, w) => { const k = `${w.key}:${w.reason}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    log,
  };
}

// 外交路線統計：各路線成功 / 嘗試次數（供無頭模擬驗證可達性）。
export function countDiplomacy(log = []) {
  const out = {};
  for (const r of log) {
    const k = r.action;
    out[k] = out[k] || { tried: 0, ok: 0 };
    out[k].tried += 1;
    if (r.ok) out[k].ok += 1;
  }
  return out;
}

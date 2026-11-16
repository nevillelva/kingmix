import { defaultSimPolicy, applySimPolicy } from './sim-policy.js';
// 無頭模擬：以固定種子逐月跑完，回傳可比對的摘要。
// 東廠有待處置的把柄時，該月的奏摺改為「東廠密報」。

import { createInitialState } from './state.js';
import { isAvailable, optionOpen, recordEvent, EVENT_MAX_PER_RUN } from './events.js';
import { makeRng } from './rng.js';
import { autoDecideMemorial } from './autodecide.js';
import { applyOption, afterOption } from './turn.js';
import { ORIGINS, applyOrigin, withOriginEvents } from './origin.js';
import { seedRelations } from './relations.js';
import { seedBondedCourtOfficial } from './bonds.js';
import { PREFECTURES, tourTo } from './tour.js';
import { drawPolicyCards, choosePolicyCard } from './cards.js';
import { takeChain } from './chains.js';
import { createScenarioState, evaluateScenario, SCENARIOS } from './scenarios.js';
import { applyDongchangAction, DC_ACTIONS } from './dongchang.js';
import { evaluateDynasty } from './ending.js';
import { autoCampaignStep } from './campaign.js';
import { COLLECTIONS, collectionProgress } from './collections.js';
import { autoRepairCities, ensureCity } from './city.js';
import { DEFAULT_MODE } from './mode.js';
import { endOfMonth } from './month.js';
import { pickEvent, pickSecondMemorial, autoAppoint } from './selection.js';
import { applyEdictsUnchecked } from './edicts.js';
import { autoRespondPartisan, partisanStatus } from './partisan.js';
import { attemptAlchemy } from './alchemy.js';

// 核心選擇規則已搬至 selection.js；此處 re-export 以維持既有 import 路徑。
export {
  autoAppoint, eventWeight, pickEvent, pickWeight, pityMultiplier, isStateGated, pickSecondMemorial,
  STATE_GATED_BOOST, FIRED_ALPHA, NEGLECT_MONTHS, NEGLECT_MAX_BONUS,
  REMON_EVENT_ID, PITY_AFTER_MONTHS, PITY_FACTOR, SECOND_MEMORIAL_CHANCE,
} from './selection.js';

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

// 策略選項：choose 為選用的玩家策略（見 strategy.js）；省略或回傳 null 時走預設種子隨機選擇。
function strategyOption(choose, state, event, seed, year, month) {
  if (!choose) return null;
  const options = event.options.filter((o) => isAvailable(o) && optionOpen(state, o));
  if (options.length === 0) return null;
  return choose(options, { state, event, seed, year, month }) ?? null;
}

// scenario 為選用：省略時行為與原本相同（標準開局、回傳不含 scenario 欄位）。
// partisan：黨爭模擬策略（'balance' | 'rally' | 'purge' | 'ignore'，見 partisan.js）。省略時黨爭不參與（預設，稽核數字不變）。
// monthlyAlchemy 為選用（預設 false）：每月月結前嘗試煉丹一次（煉丹側線壓力測試用，見 alchemy.js）；預設不煉丹，結果與原版相同。
export function runSimulation({ seed, months, events, policy = 'agrarian', scenario, mode = DEFAULT_MODE, choose, origin, edicts, partisan, simPolicy = defaultSimPolicy(), monthlyAlchemy = false }) {
  const state = scenario
    ? createScenarioState(seed, resolveScenarioId(scenario), { policy, mode })
    : createInitialState(seed, { policy, mode });
  state.partisan = { enabled: partisan !== undefined };
  applyOrigin(state, origin ?? ORIGINS[Math.floor(makeRng([seed, 'origin'])() * ORIGINS.length)].id); // 出身（預設依 seed 輪替，使四種出身事件皆可達）
  if (Array.isArray(edicts) && edicts.length) applyEdictsUnchecked(state, edicts); // 祖訓（未指定時 state.edicts 為空，與原版相同）
  events = withOriginEvents(events, state.origin); // 出身專屬事件（獨立檔，如寒門崛起）併入事件池
  seedRelations(state); // 開局臣子關係網
  seedBondedCourtOfficial(state); // 開局即有一位相得之臣，死諫條件自第一月起可成立
  const triggered = {};
  const campaignSteps = {};
  const log = [];
  const bump = (id) => { triggered[id] = (triggered[id] || 0) + 1; };

  for (let i = 0; i < months; i++) {
    if (!state.alive) {
      // 駕崩／禪位之繼位已於上月 endOfMonth 結算（含短局不繼位）；仍死亡即為國祚終結。
      state.campaign = null; // 皇帝駕崩時親征中止（不記入戰績）
      break;
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
    if (partisan !== undefined) autoRespondPartisan(state, partisan); // 黨爭：依策略裁決未了訴求（未參與時不呼叫）
    applySimPolicy(state, simPolicy, { seed, year, month }); // 玩家時段行動（午後、夜間各一項，見 sim-policy.js）
    if (monthlyAlchemy && state.alive) attemptAlchemy(state);
    endOfMonth(state); // 月結：與 web 的 finishMonth 共用（見 month.js）
  }

  return {
    ...(scenario ? { scenario: evaluateScenario(state) } : {}),
    ...(partisan !== undefined ? { partisan: partisanStatus(state) } : {}),
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

// 刺殺引擎：每月依三種來源計算觸發機率（確定性，種子 [seed, 年, 月, 'assassin']）。
//   tyranny  暴政：暴政高於 E305/E306 的門檻（40）時，機率隨暴政上升。
//   remnant  前朝遺臣：王朝更替後（dynasty.generation > 1）每月有固定機率。
//   court    朝堂江湖：派系強度高、且忠誠低的官員多時機率上升。
// 每月至多一起刺殺（來源依上列順序取第一個觸發者）。目標為太子、皇帝或一名官員，結果為擋下、受傷或死亡。
// 結果即時套用：皇帝死亡走 endReason='assassinated'；太子死亡清除儲位，後續繼承沿用 succession.js；官員死亡由 turn.js 以 removeOfficial 除名。
// 有對應奏摺的刺殺以 chain 排入次月，經既有事件池呈現，計入每局上限與冷卻。

import { makeRng } from './rng.js';
import { setStat, FACTION_BASE } from './state.js';
import { scheduleChain } from './chains.js';
import { eventAllowed } from './events.js';

export const ASSASSIN_SOURCES = Object.freeze({ tyranny: '暴政', remnant: '前朝遺臣', court: '朝堂江湖' });
export const ASSASSIN_TYRANNY_THRESHOLD = 40; // 與 E305/E306 的暴政門檻一致
export const ASSASSIN_LOW_LOYALTY = 50; // 忠誠低於此值視為「離心」官員
export const ASSASSIN_RATE = Object.freeze({ tyranny: 0.03, remnant: 0.002, court: 0.012 }); // 月機率上限（暫定，待模擬校準）
export const ASSASSIN_INJURY = 12; // 皇帝受傷時健康損耗
const TARGET_HEIR = 0.2; // 有太子時，目標為太子的機率
const TARGET_EMPEROR = 0.5; // 目標為皇帝的機率（其餘為官員）

// 結果機率（擋下／受傷／死亡），依目標種類區分。
const OUTCOME = Object.freeze({
  emperor: [['blocked', 0.6], ['injured', 0.3], ['killed', 0.1]],
  heir: [['blocked', 0.5], ['injured', 0.3], ['killed', 0.2]],
  official: [['blocked', 0.5], ['injured', 0.25], ['killed', 0.25]],
});

// 有奏摺的刺殺結果 → 事件 id（見 data/events.json 的 E401–E412，kind 為 assassination）。
// 未列於此的組合只記入起居注，不排入奏摺，也不受每局上限約束。
export const MEMORIAL = Object.freeze({
  'remnant|emperor|blocked': 'E401',
  'remnant|emperor|injured': 'E402',
  'court|emperor|blocked': 'E403',
  'court|emperor|injured': 'E404',
  'tyranny|emperor|blocked': 'E405',
  'tyranny|emperor|injured': 'E406',
  'remnant|heir|injured': 'E407',
  'court|official|blocked': 'E408',
  'court|official|killed': 'E409',
  'remnant|official|injured': 'E410',
  'tyranny|official|killed': 'E411',
  'remnant|heir|killed': 'E412',
});

// 單一來源的月機率。
export function assassinChance(state, source) {
  if (source === 'tyranny') {
    const t = state.tyranny || 0;
    if (t <= ASSASSIN_TYRANNY_THRESHOLD) return 0;
    return ASSASSIN_RATE.tyranny * (t - ASSASSIN_TYRANNY_THRESHOLD) / (100 - ASSASSIN_TYRANNY_THRESHOLD);
  }
  if (source === 'remnant') return state.dynasty.generation > 1 ? ASSASSIN_RATE.remnant : 0;
  if (source === 'court') {
    const top = Math.max(...Object.values(state.factions));
    const strength = Math.min(1, Math.max(0, (top - FACTION_BASE) / (100 - FACTION_BASE)));
    const disloyal = Math.min(3, state.officials.filter((o) => o.loyalty < ASSASSIN_LOW_LOYALTY).length);
    return ASSASSIN_RATE.court * strength * disloyal;
  }
  return 0;
}

function pickOfficial(state, u) {
  return state.officials[Math.min(state.officials.length - 1, Math.floor(u * state.officials.length))];
}

// 目標：太子（有儲位時）、皇帝或一名官員；無官員時改為皇帝。
function pickTarget(state, rng) {
  const crownPrince = state.heirs.find((h) => h.id === state.dynasty.crownPrince);
  const u = rng();
  if (crownPrince && u < TARGET_HEIR) return { kind: 'heir', heir: crownPrince };
  if (u < (crownPrince ? TARGET_HEIR : 0) + TARGET_EMPEROR || state.officials.length === 0) return { kind: 'emperor' };
  return { kind: 'official', official: pickOfficial(state, rng()) };
}

function pickOutcome(kind, rng) {
  const u = rng();
  let acc = 0;
  for (const [key, p] of OUTCOME[kind]) {
    acc += p;
    if (u < acc) return key;
  }
  return OUTCOME[kind].at(-1)[0];
}

// 每月結算。回傳 { source, target, outcome, official? } 或 null；
// 若回傳含 official（官員被殺），呼叫端須以 removeOfficial 除名。
export function tickAssassination(state) {
  const rng = makeRng([state.seed, state.year, state.month, 'assassin']);
  let source = null;
  for (const key of Object.keys(ASSASSIN_SOURCES)) {
    const p = assassinChance(state, key);
    if (p > 0 && rng() < p) {
      source = key;
      break;
    }
  }
  if (!source) return null;

  const target = pickTarget(state, rng);
  const outcome = pickOutcome(target.kind, rng);
  const memorial = MEMORIAL[`${source}|${target.kind}|${outcome}`] ?? null;
  // 有奏摺者計入上限與冷卻：已排定或已達上限、冷卻中者本月不發生。
  if (memorial && ((state.pendingChain || []).includes(memorial) || !eventAllowed(state, memorial))) return null;

  const targetName = target.kind === 'emperor'
    ? (state.emperor?.name ?? '皇帝')
    : target.kind === 'heir' ? target.heir.name : target.official.name;

  if (target.kind === 'emperor') {
    if (outcome === 'injured') {
      setStat(state, 'health', Math.max(1, state.stats.health - ASSASSIN_INJURY), { silent: true });
    } else if (outcome === 'killed') {
      state.alive = false;
      state.endReason = 'assassinated';
    }
  } else if (target.kind === 'heir' && outcome === 'killed') {
    state.heirs = state.heirs.filter((h) => h !== target.heir);
    state.dynasty.crownPrince = null;
  }

  state.chronicle.push({
    kind: 'assassination',
    generation: state.dynasty.generation,
    year: state.year,
    month: state.month,
    source,
    target: target.kind,
    targetName,
    outcome,
  });
  if (memorial) scheduleChain(state, memorial);

  const result = { source, target: target.kind, outcome };
  if (target.kind === 'official' && outcome === 'killed') result.official = target.official;
  return result;
}

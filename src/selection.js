// 事件抽選與吏部自動任命的核心規則（自 sim.js 搬移，行為不變）。
// sim.js 以 re-export 維持既有 import；web/ui/game-flow.js 直接自本檔匯入。
// 全部為確定性計算：抽選所需的 rng 由呼叫端傳入。

import { isEligible, isAvailable, optionOpen, eventAllowed, situationMultiplier } from './events.js';
import { suggestCandidate, assignOffice, OFFICES } from './offices.js';
import { unmetRequirements } from './officials.js';
import { PREFECTURE_DEFS, prefectOfficeKey } from './economy.js';

const AUTO_OFFICES = ['chancellor', 'revenue', 'works', 'war', 'tutor', ...PREFECTURE_DEFS.map((d) => prefectOfficeKey(d.id))];

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
export function trackRemonEligibility(state, events, rng) {
  const e = events.find((x) => x.id === REMON_EVENT_ID);
  const open = !!e && isAvailable(e) && eventAllowed(state, e.id) && isEligible(state, e, rng);
  state.flags = state.flags || {};
  if (open) state.flags.remon_eligible_since ??= monthIndex(state);
  else delete state.flags.remon_eligible_since;
}

// 被連鎖指向的事件只能經由連鎖觸發，不進入一般隨機抽選。
export function chainTargetIds(events) {
  const ids = new Set();
  for (const e of events) for (const o of e.options || []) if (o.effects && o.effects.chain) ids.add(o.effects.chain);
  // 刺殺奏摺只能經由刺殺引擎排入（chain），不進入一般隨機抽選。
  for (const e of events) if (e.kind === 'assassination') ids.add(e.id);
  return ids;
}

// 從所有符合條件的事件中，以種子隨機挑一則；避免清單前段事件長期壟斷。
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

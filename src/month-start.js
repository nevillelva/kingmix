// 月初準備（A5）：在每月開始時一次決定「本月奏摺」與「本年政策卡」，寫入 state。
// 渲染（render-*）只讀取這些結果，不再於繪製時抽選或改寫 state.flags。
// 所有亂數皆由 state.seed 導出，與既有網頁抽選路徑相同（同種子、同月份結果不變）。
// 冪等：同一個月重複呼叫不會重抽，也不會重複消耗連鎖佇列。

import { makeRng } from './rng.js';
import { takeChain } from './chains.js';
import { pickEvent, pickSecondMemorial } from './selection.js';
import { isAvailable, optionOpen, EVENT_MAX_PER_RUN } from './events.js';
import { drawPolicyCards } from './cards.js';
import { ensureAgency } from './slots.js';
import { orderMorningPair } from './ministry-order.js';

// 連鎖事件：不看 when 與冷卻，但仍需可用、未達每局上限。
export function chainEvent(state, events, id) {
  const e = id ? events.find((x) => x.id === id) : null;
  if (!e || !isAvailable(e)) return null;
  if ((state.eventHistory?.counts?.[id] || 0) >= EVENT_MAX_PER_RUN) return null;
  return e.options.some((o) => isAvailable(o) && optionOpen(state, o)) ? e : null;
}

// 東廠是否有待決把柄（有則本月不呈奏摺）。
export function hasPendingCase(state) {
  return (state.dongchang?.cases || []).some((c) => c.status === 'leverage');
}

// 月初準備。events 為事件目錄（與 data/events.json 的 events 陣列同形）。
export function prepareMonth(state, events) {
  const { year, month, seed } = state;
  const key = `${year}-${month}`;

  // 本月的時段行動配額（依年月分桶，冪等）。
  ensureAgency(state);

  // 早朝兩則奏摺：同月只決定一次，結果存於 state.monthChain。
  if (!state.monthChain || state.monthChain.key !== key) {
    state.monthChain = { key, id: takeChain(state) };
  }
  const mc = state.monthChain;
  if (!('second' in mc)) {
    if (!state.alive || hasPendingCase(state)) {
      // 不呈奏摺：標記為已決定（空），之後同月不再重抽。
      mc.first = null;
      mc.second = null;
      mc.secondDone = false;
    } else {
      const chained = chainEvent(state, events, mc.id);
      const first = chained ?? pickEvent(state, events, makeRng([seed, year, month, 'events']));
      const second = pickSecondMemorial(state, events, makeRng([seed, year, month, 'morning2']), first ? first.id : null);
      // 依六部順序呈現（只調換次序，不改變抽到的內容）。
      const [a, b] = orderMorningPair(first, second);
      mc.first = a ? a.id : null;
      mc.second = b ? b.id : null;
      mc.secondDone = false;
    }
  }

  // 每年正月的政策卡：本年只抽一次，結果寫入 policyCards.offer，並以 flags.policy_offer_year 記年。
  state.flags = state.flags || {};
  if (state.alive && month === 1 && state.flags.policy_card_year !== year && state.flags.policy_offer_year !== year) {
    try {
      drawPolicyCards(state, makeRng([seed, year, 'policycards']));
      state.flags.policy_offer_year = year;
    } catch (e) {
      // 抽卡失敗不影響月結；介面會因無 offer 而不顯示策卡。
    }
  }
  return state;
}

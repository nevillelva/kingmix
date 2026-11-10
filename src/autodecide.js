// 代為批閱奏摺：快進時以與 runSimulation 相同的規則挑選選項，確保結果可重現。

import { isAvailable, optionOpen } from './events.js';
import { makeRng } from './rng.js';

// 回傳 { option, key }；無可選項時回傳 null。鎖定（不可用或條件不符）的選項一律排除。
export function autoDecideMemorial(state, event, seed, year, month) {
  const options = event.options.filter((o) => isAvailable(o) && optionOpen(state, o));
  if (options.length === 0) return null;
  const pick = makeRng([seed, year, month, 'choice'])();
  const option = options[Math.floor(pick * options.length)];
  return { option, key: option.key };
}

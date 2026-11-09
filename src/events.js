// 事件資格判斷。條件以 AND 組合；chance 會消耗 rng，順序固定以維持確定性。
import { isBonded } from './bonds.js';
import { isCourtOfficial } from './officials.js';

import { canDiplomacy } from './diplomacy.js';

export function isEligible(state, event, rng) {
  const when = event.when || {};
  const s = state.stats;
  for (const [key, val] of Object.entries(when)) {
    switch (key) {
      case 'agriculture_lt': if (!(s.agriculture < val)) return false; break;
      case 'treasury_lt': if (!(s.treasury < val)) return false; break;
      case 'people_lt': if (!(s.people < val)) return false; break;
      case 'charm_gt': if (!(s.charm > val)) return false; break;
      case 'official_loyalty_lt': // 朝臣（知府不計）
        if (!state.officials.some((o) => isCourtOfficial(o) && o.loyalty < val)) return false;
        break;
      case 'months': if (!val.includes(state.month)) return false; break;
      case 'every_years':
        // 未指定 months 時，預設只在 1 月結算；指定 months 時由 months 決定月份
        if (!when.months && state.month !== 1) return false;
        if ((state.year - 1) % val !== 0) return false;
        break;
      case 'chance': if (!(rng() < val)) return false; break;
      case 'flag': if (!state.flags[val]) return false; break;
      case 'consorts_gt': if (!(state.consorts.length > val)) return false; break;
      case 'heirs_gt': if (!(state.heirs.length > val)) return false; break;
      case 'policy': if (state.policy !== val) return false; break;
      case 'tyranny_gt': if (!((state.tyranny || 0) > val)) return false; break;
      case 'tyranny_lt': if (!((state.tyranny || 0) < val)) return false; break;
      case 'official_trait': if (!hasOfficialTrait(state, val)) return false; break;
      // 君臣相得的朝臣中，有人忠誠低於門檻（死諫事件，見 turn.js remonstrance）
      case 'bonded_loyalty_lt':
        if (!state.officials.some((o) => isCourtOfficial(o) && isBonded(state, o.id) && o.loyalty < val)) return false;
        break;
      default: {
        // 通用數值條件：<stat>_lt / <stat>_gt，例如 prestige_lt、commerce_gt
        const m = key.match(/^([a-z]+)_(lt|gt)$/);
        if (!m || !(m[1] in state.stats)) throw new Error(`unknown condition in ${event.id}: ${key}`);
        const v = state.stats[m[1]];
        if (m[2] === 'lt' ? !(v < val) : !(v > val)) return false;
        break;
      }
    }
  }
  return true;
}

// Phase 1 只開放 phase <= 1 的事件與選項；其餘留待後續階段。
export const isAvailable = (node) => !node.phase || node.phase <= 1;

// 特質條件：現任或在任官員中，是否有人持有該特質（id 見 people.js 的 TRAITS）。
export function hasOfficialTrait(state, traitId) {
  return state.officials.some((o) => (o.traits || []).includes(traitId));
}

// 選項層級的條件（選項物件的 when 欄位）：支援 official_trait 與 diplomacy；不認得的條件一律視為不成立。
// 與 isAvailable 並用：選項需「可用且條件成立」才會呈現給玩家。沒有 when 的選項永遠開放。
export function optionOpen(state, option) {
  const when = option.when || {};
  return Object.entries(when).every(([key, val]) => {
    if (key === 'official_trait') return hasOfficialTrait(state, val);
    // 外交路線前置條件：{ action, neighbor }，與 diplomacy.js 的 canDiplomacy 相同。
    if (key === 'diplomacy') return canDiplomacy(state, val.action, val.neighbor);
    return false;
  });
}

// 事件冷卻與每局上限（方案：24 個月冷卻；任一事件每局不超過 8 次）。
export const EVENT_COOLDOWN = 24;
export const EVENT_MAX_PER_RUN = 8;
const monthIndex = (state) => (state.year - 1) * 12 + (state.month - 1);

export function eventAllowed(state, id) {
  const h = state.eventHistory || { counts: {}, last: {} };
  if ((h.counts[id] || 0) >= EVENT_MAX_PER_RUN) return false;
  const last = h.last[id];
  if (last !== undefined && monthIndex(state) - last < EVENT_COOLDOWN) return false;
  return true;
}

// 只有真正被選中並套用的事件才記錄，渲染時的預覽不記錄。
export function recordEvent(state, id) {
  state.eventHistory = state.eventHistory || { counts: {}, last: {} };
  const h = state.eventHistory;
  h.counts[id] = (h.counts[id] || 0) + 1;
  h.last[id] = monthIndex(state);
}

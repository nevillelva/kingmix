// 事件資格判斷。條件以 AND 組合；chance 會消耗 rng，順序固定以維持確定性。

export function isEligible(state, event, rng) {
  const when = event.when || {};
  const s = state.stats;
  for (const [key, val] of Object.entries(when)) {
    switch (key) {
      case 'agriculture_lt': if (!(s.agriculture < val)) return false; break;
      case 'treasury_lt': if (!(s.treasury < val)) return false; break;
      case 'people_lt': if (!(s.people < val)) return false; break;
      case 'charm_gt': if (!(s.charm > val)) return false; break;
      case 'official_loyalty_lt':
        if (!state.officials.some((o) => o.loyalty < val)) return false;
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

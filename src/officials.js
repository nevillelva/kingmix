// 官員：五項能力、忠誠、野心、派系、所任官職。
// Phase 2 的派系為三大派系，名稱為暫定，見 docs/specs/phase2-court.md。

export const ABILITIES = ['intellect', 'politics', 'martial', 'command', 'virtue'];
export const FACTIONS = ['qingliu', 'xunggui', 'hanmen'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function generateOfficial(rng, id, opts = {}) {
  const base = opts.base ?? 30;
  const span = opts.span ?? 60;
  const roll = () => Math.round(clamp(base + rng() * span, 0, 100));
  return {
    id,
    name: opts.name ?? id,
    abilities: {
      intellect: roll(),
      politics: roll(),
      martial: roll(),
      command: roll(),
      virtue: roll(),
    },
    loyalty: Math.round(40 + rng() * 50),
    ambition: Math.round(5 + rng() * 65),
    faction: FACTIONS[Math.floor(rng() * FACTIONS.length)],
    office: null,
  };
}

// 回傳未達標的需求清單；loyalty 為忠誠，其餘為能力。
export function unmetRequirements(official, requires) {
  const gaps = [];
  for (const [key, need] of Object.entries(requires)) {
    const have = key === 'loyalty' ? official.loyalty : official.abilities[key];
    if (have < need) gaps.push({ key, need, have });
  }
  return gaps;
}

// 忠誠安全線：本派勢力達此值時，月結的派系影響與野心抵銷、忠誠不再下滑。
// 與 turn.js 的忠誠漂移式一致：(勢力 − FACTION_BASE)/100 − 野心/200 ≥ 0 ⇔ 勢力 ≥ FACTION_BASE + 野心/2。
export const FACTION_NEUTRAL = 33; // 同 state.js FACTION_BASE，此處獨立定義以避免循環匯入
export function loyaltySafeInfluence(ambition) {
  return FACTION_NEUTRAL + ambition / 2;
}

// 忠誠安全線判定（介面顯示用）：回傳安全線、本派勢力與是否達標。
export function loyaltySafetyStatus(official, influence) {
  const need = loyaltySafeInfluence(official.ambition);
  return { need, influence, ok: influence >= need };
}

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

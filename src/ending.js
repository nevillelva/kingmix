// 結局評價：多軸評分（武功 / 文治 / 仁德 / 傳承），取代單一稱號。
// 門檻為 Phase 5 暫定值，待模擬校準。

export function evaluateDynasty(state) {
  const wins = state.wars.filter((w) => w.won).length;
  const losses = state.wars.length - wins;
  const recruits = state.officials.filter((o) => String(o.id).startsWith('r')).length;
  const military = Math.max(0, Math.min(100, Math.round(wins * 4 - losses * 5)));
  const civil = Math.max(0, Math.min(100, Math.round(state.stats.literature / 6 + recruits * 6)));
  const benevolence = Math.max(0, Math.min(100, Math.round(state.stats.benevolence / 5 + state.stats.people / 2) / 2));
  const legacy = Math.min(100, Math.min(50, (state.dynasty.generation - 1) * 15) + (state.dynasty.ended ? 0 : 10));

  const axes = { military, civil, benevolence, legacy };
  const top = Object.entries(axes).sort((a, b) => b[1] - a[1])[0][0];
  const TITLES = {
    military: '武功赫赫之主',
    civil: '文治昌明之主',
    benevolence: '仁德愛民之主',
    legacy: '承續基業之主',
  };
  return { axes, title: TITLES[top], generations: state.dynasty.generation };
}

// 段落目標（章節）：依在位年數與年齡決定目前所處章節。純函式，不改變遊戲流程。
// 判定順序：列表前段優先（晚年 > 盛世 > 中興 > 即位），符合第一個條件者即為當前章節。

export const MILESTONES = Object.freeze([
  { id: 'twilight', title: '晚年', minYear: 1, minAge: 60 },
  { id: 'prosperity', title: '盛世', minYear: 15, minAge: 0 },
  { id: 'revival', title: '中興', minYear: 6, minAge: 0 },
  { id: 'accession', title: '即位', minYear: 1, minAge: 0 },
]);

// 回傳 { id, title }；無符合者（理論上不會發生）回退為列表最後一項「即位」。
export function milestoneFor(state) {
  const year = state?.year ?? 1;
  const age = state?.age ?? 0;
  const hit = MILESTONES.find((m) => year >= m.minYear && age >= m.minAge);
  const { id, title } = hit ?? MILESTONES[MILESTONES.length - 1];
  return { id, title };
}

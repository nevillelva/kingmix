// 早朝奏摺依六部順序呈現（純函式，不改變抽選與效果）。
// 六部次序：吏、戶、禮、兵、刑、工。奏摺的 speaker 為官職名（見 speaker.js），以所含之部名判定所屬：
//   禮部之下屬寺（太常寺、鴻臚寺）併入禮部；刑部之下屬寺（大理寺）併入刑部。
// 非六部（御史、內侍、翰林等）排在六部之後；無 speaker 者排最後。

export const MINISTRY_ORDER = Object.freeze(['吏部', '戶部', '禮部', '兵部', '刑部', '工部']);

const ALIASES = Object.freeze({
  吏部: ['吏部'],
  戶部: ['戶部'],
  禮部: ['禮部', '太常寺', '鴻臚寺'],
  兵部: ['兵部'],
  刑部: ['刑部', '大理寺'],
  工部: ['工部'],
});

export const NON_MINISTRY_RANK = MINISTRY_ORDER.length; // 6
export const NO_SPEAKER_RANK = MINISTRY_ORDER.length + 1; // 7

// 回傳奏摺的部序（0 為吏部，5 為工部；非六部為 6；無 speaker 為 7）。
export function ministryRank(speaker) {
  if (typeof speaker !== 'string' || speaker === '') return NO_SPEAKER_RANK;
  for (let i = 0; i < MINISTRY_ORDER.length; i++) {
    const names = ALIASES[MINISTRY_ORDER[i]];
    if (names.some((n) => speaker.includes(n))) return i;
  }
  return NON_MINISTRY_RANK;
}

// 早朝兩則依部序排列：兩則皆在時，若次則的部序在前則對調；否則維持原順序（同部序不對調）。
// 只有一則或皆無時原樣回傳。回傳 [first, second]，不修改輸入。
export function orderMorningPair(first, second) {
  if (!first || !second) return [first ?? null, second ?? null];
  return ministryRank(second.speaker) < ministryRank(first.speaker) ? [second, first] : [first, second];
}

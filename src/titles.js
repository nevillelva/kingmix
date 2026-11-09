// 屬性突破稱號：文學、武略達 100／150／200 時授予稱號，並給一次性的小加成。
// 稱號記入 state.flags（鍵 title.<屬性>.<門檻>，值為稱號名），只授予一次。數值為暫定值。

import { setStat } from './state.js';

export const TITLE_MILESTONES = [100, 150, 200];

export const TITLE_STATS = {
  literature: {
    name: '文學',
    titles: { 100: '博士', 150: '鴻儒', 200: '文宗' },
    bonus: { stat: 'prestige', amount: 3 },
  },
  military: {
    name: '武略',
    titles: { 100: '知兵', 150: '名將', 200: '戰神' },
    bonus: { stat: 'power', amount: 3 },
  },
};

export function titleFlag(stat, milestone) {
  return `title.${stat}.${milestone}`;
}

// 每月結算：達門檻且尚未授予者，授予稱號並加成。
export function tickTitles(state) {
  for (const [key, def] of Object.entries(TITLE_STATS)) {
    for (const m of TITLE_MILESTONES) {
      const flag = titleFlag(key, m);
      if (state.flags[flag] || state.stats[key] < m) continue;
      state.flags[flag] = def.titles[m];
      setStat(state, def.bonus.stat, state.stats[def.bonus.stat] + def.bonus.amount);
    }
  }
  return state;
}

// 已獲得的稱號名稱（依屬性與門檻排序）。
export function earnedTitles(state) {
  const out = [];
  for (const key of Object.keys(TITLE_STATS)) {
    for (const m of TITLE_MILESTONES) {
      const t = state.flags[titleFlag(key, m)];
      if (t) out.push(t);
    }
  }
  return out;
}

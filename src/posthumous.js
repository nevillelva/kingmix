// 諡號與實錄卷軸：依結局評價的最高軸決定諡號字。
// 同分時沿用 ending.js 的排序規則（穩定排序，依軸的定義順序取先者），結果確定。

import { evaluateDynasty } from './ending.js';

export const POSTHUMOUS = {
  military: { char: '武', epithet: '克定四方，武功赫赫' },
  civil: { char: '文', epithet: '崇文興學，治化昌明' },
  benevolence: { char: '仁', epithet: '恤民養民，仁澤廣被' },
  legacy: { char: '承', epithet: '繼志述事，承續基業' },
};

export function topAxis(axes) {
  return Object.entries(axes).sort((a, b) => b[1] - a[1])[0][0];
}

export function posthumousTitle(state) {
  const { axes, generations } = evaluateDynasty(state);
  const axis = topAxis(axes);
  const { char, epithet } = POSTHUMOUS[axis];
  return { axis, char, name: `${char}皇帝`, epithet, generations };
}

// 卷軸內容：諡號、各軸評分與世代數，供介面以卷軸樣式呈現。
export function buildScroll(state) {
  const { axes } = evaluateDynasty(state);
  const title = posthumousTitle(state);
  const labels = { military: '武功', civil: '文治', benevolence: '仁德', legacy: '傳承' };
  return {
    heading: `實錄・${title.name}`,
    posthumous: title,
    axes: Object.entries(axes).map(([k, v]) => ({ key: k, label: labels[k], score: v })),
    lines: [
      `諡曰「${title.char}」，${title.epithet}。`,
      `歷經 ${title.generations} 世。`,
    ],
  };
}

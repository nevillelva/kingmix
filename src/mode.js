// 遊戲局長模式：長局（600 月，預設）與短局（144 月，12 年）。
// 純引擎功能：模式只決定月數上限，其餘規則不變。

export const MODES = Object.freeze({
  long: Object.freeze({ key: 'long', label: '長局', months: 600 }),
  short: Object.freeze({ key: 'short', label: '短局', months: 144 }),
});

export const DEFAULT_MODE = 'long';

export function modeMonths(key = DEFAULT_MODE) {
  const mode = MODES[key];
  if (!mode) throw new Error(`unknown mode: ${key}`);
  return mode.months;
}

import { setStat } from './state.js';

// 年號：純展示與行動資料，不得進入任何 RNG（年號不影響種子決定性）。

export const DEFAULT_ERA = '永和';
export const PRESET_ERAS = Object.freeze(['永和', '承平', '景運', '寧康', '元德', '嘉泰']);
export const ERA_MIN_CHARS = 1;
export const ERA_MAX_CHARS = 4;
export const ERA_CHANGE_PRESTIGE_COST = 2;
export const ERA_CHANGE_COOLDOWN_MONTHS = 12;

const CJK_ONLY = /^[㐀-䶿一-鿿]+$/;

// 驗證年號：1–4 個漢字（CJK 統一表意文字）。回傳 { ok, name | reason }。
export function validateEra(raw) {
  const name = String(raw ?? '').trim();
  if (name === '') return { ok: false, reason: 'empty' };
  const len = Array.from(name).length;
  if (len < ERA_MIN_CHARS || len > ERA_MAX_CHARS) return { ok: false, reason: 'length' };
  if (!CJK_ONLY.test(name)) return { ok: false, reason: 'charset' };
  return { ok: true, name };
}

export const ERA_REASON_TEXT = {
  empty: '年號不可為空。',
  length: `年號須為 ${ERA_MIN_CHARS}–${ERA_MAX_CHARS} 字。`,
  charset: '年號須為漢字。',
};

// 建立 state.era；輸入無效或為空時採預設「永和」。
export function createEra(raw, startYear = 1) {
  const v = validateEra(raw);
  return { name: v.ok ? v.name : DEFAULT_ERA, since: startYear, changedAt: null, log: [] };
}

export function eraName(state) {
  return state?.era?.name || DEFAULT_ERA;
}

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
// 1–99 的中文數字（年號紀年用）；超出範圍則回傳阿拉伯數字。
export function toChineseNumber(n) {
  if (n < 1 || n > 99) return String(n);
  if (n < 10) return CN_DIGITS[n];
  if (n === 10) return '十';
  const tens = n >= 20 ? CN_DIGITS[Math.floor(n / 10)] : '';
  return `${tens}十${n % 10 ? CN_DIGITS[n % 10] : ''}`;
}

// 年號紀年：自改元之年起算為元年；回傳「元」或中文數字。
export function eraYearLabel(state) {
  const since = state?.era?.since ?? 1;
  const n = Math.max(1, (state?.year ?? 1) - since + 1);
  return n === 1 ? '元' : toChineseNumber(n);
}

// 「○○元年」「○○二年」等完整紀年。
export function eraYearText(state) {
  return `${eraName(state)}${eraYearLabel(state)}年`;
}

function monthIndex(state) {
  return (state.year - 1) * 12 + (state.month - 1);
}

// 距離下次可改元尚餘月數（0 表示現在可改）。
export function eraCooldownRemaining(state) {
  const at = state?.era?.changedAt;
  if (at === null || at === undefined) return 0;
  return Math.max(0, ERA_CHANGE_COOLDOWN_MONTHS - (monthIndex(state) - at));
}

// 改元：耗威儀、每 12 個月最多一次，寫入 state.era.log（起居注紀錄）。
export function changeEra(state, raw) {
  if (!state.era) state.era = createEra(null, state.year);
  const v = validateEra(raw);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (eraCooldownRemaining(state) > 0) return { ok: false, reason: 'cooldown', remaining: eraCooldownRemaining(state) };
  if (state.stats.prestige < ERA_CHANGE_PRESTIGE_COST) return { ok: false, reason: 'prestige' };
  const from = eraName(state);
  setStat(state, 'prestige', state.stats.prestige - ERA_CHANGE_PRESTIGE_COST);
  state.era.name = v.name;
  state.era.since = state.year;
  state.era.changedAt = monthIndex(state);
  state.era.log.push({ year: state.year, month: state.month, from, to: v.name, kind: 'change' });
  return { ok: true, name: v.name };
}

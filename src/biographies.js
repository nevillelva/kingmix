// 名臣列傳（B）：終局時自本局命運線挑選入傳人物，寫入跨局紀錄（unlocks.js 的 v2 紀錄），不放進單局 state。
//
// - 入傳類別（依優先序）：權臣（現任 latePressure.minister）、死諫者（命運線結局 remonstrance）、
//   相得臣子（bonds.unlocked）、得勢后妃（寵愛 ≥ FAVORED_FAVOR）。登基皇子的伴讀目前資料中不存在，未納入。
// - 每局上限 BIO_CAP 人。內容只取自 state.fates 記錄的命運線段落（record.lines 與 record.endLine），不從史冊反查。
// - 純函式：不消耗 rng、不改動 state。

import { isBonded } from './bonds.js';

export const BIO_CAP = 5; // 每局入傳人數上限
export const FAVORED_FAVOR = 70; // 得勢后妃的寵愛門檻
export const BIOGRAPHY_CAP = 100; // 跨局列傳的總筆數上限（只保留最近者）
export const BIO_TAGS = Object.freeze({ minister: '權臣', remonstrance: '死諫', bonded: '相得', favored: '得勢' });

// 本局識別鍵：種子與世代。同一局在跨局紀錄中只寫入一次。
export function runKeyOf(state) {
  return `${state.seed}:${state.dynasty?.generation ?? 1}`;
}

// 挑選入傳人物（純讀取）。回傳 [{ role, id, name, tag, lines, endLine }]，至多 BIO_CAP 筆。
export function selectBiographies(state) {
  const fates = state.fates || {};
  const picks = [];
  const taken = new Set();

  const push = (role, id, tag) => {
    const key = `${role}:${id}`;
    const rec = fates[key];
    if (!rec || taken.has(key) || picks.length >= BIO_CAP) return;
    taken.add(key);
    const lines = Array.isArray(rec.lines) ? rec.lines.filter((t) => typeof t === 'string') : [];
    picks.push({ role, id, name: rec.name, tag, lines, endLine: typeof rec.endLine === 'string' ? rec.endLine : null });
  };

  const minister = state.latePressure?.minister;
  if (minister) push('official', minister.id, 'minister');

  for (const key of Object.keys(fates)) {
    const rec = fates[key];
    if (rec?.endCause !== 'remonstrance') continue;
    const at = key.indexOf(':');
    push(key.slice(0, at), key.slice(at + 1), 'remonstrance');
  }

  for (const o of state.officials || []) {
    if (isBonded(state, o.id)) push('official', o.id, 'bonded');
  }

  const favored = (state.consorts || [])
    .filter((c) => (c.favor ?? 0) >= FAVORED_FAVOR)
    .sort((a, b) => (b.favor ?? 0) - (a.favor ?? 0));
  for (const c of favored) push('consort', c.id, 'favored');

  return picks;
}

// 本局入傳者轉為跨局紀錄的條目（附上 runKey 與年份）。
export function runBiographyEntries(state) {
  const runKey = runKeyOf(state);
  return selectBiographies(state).map((p) => ({
    runKey,
    role: p.role,
    id: p.id,
    name: p.name,
    tag: p.tag,
    year: state.year,
    lines: p.lines,
    endLine: p.endLine,
  }));
}

// 歷代帝王表（legacy.js）每列的列傳：依史冊摘要的種子篩出該局條目。資料結構就緒，UI 展開本輪未接。
export function biographiesForSeed(record, seed) {
  const list = Array.isArray(record?.biographies) ? record.biographies : [];
  const prefix = `${seed}:`;
  return list.filter((b) => typeof b.runKey === 'string' && b.runKey.startsWith(prefix));
}

// 圖鑑：純函式。依遊戲狀態與跨局史冊，計算各類收藏條目的解鎖進度。
// 不寫入任何狀態、不接入 UI、不使用 RNG。

import { LEGACY_CAP } from './legacy.js';

export const GALLERY_CATEGORIES = Object.freeze(['emperor', 'official', 'event', 'battle']);

// 戰功條目：勝場達到門檻即解鎖。
export const BATTLE_MILESTONES = Object.freeze([1, 5, 10, 20]);

// 具名官員：與 state.js 初始朝臣名冊相同（官員記錄的名稱即為 name）。
export const NAMED_OFFICIALS = Object.freeze(['丞相', '戶部尚書', '知府', '翰林學士']);

// 歷代先帝：每筆史冊紀錄為一位先帝，槽位上限沿用 LEGACY_CAP。
const emperorEntries = () => Array.from({ length: LEGACY_CAP }, (_, i) => ({
  category: 'emperor',
  id: `emperor:${i + 1}`,
  name: `第 ${i + 1} 位先帝`,
  slot: i + 1,
}));

const officialEntries = () => NAMED_OFFICIALS.map((name) => ({
  category: 'official',
  id: `official:${name}`,
  name,
}));

// events：事件目錄（與 data/events.json 的 events 陣列同形）。未傳入則事件類無條目。
const eventEntries = (events = []) => (Array.isArray(events) ? events : []).map((e) => ({
  category: 'event',
  id: `event:${e.id}`,
  name: e.title ?? e.id,
  eventId: e.id,
}));

const battleEntries = () => BATTLE_MILESTONES.map((n) => ({
  category: 'battle',
  id: `battle:${n}`,
  name: `勝 ${n} 役`,
  threshold: n,
}));

// 完整登錄表：四類條目。
export function galleryRegistry(events = []) {
  return {
    emperor: emperorEntries(),
    official: officialEntries(),
    event: eventEntries(events),
    battle: battleEntries(),
  };
}

// 解鎖判斷（單一條目）。
function isUnlocked(entry, state, legacyCount, officialNames, eventCounts, wins) {
  switch (entry.category) {
    case 'emperor':
      return entry.slot <= legacyCount;
    case 'official':
      return officialNames.has(entry.name);
    case 'event':
      return (eventCounts[entry.eventId] || 0) > 0;
    case 'battle':
      return wins >= entry.threshold;
    default:
      return false;
  }
}

// 圖鑑進度：回傳各類 unlocked / total、全部已解鎖條目，以及總計。
// legacyHistory 為 legacy.js 的 recordRun 陣列；events 為事件目錄（選用）。
export function galleryProgress(state, legacyHistory, events = []) {
  const s = state ?? {};
  const legacyCount = Array.isArray(legacyHistory) ? Math.min(legacyHistory.length, LEGACY_CAP) : 0;
  const officialNames = new Set((Array.isArray(s.officials) ? s.officials : []).map((o) => o.name));
  const eventCounts = s.eventHistory?.counts ?? {};
  const wins = Array.isArray(s.wars) ? s.wars.filter((w) => w.won === true).length : 0;

  const registry = galleryRegistry(events);
  const categories = {};
  const unlocked = [];
  for (const cat of GALLERY_CATEGORIES) {
    const entries = registry[cat];
    let count = 0;
    for (const entry of entries) {
      if (isUnlocked(entry, s, legacyCount, officialNames, eventCounts, wins)) {
        count += 1;
        unlocked.push({ ...entry });
      }
    }
    categories[cat] = { unlocked: count, total: entries.length };
  }
  const total = {
    unlocked: GALLERY_CATEGORIES.reduce((n, c) => n + categories[c].unlocked, 0),
    total: GALLERY_CATEGORIES.reduce((n, c) => n + categories[c].total, 0),
  };
  return { categories, total, unlocked };
}

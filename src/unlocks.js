// 跨局傳承解鎖：達成稱號後解鎖新出身、新劇本、新策卡。解鎖紀錄為獨立的跨局紀錄，
// 不寫入單局 state（以免影響單局確定性）。本模組為純函式：儲存空間由呼叫端注入，寫入失敗回傳 false。
import { earnedTitles, TITLE_STATS, TITLE_MILESTONES } from './titles.js';
import { runBiographyEntries, runKeyOf, BIOGRAPHY_CAP } from './biographies.js';

// v2：新增 biographies（名臣列傳，見 biographies.js）。v1 紀錄讀入時補上空列傳（見 normalizeUnlockRecord）。
export const UNLOCK_RECORD_VERSION = 2;

// 解鎖規則：kind → id → 所需稱號名（任一局達成即永久解鎖）。數值為暫定設計。
export const UNLOCK_RULES = Object.freeze({
  origin: Object.freeze({ hanmen: '博士' }),
  scenario: Object.freeze({ wenzhi: '鴻儒' }),
  card: Object.freeze({ wu_drill: '名將' }),
});

// 全部可能的稱號名（由 titles.js 推導，供讀取時過濾未知值）。
const KNOWN_TITLES = new Set(
  Object.values(TITLE_STATS).flatMap((def) => TITLE_MILESTONES.map((m) => def.titles[m])),
);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function emptyUnlockRecord() {
  return { version: UNLOCK_RECORD_VERSION, titles: [], biographies: [] };
}

// 列傳條目的正規化：缺欄位或型別錯誤者略過。
function normalizeBiography(b) {
  if (!isPlainObject(b)) return null;
  if (typeof b.runKey !== 'string' || typeof b.name !== 'string' || typeof b.tag !== 'string') return null;
  return {
    runKey: b.runKey,
    role: typeof b.role === 'string' ? b.role : '',
    id: typeof b.id === 'string' || typeof b.id === 'number' ? b.id : null,
    name: b.name,
    tag: b.tag,
    year: Number.isFinite(b.year) ? b.year : null,
    lines: Array.isArray(b.lines) ? b.lines.filter((t) => typeof t === 'string') : [],
    endLine: typeof b.endLine === 'string' ? b.endLine : null,
  };
}

// 正規化：缺欄位或格式錯誤時回傳預設值；未知稱號名略過；版本號缺漏視為 v1（遷移）。
export function normalizeUnlockRecord(raw) {
  if (!isPlainObject(raw)) return emptyUnlockRecord();
  const titles = Array.isArray(raw.titles)
    ? [...new Set(raw.titles.filter((t) => typeof t === 'string' && KNOWN_TITLES.has(t)))]
    : [];
  const biographies = Array.isArray(raw.biographies)
    ? raw.biographies.map(normalizeBiography).filter(Boolean).slice(-BIOGRAPHY_CAP)
    : [];
  return { version: UNLOCK_RECORD_VERSION, titles, biographies };
}

// 讀取：回傳 { record, readOnly }。版本號高於本程式時 readOnly 為 true，呼叫端不得寫回（避免覆蓋新版資料）。
// 任何讀取或解析例外皆回傳預設值，不拋錯。
export function readUnlockRecord(storage, key) {
  let text = null;
  try {
    text = storage.getItem(key);
  } catch (e) {
    return { record: emptyUnlockRecord(), readOnly: false };
  }
  if (!text) return { record: emptyUnlockRecord(), readOnly: false };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { record: emptyUnlockRecord(), readOnly: false };
  }
  if (isPlainObject(obj) && Number.isInteger(obj.version) && obj.version > UNLOCK_RECORD_VERSION) {
    return { record: emptyUnlockRecord(), readOnly: true };
  }
  return { record: normalizeUnlockRecord(obj), readOnly: false };
}

// 寫入（沿用 save.js writeAutoSave 的模式）：成功回傳 true，任何例外回傳 false。
export function writeUnlockRecord(storage, key, record) {
  try {
    storage.setItem(key, JSON.stringify(normalizeUnlockRecord(record)));
    return true;
  } catch (e) {
    return false;
  }
}

// 併入本局已獲得的稱號（讀取 state.flags）。無新增時回傳內容相同的新物件。
export function recordEarnedTitles(record, state) {
  const base = normalizeUnlockRecord(record);
  const got = state ? earnedTitles(state).filter((t) => KNOWN_TITLES.has(t)) : [];
  const titles = [...new Set([...base.titles, ...got])];
  return { version: UNLOCK_RECORD_VERSION, titles, biographies: normalizeUnlockRecord(record).biographies };
}

// 併入本局名臣列傳（僅於國祚終結 dynasty.ended 時）。同一局只寫一次；無入傳者或未終局時回傳內容相同的新物件。
export function recordBiographies(record, state) {
  const base = normalizeUnlockRecord(record);
  if (!state || state.dynasty?.ended !== true) return base;
  const runKey = runKeyOf(state);
  if (base.biographies.some((b) => b.runKey === runKey)) return base;
  const entries = runBiographyEntries(state).map(normalizeBiography).filter(Boolean);
  if (entries.length === 0) return base;
  return { ...base, biographies: [...base.biographies, ...entries].slice(-BIOGRAPHY_CAP) };
}

// 某內容是否已解鎖。未列入 UNLOCK_RULES 者為基本內容，恆為已解鎖。
export function isUnlocked(record, kind, id) {
  const need = UNLOCK_RULES[kind]?.[id];
  if (!need) return true;
  return normalizeUnlockRecord(record).titles.includes(need);
}

// 某類已解鎖的 id 清單（依規則宣告順序）。
export function unlockedIds(record, kind) {
  return Object.keys(UNLOCK_RULES[kind] ?? {}).filter((id) => isUnlocked(record, kind, id));
}

// 解鎖條件說明，例如「需達成稱號「博士」（文學達 100）」。稱號名不在規則內時回傳空字串。
export function unlockRequirementText(kind, id) {
  const title = UNLOCK_RULES[kind]?.[id];
  if (!title) return '';
  for (const def of Object.values(TITLE_STATS)) {
    for (const m of TITLE_MILESTONES) {
      if (def.titles[m] === title) return `需達成稱號「${title}」（${def.name}達 ${m}）`;
    }
  }
  return `需達成稱號「${title}」`;
}

// 存檔版本化與匯出入（純模組：不讀寫 localStorage，只處理字串與物件）
//
// v2 格式：{ version: 2, savedAt: <ISO 字串>, seed, state }
// v1 舊格式（web/index.html 目前寫入的 {seed, state}，或裸 state 物件）
//   讀取時遷移為 v2 包裝，並記錄 version: 1。
//
// state.schemaVersion 為遊戲狀態結構版本（目前為 1）。migrateState 只補缺漏欄位（基準為
// createInitialState 的結構，不覆寫既有值）；validateState 回傳錯誤代碼清單，空陣列即有效。

import { BOUNDS, createInitialState } from './state.js';

export const SAVE_VERSION = 2;
export const STATE_SCHEMA_VERSION = 1;

const defaultNow = () => new Date().toISOString();

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function fail(error) {
  return { ok: false, error };
}

// 將遊戲狀態包成 v2 存檔物件。clock 可注入以利測試：{ now: () => ISO 字串 }
export function serializeSave(state, { now = defaultNow } = {}) {
  if (!isPlainObject(state)) throw new TypeError('serializeSave: state must be an object');
  return {
    version: SAVE_VERSION,
    savedAt: now(),
    seed: state.seed,
    state,
  };
}

// 解析存檔字串。成功回傳 { ok: true, state, version, seed, savedAt? }，失敗回傳 { ok: false, error }。
export function parseSave(jsonString) {
  if (typeof jsonString !== 'string') return fail('invalid_json');
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch (e) {
    return fail('invalid_json');
  }
  if (!isPlainObject(obj)) return fail('invalid_shape');

  // v1 舊格式：沒有 version 欄位
  if (obj.version === undefined) {
    const hasWrapper = isPlainObject(obj.state);
    const state = hasWrapper ? obj.state : obj;
    const seed = obj.seed !== undefined ? obj.seed : state.seed;
    if (seed === undefined || seed === null || seed === '') return fail('missing_seed');
    return { ok: true, state, version: 1, seed };
  }

  if (!Number.isInteger(obj.version) || obj.version < 1) return fail('invalid_version');
  if (obj.version > SAVE_VERSION) return fail('future_version');

  // v2（目前唯一的已知版本）
  if (!isPlainObject(obj.state)) return fail('invalid_shape');
  const seed = obj.seed !== undefined ? obj.seed : obj.state.seed;
  if (seed === undefined || seed === null || seed === '') return fail('missing_seed');
  return { ok: true, state: obj.state, version: obj.version, seed, savedAt: obj.savedAt };
}

// 匯出為可下載的字串（縮排 JSON）
export function exportSave(state, opts) {
  return JSON.stringify(serializeSave(state, opts), null, 2);
}

// 匯入：parseSave 加上 state.alive 型別檢查（若存在）
export function importSave(text) {
  const r = parseSave(text);
  if (!r.ok) return r;
  if ('alive' in r.state && typeof r.state.alive !== 'boolean') {
    return fail('invalid_alive');
  }
  return r;
}

// ── 狀態遷移與驗證 ──

// 深層補缺：target 缺少 base 的鍵時複製過來；既有值一律保留（不覆寫）。陣列內容不補。
function fillMissing(target, base) {
  for (const key of Object.keys(base)) {
    const b = base[key];
    if (target[key] === undefined) {
      target[key] = structuredClone(b);
    } else if (isPlainObject(b) && isPlainObject(target[key])) {
      fillMissing(target[key], b);
    }
  }
}

// 回傳遷移後的新物件（不修改傳入的 state）：補上 createInitialState 結構中缺漏的欄位，並設定 schemaVersion。
export function migrateState(state) {
  if (!isPlainObject(state)) throw new TypeError('migrateState: state must be an object');
  const out = structuredClone(state);
  try {
    const seed = out.seed !== undefined && out.seed !== null && out.seed !== '' ? out.seed : '';
    const base = createInitialState(String(seed));
    fillMissing(out, base);
  } catch (e) {
    // 基準建立失敗（例如未知模式）時保留原狀態，交由 validateState 回報。
  }
  if (!Number.isInteger(out.schemaVersion)) out.schemaVersion = STATE_SCHEMA_VERSION;
  return out;
}

// 驗證遊戲狀態的必要結構。回傳錯誤代碼陣列，空陣列即為有效。
export function validateState(state) {
  if (!isPlainObject(state)) return ['not_object'];
  const errs = [];
  const seedOk = (typeof state.seed === 'string' && state.seed !== '') || Number.isFinite(state.seed);
  if (!seedOk) errs.push('missing_seed');
  if (Number.isInteger(state.schemaVersion) && state.schemaVersion > STATE_SCHEMA_VERSION) errs.push('future_schema');
  if (typeof state.alive !== 'boolean') errs.push('invalid_alive');
  for (const k of ['year', 'month', 'age', 'turn']) {
    if (!Number.isFinite(state[k])) errs.push(`invalid_${k}`);
  }
  if (!isPlainObject(state.stats)) {
    errs.push('invalid_stats');
  } else {
    for (const k of Object.keys(BOUNDS)) {
      if (!Number.isFinite(state.stats[k])) errs.push(`invalid_stat_${k}`);
    }
  }
  for (const k of ['officials', 'wars', 'consorts', 'heirs', 'chronicle']) {
    if (!Array.isArray(state[k])) errs.push(`invalid_${k}`);
  }
  if (!isPlainObject(state.dynasty)) errs.push('invalid_dynasty');
  return errs;
}

// 已解析的存檔（parseSave 或 importSave 的成功結果）→ 遷移並驗證。成功回傳 { ok, state, seed, version }。
export function finalizeLoaded(parsed) {
  if (!parsed || !parsed.ok) return { ok: false, error: 'invalid_json', errors: ['invalid_json'] };
  try {
    const pre = isPlainObject(parsed.state) ? { ...parsed.state } : {};
    if (pre.seed === undefined) pre.seed = parsed.seed;
    const state = migrateState(pre);
    const errors = validateState(state);
    if (errors.length) return { ok: false, error: errors[0], errors };
    return { ok: true, state, seed: parsed.seed, version: parsed.version };
  } catch (e) {
    return { ok: false, error: 'invalid_state', errors: ['invalid_state'] };
  }
}

// 讀取存檔字串：parseSave → finalizeLoaded。損毀或不完整時回傳 { ok: false, error, errors }，不拋錯。
export function restoreSave(text) {
  return finalizeLoaded(parseSave(text));
}

// ── 自動存檔寫入（純函式：storage 由呼叫端注入，便於測試） ──

// 自動存檔字串：v2 包裝，seed 以傳入值為準。
export function encodeAutoSave(seed, state, opts) {
  return JSON.stringify(serializeSave({ ...state, seed }, opts));
}

// 寫入 storage[key]。成功回傳 true；任何例外（如儲存空間已滿、storage 不存在）回傳 false。
export function writeAutoSave(storage, key, seed, state, opts) {
  try {
    storage.setItem(key, encodeAutoSave(seed, state, opts));
    return true;
  } catch (e) {
    return false;
  }
}

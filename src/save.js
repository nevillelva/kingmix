// 存檔版本化與匯出入（純模組：不讀寫 localStorage，只處理字串與物件）
//
// v2 格式：{ version: 2, savedAt: <ISO 字串>, seed, state }
// v1 舊格式（web/index.html 目前寫入的 {seed, state}，或裸 state 物件）
//   讀取時遷移為 v2 包裝，並記錄 version: 1。

export const SAVE_VERSION = 2;

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

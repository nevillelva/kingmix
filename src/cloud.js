// 雲端存檔介面（stub）：見 docs/design/cloud-save.md
// CLOUD_ENABLED 為 false 時，所有函式直接回傳 { ok: false, error: 'disabled' }，不發出任何網路請求。
// 本機存檔（localStorage 的 v2 包裝，見 src/save.js）永遠是主要來源；雲端只是備援與跨裝置同步。

import { parseSave } from './save.js';

export const CLOUD_ENABLED = false;

export const CLOUD_KEY = 'kingmix-save-v1';

const DISABLED = Object.freeze({ ok: false, error: 'disabled' });

// 將雲端取回的存檔文字經 src/save.js 解析（支援 v1 與 v2）。失敗時回傳 parseSave 的錯誤碼。
export function remoteFromText(text) {
  const r = parseSave(text);
  if (!r.ok) return r;
  return { ok: true, state: r.state, seed: r.seed, version: r.version, savedAt: r.savedAt };
}

// 寫入一份存檔文字（已由 src/save.js 序列化的 JSON 字串）到雲端。
export async function cloudPut(key, text) {
  if (!CLOUD_ENABLED) return { ...DISABLED };
  // 尚未實作：啟用前須接上 Artifact db capability 或後端，並在此處處理逾時與錯誤。
  return { ok: false, error: 'not_implemented' };
}

// 讀取雲端存檔文字。成功時回傳 { ok: true, text }。
export async function cloudGet(key) {
  if (!CLOUD_ENABLED) return { ...DISABLED };
  return { ok: false, error: 'not_implemented' };
}

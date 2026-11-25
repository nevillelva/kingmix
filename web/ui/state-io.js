// web/ui/state-io.js：存檔（自動存檔、排程寫入）、匯出匯入、三格欄位、雲端狀態與衝突對話框（Canvas 版）。
import { SAVE_VERSION, STATE_SCHEMA_VERSION, exportSave, finalizeLoaded, importSave, restoreSave, serializeSave, writeAutoSave } from '../../src/save.js';
import { resolveConflict, stampSave } from '../../src/conflict.js';
import { eraYearText, migrateEraLog } from '../../src/era.js';
import { prepareMonth } from '../../src/month-start.js';
import { U } from './store.js';
import { useCap } from './util.js';
import { render } from './render-bus.js';
import { syncUnlocks, UNLOCK_FAIL_MSG } from './unlock-store.js';
import { currentEventPool } from './event-pool.js';
import { pruneNewYearKeys } from './newyear-keys.js';
import { C, pushToast } from './canvas/core.js';
import { modal } from './canvas/input.js';
import { button, panel, text } from './canvas/widgets.js';
import { INK } from './canvas/theme.js';

export const SAVE_KEY = 'kingmix-save-v1';
// 損毀自動存檔的備份鍵（「開新局」前先另存，避免資料無聲遺失）。
export const CORRUPT_BACKUP_KEY = 'kingmix-save-v1-corrupt-backup';

export const AUTO_SAVE_FAIL_MSG = '自動存檔失敗（瀏覽器儲存空間可能已滿），請匯出存檔備份';

// 寫入本機自動存檔（v2 包裝，不推送雲端）。成功回傳 true；失敗時顯示存檔訊息，記憶體進度保留。
let autoSaveFailed = false;
function writeLocal(seed, state) {
  const ok = writeAutoSave(globalThis.localStorage, SAVE_KEY, seed, state);
  if (!ok) { autoSaveFailed = true; saveMsg(AUTO_SAVE_FAIL_MSG); }
  else if (autoSaveFailed) { autoSaveFailed = false; saveMsg(''); }
  return ok;
}

// 存檔排程：save() 於閒置時合併寫入一次；頁面隱藏時立即 flush。
let saveDirty = false;
let saveQueued = false;
const runIdle = cb => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(cb, { timeout: 2000 })
  : setTimeout(cb, 0));

export function flushSave() {
  if (!saveDirty) return;
  saveDirty = false;
  if (!U.state) return;
  if (syncUnlocks(U.state).writeFailed) saveMsg(UNLOCK_FAIL_MSG);
  writeLocal(U.seed, U.state);
  cloudPush();
}

export function scheduleSave() {
  if (U.state) {
    if (!Number.isInteger(U.state.schemaVersion)) U.state.schemaVersion = STATE_SCHEMA_VERSION;
    stampSave(U.state, Date.now());
  }
  saveDirty = true;
  if (saveQueued) return;
  saveQueued = true;
  runIdle(() => { saveQueued = false; flushSave(); });
}

// 對外名稱與呼叫方式不變（仍為無參數的 save()），內部改走排程寫入。
export function save() { scheduleSave(); }

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
}

// 旗標：雲端存檔的衝突處理（版本比較與確認覆寫）已完成，但後端 db 尚未接上；在正式啟用前預設關閉。
export const CLOUD_SAVE_ENABLED = false;

export async function initCloud() {
  if (!CLOUD_SAVE_ENABLED) return;
  try {
    const [dbns, user] = await Promise.all([useCap('db'), useCap('user')]);
    if (!dbns || !user) return;
    const uid = await user.id();
    if (!uid) return;
    U.cloud.db = dbns; U.cloud.uid = uid;
    U.cloud.snap = await dbns.collection('data/users/' + uid).doc('save').get();
  } catch (e) { U.cloud.db = null; }
  await checkCloudConflict();
  // 事件資料載入失敗時（U.events 為空）不得進入遊戲，錯誤畫面保留。
  if (!U.state && U.events && U.events.length) render();
}

export function cloudDoc() { return U.cloud.db.collection('data/users/' + U.cloud.uid).doc('save'); }

export function cloudPush() {
  if (!CLOUD_SAVE_ENABLED || !U.cloud.db || !U.cloud.uid || !U.state) return;
  // 與 src/save.js 的 v2 格式一致：{ version, savedAt(ISO), seed, state }
  const body = { ...serializeSave(U.state), seed: U.seed };
  // 寫入依序排隊，同一文件同時只有一筆寫入
  U.cloud.queue = U.cloud.queue.then(() => cloudDoc().set(body)).catch(() => {});
}

export function cloudSave() {
  return U.cloud.snap && U.cloud.snap.exists ? U.cloud.snap.data() : null;
}

// 雲端狀態提示文字（存檔對話框內顯示）。
export function cloudStatusText() {
  if (!CLOUD_SAVE_ENABLED) return '雲端存檔尚未啟用，目前僅使用本機自動存檔與手動匯出。';
  if (!U.cloud.db) return '雲端暫時無法連線，僅使用本機存檔。';
  const cs = cloudSave();
  return cs && Number.isFinite(cs.savedAt) ? `雲端已連線，最近存檔於 ${new Date(cs.savedAt).toLocaleString('zh-TW')}。` : '雲端已連線，尚無雲端存檔。';
}

// 載入時比較本機與雲端存檔；兩者不同時由玩家選擇（不自動覆寫）。
export async function checkCloudConflict() {
  const remote = cloudSave();
  const raw = load();
  if (!remote || !remote.state || !raw || !raw.state) return;
  const r = resolveConflict(raw.state, remote.state);
  if (!r.needsPrompt) return;
  const choice = await askConflict(raw.state, remote.state, r.winner);
  if (choice === 'remote') {
    U.seed = remote.seed !== undefined ? remote.seed : raw.seed; pruneNewYearKeys(U.seed);
    U.state = remote.state; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool());
    U.reviewedCount = (U.state.annals || []).length;
    U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.tab = 'palace';
    writeLocal(U.seed, U.state);
    saveMsg('已套用雲端存檔。');
  } else {
    // 玩家選本機：讓本機版本高於雲端，之後載入時本機即為較新，並推送雲端。
    const local = raw.state;
    local.saveVersion = Math.max(Number.isFinite(local.saveVersion) ? local.saveVersion : 0,
      Number.isFinite(remote.state.saveVersion) ? remote.state.saveVersion : 0);
    U.seed = raw.seed; pruneNewYearKeys(U.seed); U.state = local; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool());
    U.reviewedCount = (U.state.annals || []).length;
    save();
    saveMsg('已保留本機存檔並同步至雲端。');
  }
  render();
}

// 衝突對話框：設定 U.conflict，由 drawConflictModal 於每幀呈現；玩家選擇後 resolve。回傳 Promise<'local' | 'remote'>。
export function askConflict(local, remote, winner) {
  return new Promise(resolve => {
    U.conflict = { local, remote, winner, resolve };
  });
}

function conflictInfo(s) {
  let yr = '';
  try { yr = eraYearText(s); } catch (e) { yr = ''; }
  const at = Number.isFinite(s.savedAt) ? new Date(s.savedAt).toLocaleString('zh-TW') : '時間未知';
  return `${yr || '（進度未知）'}・版本 ${Number.isFinite(s.saveVersion) ? s.saveVersion : 0}・${at}`;
}

// 每幀呈現衝突對話框（由 render-nav 的頂欄繪製呼叫）。
export function drawConflictModal() {
  const cf = U.conflict;
  if (!cf) return false;
  modal(() => {
    const r = dialogRect(300);
    panel(r.x, r.y, r.w, r.h, { block: true });
    const U_ = C.U, pad = 18 * U_;
    text('存檔不一致', r.x + pad, r.y + pad, { size: 20 * U_, weight: 'bold', color: INK });
    const newer = cf.winner === 'remote' ? '雲端存檔較新' : '本機存檔較新';
    let y = r.y + pad + 36 * U_;
    y += text(`雲端與本機的存檔不同（${newer}）。請選擇要使用的存檔。`, r.x + pad, y, { size: 14 * U_, maxW: r.w - 2 * pad, color: INK }) + 8 * U_;
    y += text(`雲端：${conflictInfo(cf.remote)}\n本機：${conflictInfo(cf.local)}`, r.x + pad, y, { size: 13 * U_, maxW: r.w - 2 * pad, color: INK });
    const by = r.y + r.h - pad - 40 * U_, bw = (r.w - 2 * pad - 12 * U_) / 2;
    const pick = choice => () => { U.conflict = null; cf.resolve(choice); };
    button(r.x + pad, by, bw, 40 * U_, '用雲端', pick('remote'), { lac: false });
    button(r.x + pad + bw + 12 * U_, by, bw, 40 * U_, '用本機', pick('local'), { lac: true });
  }, () => {});
  return true;
}

// 讀取本機自動存檔：parseSave → migrateState → validateState。
// 回傳 null（無存檔）、{ seed, state, version }（有效）或 { corrupt: true, error, errors, raw }（損毀）。
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  const r = restoreSave(raw);
  if (!r.ok) return { corrupt: true, error: r.error, errors: r.errors, raw };
  if (r.version !== SAVE_VERSION) writeLocal(r.seed, r.state);
  return { seed: r.seed, state: r.state, version: r.version };
}

export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// 「開新局」於損毀存檔時使用：先另存備份，成功後才清除自動存檔。備份失敗則保留原檔並回傳 false。
export function discardCorruptSave(raw) {
  try { localStorage.setItem(CORRUPT_BACKUP_KEY, raw); }
  catch (e) { saveMsg('無法備份損毀存檔（儲存空間可能已滿），請先按「匯出損毀存檔」。'); return false; }
  clearSave();
  return true;
}

// ── 存檔匯出／匯入：引擎在 src/save.js；此處負責下載、讀檔與中文訊息。
export const SAVE_ERR = {
  invalid_json: '檔案不是存檔（無法解析）',
  future_version: '版本過新，請更新遊戲後再匯入',
  future_schema: '存檔的遊戲版本過新，請更新遊戲後再讀取',
  missing_seed: '存檔不完整（缺少種子）',
  invalid_shape: '檔案不是存檔（格式不符）',
  invalid_version: '檔案不是存檔（版本號無效）',
  invalid_alive: '存檔內容不完整（存活狀態無效）',
};
// 驗證錯誤代碼未列入 SAVE_ERR 者，統一顯示為格式不完整。
export const reasonText = code => SAVE_ERR[code] || '存檔內容不完整或格式錯誤';

// 存檔訊息：保存於 U.saveMsg，並以提示顯示（空字串清除）。
export function saveMsg(msg) {
  U.saveMsg = msg || '';
  if (msg) pushToast(msg);
}

// 備援：下載失敗或取消時，於存檔對話框提供「複製存檔碼」（不依賴 blob 下載）。
export function saveCopyFallback(text, note) {
  U.saveFallback = { text, note };
  U.saveOpen = true;
  saveMsg(note);
}

export async function exportGame() {
  if (!U.state) return saveMsg('尚無進行中的局，無法匯出。');
  let body, filename;
  try {
    body = exportSave({ ...U.state, seed: U.seed });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    filename = `kingmix-save-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  } catch (e) { return saveMsg('匯出失敗，請再試一次。'); }
  return saveTextFile(filename, body);
}

// 下載任意存檔字串（匯出存檔與匯出損毀存檔共用）。
export async function saveTextFile(filename, text) {
  // 優先走 claude.use('downloads')；不可用時退回 anchor 下載。
  let dl = null;
  try { dl = (globalThis.window && window.claude && window.claude.use) ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) {
    try {
      await dl.save({ filename, data: text });
      return saveMsg('已匯出存檔。');
    } catch (e) { return saveCopyFallback(text, '未完成匯出（已取消或無法儲存）。'); }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveMsg('已匯出存檔。');
  } catch (e) { saveCopyFallback(text, '下載失敗，改用備援。'); }
}

// 匯入：由 main.js 綁定隱藏的 <input type=file> 之 change 事件。
export function importGame(file) {
  if (U.pendingAction) return; // 蓋章進行中不匯入
  const reader = new FileReader();
  reader.onload = () => {
    const r = finalizeLoaded(importSave(String(reader.result)));
    if (!r.ok) return saveMsg(reasonText(r.error));
    loadState(r.seed, r.state);
    save(); render(); saveMsg('已匯入存檔。');
  };
  reader.onerror = () => saveMsg('匯入失敗：無法讀取檔案。');
  reader.readAsText(file);
}

// 將讀入的存檔設為目前進度（共用：匯入、欄位讀取、雲端／本機續玩）。
export function loadState(seed, state) {
  U.seed = seed; pruneNewYearKeys(U.seed); U.state = state; migrateEraLog(U.state); prepareMonth(U.state, currentEventPool());
  U.reviewedCount = (U.state.annals || []).length;
  U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.tab = 'palace';
}

// ── 多存檔欄位（3 格）：每格鍵為 kingmix-save-slot-N，格式同 src/save.js；自動存檔 kingmix-save-v1 不變。
export const SLOT_COUNT = 3;
export const slotKey = n => `kingmix-save-slot-${n}`;
export const slotRaw = n => { try { return localStorage.getItem(slotKey(n)); } catch (e) { return null; } };

export function slotLabel(n) {
  const raw = slotRaw(n);
  if (raw === null) return '空';
  const r = restoreSave(raw);
  if (!r.ok) return '無法讀取';
  try { return eraYearText(r.state); } catch (e) { return '無法讀取'; }
}

export function slotWrite(n) {
  try {
    const obj = serializeSave({ ...U.state, seed: U.seed });
    localStorage.setItem(slotKey(n), JSON.stringify(obj));
    U.slotPending = null;
    saveMsg(`已存到欄位 ${n}。`);
  } catch (e) { U.slotPending = null; saveMsg('存檔失敗，瀏覽器可能拒絕寫入。'); }
}

export function slotLoad(n) {
  if (U.pendingAction) return; // 蓋章進行中不讀檔
  const raw = slotRaw(n);
  if (raw === null) return saveMsg(`欄位 ${n} 是空的。`);
  const r = restoreSave(raw);
  if (!r.ok) return saveMsg(`欄位 ${n} 無法讀取（${reasonText(r.error)}）。`);
  U.slotPending = null;
  loadState(r.seed, r.state);
  save(); render(); saveMsg(`已讀取欄位 ${n}。`);
}

// 存檔按鈕行為（與舊版 slot-tools 相同）：未覆寫過即直存；已有內容須二次確認。
export function slotSaveClick(n) {
  if (!U.state) return saveMsg('尚無進行中的局，無法存檔。');
  if (slotRaw(n) !== null) { U.slotPending = n; return; }
  slotWrite(n);
}

// ── 存檔管理對話框（取代舊版頂欄的匯出／匯入與多存檔列）。
export function openSaveDialog() { U.saveOpen = true; }

export function drawSaveModal() {
  if (!U.saveOpen) return false;
  modal(() => {
    const U_ = C.U, pad = 16 * U_;
    const r = dialogRect(560);
    panel(r.x, r.y, r.w, r.h, { block: true });
    const x = r.x + pad, iw = r.w - 2 * pad;
    let y = r.y + pad;
    text('存檔管理', x, y, { size: 20 * U_, weight: 'bold', color: INK });
    y += 34 * U_;
    y += text(cloudStatusText(), x, y, { size: 13 * U_, maxW: iw, color: INK }) + 6 * U_;
    if (U.saveMsg) y += text(U.saveMsg, x, y, { size: 13 * U_, maxW: iw, color: '#8a1f22' }) + 6 * U_;
    if (U.saveFallback) {
      y += text(U.saveFallback.note, x, y, { size: 13 * U_, maxW: iw, color: INK }) + 6 * U_;
      const fb = U.saveFallback;
      button(x, y, iw, 36 * U_, '複製存檔碼', () => {
        const nav = globalThis.navigator;
        if (!nav || !nav.clipboard) return saveMsg('無法自動複製，請改用匯出存檔。');
        nav.clipboard.writeText(fb.text).then(() => saveMsg('已複製存檔碼，可貼到檔案保存。'), () => saveMsg('無法自動複製，請改用匯出存檔。'));
      }, { lac: true });
      y += 46 * U_;
    }
    const bw = (iw - 10 * U_) / 2;
    button(x, y, bw, 40 * U_, '匯出存檔', () => { exportGame(); }, { lac: true, off: !U.state, why: '尚無進行中的局，無法匯出。' });
    button(x + bw + 10 * U_, y, bw, 40 * U_, '匯入存檔', () => {
      const f = typeof document !== 'undefined' ? document.getElementById('imp-file') : null;
      if (f) f.click();
    }, { lac: false });
    y += 52 * U_;
    text('多存檔欄位', x, y, { size: 14 * U_, weight: 'bold', color: INK });
    y += 24 * U_;
    for (let n = 1; n <= SLOT_COUNT; n++) {
      const occupied = slotRaw(n) !== null;
      text(`欄位 ${n}：${slotLabel(n)}`, x, y + 10 * U_, { size: 13 * U_, color: INK });
      const bx = x + iw * 0.42, bwid = (iw * 0.58 - 8 * U_) / 2;
      if (U.slotPending === n) {
        text(`覆寫欄位 ${n}？`, x, y + 10 * U_ + 20 * U_, { size: 12 * U_, color: '#8a1f22' });
        button(bx, y, bwid, 36 * U_, '確定覆寫', () => slotWrite(n), { lac: true });
        button(bx + bwid + 8 * U_, y, bwid, 36 * U_, '取消', () => { U.slotPending = null; }, { lac: false });
      } else {
        button(bx, y, bwid, 36 * U_, `存到欄位 ${n}`, () => slotSaveClick(n), { lac: true });
        button(bx + bwid + 8 * U_, y, bwid, 36 * U_, `讀取欄位 ${n}`, () => slotLoad(n), { lac: false, off: !occupied, why: `欄位 ${n} 是空的。` });
      }
      y += 46 * U_;
    }
    button(x, r.y + r.h - pad - 40 * U_, iw, 40 * U_, '關閉', () => { U.saveOpen = false; U.saveFallback = null; }, { lac: false });
  }, () => { U.saveOpen = false; U.saveFallback = null; });
  return true;
}

function dialogRect(h) {
  const U_ = C.U;
  const w = Math.min(C.W - 24 * U_, 560 * U_);
  const hh = Math.min(C.H - 24 * U_, h * U_);
  return { x: (C.W - w) / 2, y: Math.max(12 * U_, (C.H - hh) / 2), w, h: hh };
}

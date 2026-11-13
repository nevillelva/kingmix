// web/ui/state-io.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { exportSave, importSave, parseSave, serializeSave } from '../../src/save.js';
import { eraYearText, migrateEraLog } from '../../src/era.js';
import { U } from './store.js';
import { esc, useCap } from './util.js';
import { render } from './render-nav.js';

export const SAVE_KEY = 'kingmix-save-v1';

export function save(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify({seed: U.seed, state: U.state})); }catch(e){} cloudPush(); }

// 旗標：雲端存檔尚未做衝突處理（多裝置同時寫入會互相覆蓋），完成衝突處理前預設關閉。
export const CLOUD_SAVE_ENABLED = false;

export async function initCloud(){
  if (!CLOUD_SAVE_ENABLED) return;
  try {
    const [dbns, user] = await Promise.all([useCap('db'), useCap('user')]);
    if (!dbns || !user) return;
    const uid = await user.id();
    if (!uid) return;
    U.cloud.db = dbns; U.cloud.uid = uid;
    U.cloud.snap = await dbns.collection('data/users/' + uid).doc('save').get();
  } catch (e) { U.cloud.db = null; }
  if (!U.state) render();
}

export function cloudDoc(){ return U.cloud.db.collection('data/users/' + U.cloud.uid).doc('save'); }

export function cloudPush(){
  if (!CLOUD_SAVE_ENABLED || !U.cloud.db || !U.cloud.uid || !U.state) return;
  const body = { savedAt: Date.now(), seed: U.seed, state: JSON.parse(JSON.stringify(U.state)) };
  // 寫入依序排隊，同一文件同時只有一筆寫入
  U.cloud.queue = U.cloud.queue.then(() => cloudDoc().set(body)).catch(() => {});
}

export function cloudSave(){
  return U.cloud.snap && U.cloud.snap.exists ? U.cloud.snap.data() : null;
}

export function load(){ try{ const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }

export function clearSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }

// ── 存檔匯出／匯入：引擎在 src/save.js；此處只負責下載、讀檔與中文訊息。
export const SAVE_ERR = {
  invalid_json: '檔案不是存檔（無法解析）',
  future_version: '版本過新，請更新遊戲後再匯入',
  missing_seed: '存檔不完整（缺少種子）',
  invalid_shape: '檔案不是存檔（格式不符）',
  invalid_version: '檔案不是存檔（版本號無效）',
  invalid_alive: '存檔內容不完整（存活狀態無效）',
};

export function saveMsg(text){ const m = document.getElementById('save-msg'); if (m) m.textContent = text; }

export async function exportGame(){
  if (!U.state) return saveMsg('尚無進行中的局，無法匯出。');
  let text, filename;
  try {
    text = exportSave({ ...U.state, seed: U.seed });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    filename = `kingmix-save-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  } catch (e) { return saveMsg('匯出失敗，請再試一次。'); }
  // Artifacts 內 blob 下載無效，優先走 claude.use('downloads')；不可用時退回原本的 anchor 下載。
  let dl = null;
  try { dl = (window.claude && window.claude.use) ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) {
    try {
      await dl.save({ filename, data: text });
      return saveMsg('已匯出存檔。');
    } catch (e) { return saveMsg('未完成匯出（已取消或無法儲存）。'); }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    saveMsg('已匯出存檔。');
  } catch (e) { saveMsg('匯出失敗，請再試一次。'); }
}

export function importGame(file){
  const reader = new FileReader();
  reader.onload = () => {
    const r = importSave(String(reader.result));
    if (!r.ok) return saveMsg(SAVE_ERR[r.error] || '匯入失敗：無法讀取存檔。');
    U.seed = r.seed; U.state = r.state; migrateEraLog(U.state);
    U.reviewedCount = (U.state.annals || []).length;
    U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.tab = 'palace';
    save(); render(); saveMsg('已匯入存檔。');
  };
  reader.onerror = () => saveMsg('匯入失敗：無法讀取檔案。');
  reader.readAsText(file);
}

// ── 多存檔欄位（3 格）：每格鍵為 kingmix-save-slot-N，格式同 src/save.js；自動存檔 kingmix-save-v1 不變。
export const SLOT_COUNT = 3;

export const slotKey = n => `kingmix-save-slot-${n}`;

 // 等待確認覆寫的欄位編號
export const slotRaw = n => { try { return localStorage.getItem(slotKey(n)); } catch (e) { return null; } };

export function slotLabel(n){
  const raw = slotRaw(n);
  if (raw === null) return '空';
  const r = parseSave(raw);
  if (!r.ok) return '無法讀取';
  try { return eraYearText(r.state); } catch (e) { return '無法讀取'; }
}

export function paintSlots(){
  const box = document.getElementById('slot-tools');
  if (!box) return;
  const rows = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const occupied = slotRaw(n) !== null;
    const confirm = U.slotPending === n
      ? `<span class="slot-confirm">覆寫欄位 ${n}？<button type="button" class="snd" data-slot-ok="${n}">確定覆寫</button><button type="button" class="snd" data-slot-cancel="${n}">取消</button></span>`
      : '';
    rows.push(`<div class="slot-row"><span class="slot-name">欄位 ${n}：${esc(slotLabel(n))}</span>`
      + `<button type="button" class="snd" data-slot-save="${n}">存到欄位 ${n}</button>`
      + `<button type="button" class="snd" data-slot-load="${n}"${occupied ? '' : ' disabled'}>讀取欄位 ${n}</button>${confirm}</div>`);
  }
  box.innerHTML = rows.join('');
}

export function slotWrite(n){
  try {
    const obj = serializeSave({ ...U.state, seed: U.seed });
    localStorage.setItem(slotKey(n), JSON.stringify(obj));
    U.slotPending = null; paintSlots();
    saveMsg(`已存到欄位 ${n}。`);
  } catch (e) { U.slotPending = null; paintSlots(); saveMsg('存檔失敗，瀏覽器可能拒絕寫入。'); }
}

export function slotLoad(n){
  const raw = slotRaw(n);
  if (raw === null) return saveMsg(`欄位 ${n} 是空的。`);
  const r = parseSave(raw);
  if (!r.ok) return saveMsg(`欄位 ${n} 無法讀取（${SAVE_ERR[r.error] || '存檔損毀'}）。`);
  U.seed = r.seed; U.state = r.state; migrateEraLog(U.state);
  U.reviewedCount = (U.state.annals || []).length;
  U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.tab = 'palace';
  save(); render(); paintSlots(); saveMsg(`已讀取欄位 ${n}。`);
}

// web/ui/state-io.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { exportSave, importSave, parseSave, serializeSave } from '../../src/save.js';
import { resolveConflict, stampSave } from '../../src/conflict.js';
import { eraYearText, migrateEraLog } from '../../src/era.js';
import { U } from './store.js';
import { esc, useCap } from './util.js';
import { render } from './render-nav.js';

export const SAVE_KEY = 'kingmix-save-v1';

// 寫入本機（不蓋版本、不推送雲端）。
function writeLocal(seed, state){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify({seed, state})); }catch(e){} }

export function save(){
  if (U.state) stampSave(U.state, Date.now());
  writeLocal(U.seed, U.state);
  cloudPush();
}

// 旗標：雲端存檔的衝突處理（版本比較與確認覆寫）已完成，但後端 db 尚未接上；在正式啟用前預設關閉。
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
  await checkCloudConflict();
  if (!U.state) render();
}

export function cloudDoc(){ return U.cloud.db.collection('data/users/' + U.cloud.uid).doc('save'); }

export function cloudPush(){
  if (!CLOUD_SAVE_ENABLED || !U.cloud.db || !U.cloud.uid || !U.state) return;
  // 與 src/save.js 的 v2 格式一致：{ version, savedAt(ISO), seed, state }
  const body = { ...serializeSave(U.state), seed: U.seed };
  // 寫入依序排隊，同一文件同時只有一筆寫入
  U.cloud.queue = U.cloud.queue.then(() => cloudDoc().set(body)).catch(() => {});
}

export function cloudSave(){
  return U.cloud.snap && U.cloud.snap.exists ? U.cloud.snap.data() : null;
}

// 載入時比較本機與雲端存檔；兩者不同時由玩家選擇（較新者以標籤標示，不自動覆寫）。
export async function checkCloudConflict(){
  const remote = cloudSave();
  const raw = load();
  if (!remote || !remote.state || !raw || !raw.state) return;
  const r = resolveConflict(raw.state, remote.state);
  if (!r.needsPrompt) return;
  const choice = await askConflict(raw.state, remote.state, r.winner);
  if (choice === 'remote') {
    U.seed = remote.seed !== undefined ? remote.seed : raw.seed;
    U.state = remote.state; migrateEraLog(U.state);
    U.reviewedCount = (U.state.annals || []).length;
    U.panel = null; U.pick1 = null; U.feedback = ''; U.reviewPage = 'score'; U.tab = 'palace';
    writeLocal(U.seed, U.state);
    saveMsg('已套用雲端存檔。');
  } else {
    // 玩家選本機：讓本機版本高於雲端，之後載入時本機即為較新，並推送雲端。
    const local = raw.state;
    local.saveVersion = Math.max(Number.isFinite(local.saveVersion) ? local.saveVersion : 0,
      Number.isFinite(remote.state.saveVersion) ? remote.state.saveVersion : 0);
    U.seed = raw.seed; U.state = local; migrateEraLog(U.state);
    U.reviewedCount = (U.state.annals || []).length;
    save();
    saveMsg('已保留本機存檔並同步至雲端。');
  }
  render();
}

// 確認覆寫的頁內對話框（沿用 overlays 的 .dlg-ov / .dlg 版型，不修改 overlays.js）。回傳 Promise<'local' | 'remote'>。
export function askConflict(local, remote, winner){
  const info = s => {
    let yr = '';
    try { yr = eraYearText(s); } catch (e) { yr = ''; }
    const at = Number.isFinite(s.savedAt) ? new Date(s.savedAt).toLocaleString('zh-TW') : '時間未知';
    return `${esc(yr || '（進度未知）')}・版本 ${Number.isFinite(s.saveVersion) ? s.saveVersion : 0}・${esc(at)}`;
  };
  const newerLabel = winner === 'remote' ? '雲端存檔較新' : '本機存檔較新';
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-ov';
    ov.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-d">
        <h2 id="cf-t">存檔不一致</h2>
        <p id="cf-d">雲端與本機的存檔不同（${esc(newerLabel)}）。請選擇要使用的存檔。</p>
        <p class="sub">雲端：${info(remote)}<br>本機：${info(local)}</p>
        <div class="dlg-btns"><button type="button" class="btn ghost mini" data-cf="remote">用雲端</button>
          <button type="button" class="btn zhu mini" data-cf="local">用本機</button></div>
      </div>`;
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-cf]');
      if (!b) return;
      ov.remove();
      resolve(b.dataset.cf);
    });
    document.body.appendChild(ov);
    ov.querySelector(`[data-cf="${winner === 'remote' ? 'remote' : 'local'}"]`).focus();
  });
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

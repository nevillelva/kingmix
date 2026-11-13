// web/ui/overlays.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { eraYearText } from '../../src/era.js';
import { U } from './store.js';
import { esc } from './util.js';
import { finishMonth } from './game-flow.js';
import { sfx } from './audio.js';

// ── 新手提要：僅新局首月顯示；關閉後寫入 localStorage（失敗則本次工作階段內隱藏）
export const GUIDE_KEY = 'kingmix-guide-v1';

export function guideDismissed(){ try { return localStorage.getItem(GUIDE_KEY) !== null; } catch (e) { return false; } }

export function guideMount(){
  if (!U.guideArmed || !U.state) return;
  if (!U.state.alive || U.state.month !== 1 || guideDismissed()) { U.guideArmed = false; return; }
  const app = document.getElementById('app');
  if (!app || app.querySelector('.guide')) return;
  app.insertAdjacentHTML('afterbegin', `<section class="card guide" role="region" aria-label="新手提要">
    <h2>初入宮城・御前提要</h2>
    <ul>
      <li><b>奏摺</b>：早朝臣子呈上奏摺，點選或左右滑動即可裁決，每一道批示都會留下後果。</li>
      <li><b>太和殿</b>：朝政奏摺處理之所，待批件數顯示於此，亦可在此快進。</li>
      <li><b>快進</b>：於太和殿連續推進至多 12 個月，奏摺由系統代為批閱，遇大事即停。</li>
      <li><b>時段</b>：一日分早朝、午後與夜間。早朝批閱奏摺；午後三選一、夜間二選一，行動有限，不可盡取。</li>
    </ul>
    <button type="button" class="btn ghost guide-x">知道了</button></section>`);
  app.querySelector('.guide-x').onclick = () => {
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
    U.guideArmed = false;
    app.querySelector('.guide')?.remove();
  };
}

// 禪位確認：頁內對話框（不使用 confirm()），取消或按 Esc 即關閉；確認後結束本世，由太子或成年皇子即位。
export function openResignDialog(){
  const heir = U.state.dynasty.crownPrince ? U.state.heirs.find(h => h.id === U.state.dynasty.crownPrince) : null;
  const who = heir ? `太子${esc(heir.personName || heir.name)}` : '成年皇子中擇定之人';
  const ov = document.createElement('div');
  ov.className = 'dlg-ov';
  ov.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
      <h2 id="dlg-t">禪位予皇子</h2>
      <p id="dlg-d">禪位即結束本世，由${who}即位。此舉不可復原，史冊將記下此次禪位。</p>
      <div class="dlg-btns"><button type="button" class="btn ghost mini" data-dlg="cancel">取消</button>
        <button type="button" class="btn zhu mini" data-dlg="ok">確認禪位</button></div>
    </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', e => {
    if (e.target === ov) return close();
    const b = e.target.closest('[data-dlg]');
    if (!b) return;
    if (b.dataset.dlg === 'cancel') return close();
    close();
    confirmResign();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  ov.querySelector('[data-dlg="cancel"]').focus();
}

export function confirmResign(){
  if (!U.state || !U.state.alive) return;
  U.state.campaign = null;
  U.state.alive = false; U.state.endReason = '禪位';
  U.feedback = '';
  finishMonth();
}

// ── 新年年號覆蓋層：每逢一月第一次進入時顯示，點擊或 Esc 關閉；每局每年一次。改元時亦即時顯示 ──
export const shownNewYear = new Set();

export function newYearKey(){ return `kingmix.newyear.${U.seed}.${U.state.year}`; }

export function markNewYearShown(){
  const key = newYearKey();
  shownNewYear.add(key);
  try { localStorage.setItem(key, '1'); } catch (e) {}
}

export function openNianhao(title, sub){
  const ov = document.createElement('div');
  ov.className = 'nianhao';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', '年號');
  ov.innerHTML = `<div class="nh-card">
      <div class="nh-kicker">第${U.state.dynasty.generation}世 · ${U.state.year}年</div>
      <div class="nh-title">${esc(title)}</div>
      <div class="nh-sub">${esc(sub)}</div>
      <button type="button" class="btn zhu nh-close">點擊繼續</button></div>`;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  ov.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  sfx('bell');
  ov.querySelector('.nh-close').focus();
}

export function showNewYear(){
  if (!U.state || !U.state.alive || U.state.month !== 1) return;
  const key = newYearKey();
  if (shownNewYear.has(key)) return;
  shownNewYear.add(key);
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
  openNianhao(eraYearText(U.state), '新歲伊始，萬象更新。');
}

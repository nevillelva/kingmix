// web/ui/main.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U, app } from './store.js';
import { SOUND_KEY, paintSnd, sfx, stopBgm, unlockAudio } from './audio.js';
import { onAgency, onSlot } from './render-court.js';
import { render } from './render-nav.js';
import { onSideToggle } from './render-side.js';
import { exportGame, importGame, initCloud, paintSlots, saveMsg, slotLoad, slotRaw, slotWrite } from './state-io.js';

try { U.soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch(e) {}

['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

document.getElementById('snd').onclick = () => {
  U.soundOn = !U.soundOn;
  try { localStorage.setItem(SOUND_KEY, U.soundOn ? 'on' : 'off'); } catch(e) {}
  paintSnd();
  if (U.soundOn) { unlockAudio(); sfx('pick'); } else stopBgm();
};

// ── 飄雪：預先建立，冬季才顯示；位置由固定參數決定（不隨機），減少動態時靜止 ──
(function initSnow(){
  const box = document.getElementById('snow');
  for (let i = 0; i < 24; i++) {
    const f = document.createElement('i');
    f.style.setProperty('--x', ((i * 37) % 100) + '%');
    f.style.setProperty('--y', ((i * 53) % 100) + '%');
    f.style.setProperty('--s', (3 + (i % 4)) + 'px');
    f.style.animationDuration = (10 + (i % 7) * 2) + 's';
    f.style.animationDelay = (-(i % 9)) + 's';
    box.appendChild(f);
  }
})();

app.addEventListener('click', onAgency);

app.addEventListener('click', onSlot);

document.getElementById('side-toggle').onclick = onSideToggle;

document.getElementById('legacy-btn').onclick = () => { U.tab = 'legacy'; U.panel = null; U.pick1 = null; render(); };

document.getElementById('gallery-btn').onclick = () => { U.tab = 'gallery'; U.panel = null; U.pick1 = null; render(); };

document.getElementById('exp').onclick = exportGame;

document.getElementById('imp').onclick = () => document.getElementById('imp-file').click();

document.getElementById('imp-file').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) importGame(f);
};

document.getElementById('slot-tools').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.slotSave) {
    const n = Number(d.slotSave);
    if (!U.state) return saveMsg('尚無進行中的局，無法存檔。');
    if (slotRaw(n) !== null) { U.slotPending = n; return paintSlots(); }
    return slotWrite(n);
  }
  if (d.slotOk) return slotWrite(Number(d.slotOk));
  if (d.slotCancel) { U.slotPending = null; return paintSlots(); }
  if (d.slotLoad) { U.slotPending = null; return slotLoad(Number(d.slotLoad)); }
});

paintSlots();

paintSnd();

// 舊格式新年鍵 kingmix.newyear.<seed>.<year>（值為 '1'）於開機時清除；每種子一鍵 kingmix.newyear.<seed> 保留。
function purgeLegacyNewYearKeys(){
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('kingmix.newyear.') && /\.\d+$/.test(k.slice('kingmix.newyear.'.length)) && localStorage.getItem(k) === '1') dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}
purgeLegacyNewYearKeys();

let eventsOk = false;
try {
  const ev = (await (await fetch('../data/events.json')).json()).events;
  if (Array.isArray(ev) && ev.length > 0) { U.events = ev; eventsOk = true; }
} catch (e) { eventsOk = false; }

// 首屏載入提示：render() 完成後（或錯誤橫幅顯示後）移除；失敗路徑不得覆蓋錯誤橫幅。
const removeBootHint = () => document.getElementById('boot-loading')?.remove();

if (!eventsOk) {
  // 事件資料無法使用時不進入遊戲，於頁面顯示錯誤橫幅。
  U.events = [];
  app.innerHTML = '<div role="alert" class="card" style="color:var(--vermilion);margin-top:24px">事件資料載入失敗，請檢查 data/events.json</div>';
  removeBootHint();
} else {
  try { render(); } finally { removeBootHint(); }
}

initCloud();

// web/ui/main.js：皇帝養成綜合版網頁介面（Canvas 版入口）。
// 開機：綁定畫布 → 音效偏好與解鎖 → 清除舊格式新年鍵 → 載入事件資料 → 進入畫面（或顯示錯誤畫面）→ 雲端初始化。
import { U } from './store.js';
import { initCanvas, registerScreen, setScreen, C } from './canvas/core.js';
import { text } from './canvas/widgets.js';
import { INK } from './canvas/theme.js';
import { SOUND_KEY, unlockAudio } from './audio.js';
import { importGame, initCloud } from './state-io.js';
import { render } from './render-nav.js'; // 載入即註冊頂欄、底欄與畫面分派
// 各代理的畫面模組於載入時登記自己的畫面名稱。
import './render-palace.js';
import './render-map.js';
import './render-facility.js';
import './canvas/harem.js';
import './canvas/fate.js';

// 舊格式新年鍵 kingmix.newyear.<seed>.<year>（值為 '1'）於開機時清除；每種子一鍵 kingmix.newyear.<seed> 保留。
function purgeLegacyNewYearKeys() {
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('kingmix.newyear.') && /\.\d+$/.test(k.slice('kingmix.newyear.'.length)) && localStorage.getItem(k) === '1') dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

const centerText = (msg) => {
  text(msg, C.W / 2, C.H / 2 - 10, { size: 15 * C.U, color: INK, align: 'center', maxW: C.W - 40 });
};

registerScreen('boot', () => centerText('載入中…'));
registerScreen('bootError', () => {
  text(U.bootError || '載入失敗', C.W / 2, C.H / 2 - 20, { size: 16 * C.U, color: '#8a1f22', align: 'center', maxW: C.W - 40 });
});

const canvas = document.getElementById('game');
initCanvas(canvas);
setScreen('boot');

try { U.soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

const impFile = document.getElementById('imp-file');
if (impFile) {
  impFile.onchange = e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importGame(f);
  };
}

purgeLegacyNewYearKeys();

let eventsOk = false;
try {
  const ev = (await (await fetch('../data/events.json')).json()).events;
  if (Array.isArray(ev) && ev.length > 0) { U.events = ev; eventsOk = true; }
} catch (e) { eventsOk = false; }

if (!eventsOk) {
  // 事件資料無法使用時不進入遊戲，畫面顯示錯誤。
  U.events = [];
  U.bootError = '事件資料載入失敗，請檢查 data/events.json';
  setScreen('bootError');
} else {
  render();
}

initCloud();

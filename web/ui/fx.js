// web/ui/fx.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U } from './store.js';
import { reduceMotion } from './util.js';
import { SEASON } from './labels.js';

export function stampThen(el, fn){
  if (U.stamping) return;
  if (!el || reduceMotion()) return fn();
  U.stamping = true;
  el.classList.add('stamping');
  const seal = document.createElement('span');
  seal.className = 'zhu-stamp'; seal.setAttribute('aria-hidden', 'true'); seal.textContent = '批';
  el.appendChild(seal);
  setTimeout(() => { U.stamping = false; fn(); }, 520);
}

export function applySeason(){
  const s = U.state ? SEASON[U.state.month] : null;
  if (s) document.documentElement.dataset.season = s; else delete document.documentElement.dataset.season;
  document.getElementById('snow').hidden = s !== 'winter';
}

export function inkFlash(key){
  if (key === U.lastScreen) return;
  const first = U.lastScreen === null;
  U.lastScreen = key;
  if (first || reduceMotion()) return;
  const ink = document.getElementById('ink');
  ink.classList.remove('go'); void ink.offsetWidth; ink.classList.add('go');
}

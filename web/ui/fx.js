// web/ui/fx.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U } from './store.js';
import { reduceMotion } from './util.js';
import { SEASON } from './labels.js';
import { render } from './render-bus.js';

// 回合鍵：年與月（同一月內的操作共用同一回合）。
export const turnKey = (s) => (s ? `${s.year}-${s.month}` : null);

// 蓋章到期時是否仍應裁決：必須是點擊當下的同一局（state 參考相同）且仍在同一回合。純函式，便於測試。
export function shouldCommit(currentState, snapshot){
  if (!currentState || !snapshot) return false;
  return currentState === snapshot.state && turnKey(currentState) === snapshot.turn;
}

// 玩家操作的蓋章動畫：期間 U.pendingAction 為 'stamp'，其餘玩家操作入口見到非 null 即忽略。
// 到期時先清除 pendingAction 再執行 fn（否則 fn 自身的入口檢查會把自己擋下）；局面已變則放棄並重繪。
export function stampThen(el, fn){
  if (U.pendingAction) return;
  if (!el || reduceMotion()) return fn();
  const snapshot = { state: U.state, turn: turnKey(U.state) };
  U.pendingAction = 'stamp';
  el.classList.add('stamping');
  const seal = document.createElement('span');
  seal.className = 'zhu-stamp'; seal.setAttribute('aria-hidden', 'true'); seal.textContent = '批';
  el.appendChild(seal);
  setTimeout(() => {
    const ok = shouldCommit(U.state, snapshot);
    U.pendingAction = null;
    if (!ok) return render();
    fn();
  }, 520);
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

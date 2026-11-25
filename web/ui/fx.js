// web/ui/fx.js：動效（Canvas）。蓋章、季節（雪）、墨跡轉場與粒子系統。
// DOM 路徑（傳入元素時）保留，供尚未切換的呼叫端使用；Canvas 路徑以矩形傳入（{x,y,w,h}）。
// 每幀繪製由 drawFx(C) 統一處理，core 須於 takeModal 前呼叫（待 A 接線）。
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

export const STAMP_MS = 520;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const stamps = []; // Canvas 蓋章：{ x, y, w, h, t0 }

// 玩家操作的蓋章動畫：期間 U.pendingAction 為 'stamp'，其餘玩家操作入口見到非 null 即忽略。
// el 為 DOM 元素（舊路徑）或 {x,y,w,h} 矩形（Canvas）。到期時先清除 pendingAction 再執行 fn；局面已變則放棄並重繪。
export function stampThen(el, fn){
  if (U.pendingAction) return;
  if (!el || reduceMotion()) return fn();
  const snapshot = { state: U.state, turn: turnKey(U.state) };
  U.pendingAction = 'stamp';
  let stamp = null;
  if (typeof el.classList?.add === 'function') {
    el.classList.add('stamping');
    const seal = document.createElement('span');
    seal.className = 'zhu-stamp'; seal.setAttribute('aria-hidden', 'true'); seal.textContent = '批';
    el.appendChild(seal);
  } else {
    stamp = { x: el.x, y: el.y, w: el.w, h: el.h, t0: nowMs() };
    stamps.push(stamp);
  }
  setTimeout(() => {
    const ok = shouldCommit(U.state, snapshot);
    U.pendingAction = null;
    if (stamp) { const i = stamps.indexOf(stamp); if (i >= 0) stamps.splice(i, 1); }
    if (!ok) return render();
    fn();
  }, STAMP_MS);
}

// 繪製蓋章（朱印由大而縮，末段淡出）。
export function drawStamps(C){
  const ctx = C.ctx; if (!ctx) return;
  const now = nowMs();
  for (const s of stamps) {
    const t = Math.min(1, (now - s.t0) / STAMP_MS);
    const scale = 1 + (1 - Math.min(1, t * 2.5)) * 0.6;
    const d = Math.min(s.w, s.h) * 0.7 * scale;
    ctx.save();
    ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
    ctx.fillStyle = 'rgba(163,38,42,.85)';
    ctx.fillRect(s.x + s.w / 2 - d / 2, s.y + s.h / 2 - d / 2, d, d);
    ctx.fillStyle = '#f6e6b8'; ctx.font = `bold ${Math.round(d * 0.6)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('批', s.x + s.w / 2, s.y + s.h / 2);
    ctx.restore();
  }
}

// 季節：依月份決定（沿用 labels.SEASON）。DOM 存在時同步 html[data-season] 與雪景開關。
let season = null;
export function currentSeason(){ return U.state ? SEASON[U.state.month] || null : null; }
export function applySeason(){
  const s = U.state ? SEASON[U.state.month] : null;
  season = s || null;
  if (typeof document !== 'undefined' && document.documentElement) {
    if (s) document.documentElement.dataset.season = s; else delete document.documentElement.dataset.season;
    const snow = document.getElementById?.('snow');
    if (snow) snow.hidden = s !== 'winter';
  }
}

// 雪景（冬季）：固定數量的雪花，依 C.T 緩慢飄落。
const FLAKES = 36;
function drawSnow(C){
  if (season !== 'winter' || !C.ctx) return;
  const ctx = C.ctx, W = C.W, H = C.H, T = C.T || 0;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < FLAKES; i++) {
    const x = ((i * 97.3 + T * 18 * (1 + (i % 3) * 0.3)) % (W + 20)) - 10;
    const y = ((i * 53.7 + T * 34 * (1 + (i % 4) * 0.2)) % (H + 20)) - 10;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, 7); ctx.fill();
  }
  ctx.restore();
}

// 墨跡轉場：換畫面時自上而下掃過一道墨影（約 0.6 秒）。
const INK_MS = 600;
let inkT0 = null;
export function inkFlash(key){
  if (key === U.lastScreen) return;
  const first = U.lastScreen === null;
  U.lastScreen = key;
  if (first || reduceMotion()) return;
  const ink = typeof document !== 'undefined' && document.getElementById ? document.getElementById('ink') : null;
  if (ink && typeof ink.classList?.add === 'function') { ink.classList.remove('go'); void ink.offsetWidth; ink.classList.add('go'); return; }
  inkT0 = nowMs();
}
function drawInk(C){
  if (inkT0 === null || !C.ctx) return;
  const t = (nowMs() - inkT0) / INK_MS;
  if (t >= 1) { inkT0 = null; return; }
  const ctx = C.ctx, H = C.H, W = C.W;
  const y = t * (H + 40) - 40;
  ctx.save();
  ctx.fillStyle = `rgba(28,26,23,${0.35 * (1 - t)})`;
  ctx.fillRect(0, 0, W, Math.max(0, y));
  ctx.fillStyle = `rgba(230,185,79,${0.6 * (1 - t)})`;
  ctx.fillRect(0, Math.max(0, y), W, 2);
  ctx.restore();
}

// 每幀統一繪製（蓋章、雪景、墨跡）。對話框由 dialog.js 的 drawDialogs 另行登記。
export function drawFx(C){
  drawSnow(C);
  drawInk(C);
  drawStamps(C);
}

// ── Canvas 粒子系統：沿用 皇帝成長_v2 的 burst／stepParticles／drawParticles（金光環、花瓣、飄字、煙）。
// 以工廠函式建立獨立實例（無全域 P 陣列），隨機源與畫布尺寸可注入，便於測試。
// opts: { random, W, H }；step 的 ambient 為真時才會於畫面上方補充花瓣（對應 v2 的 scene !== 'end'）。
export function createParticles({ random = Math.random, W = 0, H = 0 } = {}) {
  const P = [];

  // 金光迸發：n 顆金點依隨機角度向外散開，外加一圈擴散光環（v2 burst）。
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = random() * 6.283, sp = 40 + 90 * random();
      P.push({ k: 'gold', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.6 + random() * 0.7, r: 1.5 + random() * 2.5 });
    }
    P.push({ k: 'ring', x, y, vx: 0, vy: 0, life: 0, max: 0.6, r: 4 });
  }

  // 飄字：數值變動時於指定位置上飄（負向為紅、正向為綠；ty／tox 為增加即不利，與 v2 floatDelta 相同）。
  function floatDelta(x, y, d, { badWhenPositive = false } = {}) {
    const bad = badWhenPositive ? d > 0 : d < 0;
    P.push({ k: 'txt', x, y, vx: 0, vy: 22, life: 0, max: 1.6, txt: (d > 0 ? '+' : '') + d, c: bad ? '#ff6a5a' : '#8fe8a8' });
  }

  // 逐幀推進（dt 秒）：到期或落出畫面即移除；花瓣受風擺動，其餘粒子逐漸減速（v2 stepParticles）。
  function step(dt, { ambient = false, T = 0 } = {}) {
    if (ambient && P.length < 70 && random() < 0.2) {
      P.push({ k: 'petal', x: random() * W * 1.2, y: -10, vx: -22 - random() * 20, vy: 30 + random() * 30, life: 0, max: 14, r: 3 + random() * 2.5, ph: random() * 6 });
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.life > p.max || p.y > H + 20) { P.splice(i, 1); continue; }
      if (p.k === 'petal') { p.x += (p.vx + Math.sin(T * 2 + p.ph) * 20) * dt; p.y += p.vy * dt; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; if (p.k !== 'txt') { p.vx *= 0.97; p.vy *= 0.97; } }
    }
  }

  // 繪製（ctx 為 2D 上下文；T 為動畫時間）。文字粒子以 px 字號繪製，描邊同 v2。
  function draw(ctx, { T = 0 } = {}) {
    for (const p of P) {
      const t = p.life / p.max, X = p.x, Y = p.y;
      if (p.k === 'petal') {
        ctx.save(); ctx.translate(X, Y); ctx.rotate(T * 2 + p.ph); ctx.fillStyle = 'rgba(244,150,175,.8)';
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 7); ctx.fill(); ctx.restore();
      } else if (p.k === 'gold') {
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, p.r * 3);
        g.addColorStop(0, 'rgba(255,225,140,' + (1 - t) + ')'); g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, p.r * 3, 0, 7); ctx.fill();
      } else if (p.k === 'ring') {
        ctx.strokeStyle = 'rgba(255,225,140,' + (0.7 * (1 - t)) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X, Y, 6 + t * 44, 0, 7); ctx.stroke();
      } else if (p.k === 'smoke') {
        const r = p.r * (1 + t * 3); ctx.fillStyle = 'rgba(235,230,220,' + (0.45 * (1 - t)) + ')';
        ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill();
      } else if (p.k === 'txt') {
        ctx.globalAlpha = 1 - t * t; ctx.fillStyle = p.c; ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = 'rgba(30,8,8,.9)'; ctx.lineWidth = 3;
        ctx.strokeText(p.txt, X, Y); ctx.fillText(p.txt, X, Y); ctx.globalAlpha = 1;
      }
    }
  }

  return { list: P, burst, floatDelta, step, draw };
}



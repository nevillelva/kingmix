// web/ui/render-nav.js：Canvas 版總導覽。負責頂欄（國勢、日期、章節、功能鈕）、底欄（分頁）與畫面分派。
// 分派規則：未開局→'start'；已駕崩→'ending'；歷代／圖鑑→'legacy'／'gallery'；待批年終考評→'review'；其餘→U.tab（朝堂 court、後宮 harem…）。
// 各畫面由負責代理以 registerScreen(名稱, drawFn) 登記；未登記者不繪製內容。
import { eraYearText } from '../../src/era.js';
import { milestoneFor } from '../../src/milestones.js';
import { sideEventsEnabled, setSideEventsEnabled } from '../../src/side-events.js';
import { SEASON, STAT, TOP_GAUGES } from './labels.js';
import { U } from './store.js';
import { setRenderer } from './render-bus.js';
import { recordLegacyOnce } from './render-legacy.js';
import { levelWord, pctOf } from './util.js';
import { save, drawSaveModal, drawConflictModal, openSaveDialog } from './state-io.js';
import { C, registerChrome, registerOverlay, registerScreen, setScreen, currentScreen, pushToast } from './canvas/core.js';
import { keepOverlays, paintPendingEncounter } from './render-side.js';
import { drawCourt, drawReview, reviewPending } from './render-court.js';
import { campaignActive } from './game-flow.js';
import { bar, button, seal, text } from './canvas/widgets.js';
import { GOLD, INK, SEASON_TINT } from './canvas/theme.js';
import { drawSoundToggle } from './audio.js';
import { guideMount, showNewYear } from './overlays.js';
import { showQuarterCard } from './render-quarter.js';
import { drawOfficials, drawDC, drawThrone } from './render-officials.js';
import './render-campaign.js'; // 登記戰役畫面（'campaign'）
import { renderStart } from './render-start.js';
import { renderEnding } from './render-ending.js';

// 底部分頁（不含宮城；宮城由殿宇頁頂端的「← 返回宮城」返回）。
const BAR = [
  { t: 'court', n: '朝堂', g: '朝' },
  { t: 'harem', n: '後宮', g: '宮' },
  { t: 'map', n: '輿圖', g: '輿' },
  { t: 'dc', n: '東廠', g: '廠' },
  { t: 'throne', n: '史冊', g: '史' },
];

const TAB_TOP = 56; // 分頁列高度（單位 U 之前的基準值）

function calendarText() {
  return `第${U.state.dynasty.generation}世 · ${eraYearText(U.state)}${U.state.month}月 · ${U.state.age}歲`;
}

// 章節名稱（頂欄）；章節變動時短訊告知（同一局內首次繪製不發訊）。
function milestoneText() {
  if (!U.state || !U.state.alive) return '';
  return milestoneFor(U.state).title;
}

function showsNav() {
  return !!(U.state && U.state.alive && currentScreen() !== 'start');
}

// 頂欄功能鈕：音效、側線奇遇、歷代帝王、圖鑑、存檔。回傳 [{key,label,w,onClick,...}]。
function topButtons() {
  const sideOn = U.state ? sideEventsEnabled(U.state) : true;
  return [
    { key: 'snd', label: U.soundOn ? '音效：開' : '音效：關', on: U.soundOn },
    { key: 'side', label: `側線奇遇：${sideOn ? '開' : '關'}`, on: sideOn, off: !U.state, why: '尚未開局', onClick: onSideToggle },
    { key: 'legacy', label: '歷代帝王', onClick: () => { U.tab = 'legacy'; U.panel = null; U.pick1 = null; render(); } },
    { key: 'gallery', label: '圖鑑', onClick: () => { U.tab = 'gallery'; U.panel = null; U.pick1 = null; render(); } },
    { key: 'save', label: '存檔', onClick: openSaveDialog, lac: true },
  ];
}

// 依寬度換行排列按鈕；dry 為真時只計算高度。回傳 { h }。
function flowButtons(items, x, y, maxW, paint) {
  const U_ = C.U, bh = 30 * U_, gap = 6 * U_;
  let cx = x, cy = y;
  for (const it of items) {
    const w = Math.max(64 * U_, it.label.length * 15 * U_ + 26 * U_);
    if (cx > x && cx + w > x + maxW) { cx = x; cy += bh + gap; }
    if (paint && it.key === 'snd') drawSoundToggle(C, cx, cy, w, bh);
    else if (paint) button(cx, cy, w, bh, it.label, it.onClick, { lac: it.lac ?? it.on ?? false, off: it.off, why: it.why, fs: 13 * U_ });
    cx += w + gap;
  }
  return cy + bh - y;
}

// 頂欄：標題列、功能鈕、國勢、章節。paint=false 時只計算高度。
function drawTop(paint) {
  const U_ = C.U, W = C.W, pad = 12 * U_;
  let y = 8 * U_;
  if (paint) seal(pad + 18 * U_, y + 18 * U_, 34 * U_, '帝', 0);
  if (paint) {
    text('皇帝養成綜合版', pad + 44 * U_, y, { size: 19 * U_, weight: 'bold', color: INK });
    const when = U.state ? calendarText() : '未開局';
    text(when, pad + 44 * U_, y + 26 * U_, { size: 12 * U_, color: '#5a4f45' });
  }
  y += 52 * U_;
  const fh = flowButtons(topButtons(), pad, y, W - 2 * pad, paint);
  y += fh + 8 * U_;
  // 國勢：四項只示意高低，不顯示數值
  if (U.state && U.state.alive) {
    const gw = (W - 2 * pad - 3 * 8 * U_) / 4;
    TOP_GAUGES.forEach((k, i) => {
      if (!paint) return;
      const gx = pad + i * (gw + 8 * U_);
      const lw = levelWord(k);
      text(`${STAT[k].l}${lw}`, gx, y, { size: 12 * U_, color: lw === '低' ? '#8a1f22' : INK, weight: lw === '高' ? 'bold' : '' });
      bar(gx, y + 17 * U_, gw, 7 * U_, pctOf(k), 100, GOLD);
    });
    y += 30 * U_;
  }
  const ms = milestoneText();
  if (ms) {
    if (paint) text(`當前章節：${ms}`, pad, y, { size: 12 * U_, color: INK });
    y += 20 * U_;
  }
  return y + 4 * U_;
}

// 底欄：返回宮城鈕（非宮城頁）與五個分頁。paint=false 時只計算高度。
function drawBottom(paint) {
  if (!showsNav()) return 0;
  const U_ = C.U, W = C.W, H = C.H, pad = 10 * U_;
  const tabH = TAB_TOP * U_;
  const hasBack = U.tab !== 'palace' && currentScreen() !== 'legacy' && currentScreen() !== 'gallery';
  const backH = hasBack ? 40 * U_ : 0;
  const total = backH + tabH + 4 * U_;
  if (!paint) return total;
  const top = H - total;
  if (hasBack) {
    button(pad, top + 4 * U_, W - 2 * pad, 32 * U_, '← 返回宮城', () => { U.tab = 'palace'; U.panel = null; U.pick1 = null; render(); }, { lac: false, fs: 13 * U_ });
  }
  const ty = top + backH + 2 * U_;
  const n = BAR.length, tw = (W - 2 * pad - (n - 1) * 6 * U_) / n;
  BAR.forEach((b, i) => {
    const on = U.tab === b.t;
    const x = pad + i * (tw + 6 * U_);
    button(x, ty, tw, tabH - 6 * U_, b.n, () => { U.tab = b.t; U.panel = null; U.pick1 = null; render(); }, { lac: on, fs: 14 * U_ });
  });
  return total;
}

function onSideToggle() {
  if (!U.state) return;
  const on = !sideEventsEnabled(U.state);
  setSideEventsEnabled(U.state, on);
  U.feedback = on ? '側線奇遇已開啟，巡幸可能遇見微服私訪之事。' : '側線奇遇已關閉，巡幸與朝政與主線完全相同。';
  save();
  render();
}

// 頂欄與底欄的版面（layout 供 core 扣除內容區）與繪製（draw）。
registerChrome(
  () => ({ top: drawTop(false), bottom: drawBottom(false) }),
  () => {
    drawTop(true);
    drawBottom(true);
    if (U.state && U.state.alive && currentScreen() !== 'start') {
      // 季節淡色（朝堂等內容頁底色）：以低透明度覆於內容區之上，不影響點擊。
      const season = SEASON[U.state.month] || 'winter';
      C.ctx.fillStyle = SEASON_TINT[season] || 'transparent';
      C.ctx.fillRect(0, 0, C.W, C.H);
    }
    if (!drawConflictModal()) drawSaveModal();
  },
);

// 頁面分派（render-bus 的 render）：依 U 的狀態設定目前畫面，並執行與舊版 render() 相同的狀態副作用。
export function render() {
  const name = resolveScreen();
  setScreen(name);
  // 覆蓋層（與舊版 render 同序）：新手提要、季結算卡、年號覆蓋層；僅於存活且非年終考評時。
  // 快進卡（ffItem）已於朝堂內容中繪製，不在此處理。
  if (U.state && U.state.alive && name !== 'review') { guideMount(); showQuarterCard(); showNewYear(); }
}

function resolveScreen() {
  if (U.tab === 'legacy') return 'legacy';
  if (U.tab === 'gallery') return 'gallery';
  paintMilestone();
  if (U.state && !U.state.alive) recordLegacyOnce();
  if (!U.state) {
    U.lastBattle = null;
    return 'start';
  }
  if (!U.state.alive) return 'ending';
  paintPendingEncounter();
  if (reviewPending()) return 'review';
  // 親征中：朝堂改為戰役畫面（與舊版 campaignCard 相同之切換）。
  if (U.tab === 'court' && campaignActive()) return 'campaign';
  return U.tab;
}

// 章節變動時短訊告知（同一局內首次繪製不發訊；與舊版 paintMilestone 相同）。
function paintMilestone() {
  if (!U.state || !U.state.alive) { U.milestoneSeed = null; return; }
  const ms = milestoneFor(U.state);
  if (U.milestoneSeed === U.seed && U.milestoneId !== null && U.milestoneId !== ms.id) pushToast(`新章節：${ms.title}`);
  U.milestoneSeed = U.seed; U.milestoneId = ms.id;
}

setRenderer(render);
registerScreen('start', renderStart);
registerScreen('ending', renderEnding);
registerScreen('court', drawCourt);
registerScreen('review', drawReview);
registerScreen('officials', drawOfficials); // 校場（任免官員）
registerScreen('dc', drawDC);               // 東廠
registerScreen('throne', drawThrone);       // 御書房（帝王）
// 全域覆蓋層（奇遇等）：由頂欄迴圈統一承載，任何畫面皆可顯示。
registerOverlay(keepOverlays);

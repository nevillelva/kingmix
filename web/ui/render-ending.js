// web/ui/render-ending.js：結局畫面（諡號卷軸）。含王朝落幕稱號、諡號、四軸評分、結語、本紀結果、生平紀事與「重新開局」。
import { buildScroll } from '../../src/posthumous.js';
import { evaluateDynasty } from '../../src/ending.js';
import { chronicleLine } from '../../src/chronicle.js';
import { selectBiographies, BIO_TAGS } from '../../src/biographies.js';
import { scenarioDef } from '../../src/scenarios.js';
import { U } from './store.js';
import { SCEN_STATUS } from './labels.js';
import { clearSave } from './state-io.js';
import { render } from './render-bus.js';
import { sfx } from './audio.js';
import { C } from './canvas/core.js';
import { bar, button, seal, text } from './canvas/widgets.js';
import { GOLD, INK, RED } from './canvas/theme.js';

let shownFor = null; // 同一局的結局只播放一次音效

export function renderEnding(c = C) {
  const ctx = c.ctx, U_ = c.U, W = c.W;
  const sc = buildScroll(U.state);
  const p = sc.posthumous;
  const title = evaluateDynasty(U.state).title;
  const scen = U.state.scenario && scenarioDef(U.state.scenario.id) ? scenarioDef(U.state.scenario.id) : null;
  if (shownFor !== U.state) { shownFor = U.state; sfx('end'); }

  const pad = 14 * U_;
  const cw = Math.min(W - 2 * pad, 620 * U_);
  const x = (W - cw) / 2;
  const inner = cw - 32 * U_;
  let y = 14 * U_;

  text(`王朝落幕 · ${title}`, W / 2, y, { size: 13 * U_, color: '#5a4f45', align: 'center', maxW: cw });
  y += 28 * U_;
  let cy = y + 16 * U_;
  text(sc.heading, x + 16 * U_, cy, { size: 22 * U_, weight: 'bold', color: INK, maxW: inner, align: 'left' });
  cy += 36 * U_;

  // 諡號印章與姓名、副題
  seal(x + 16 * U_ + 22 * U_, cy + 22 * U_, 44 * U_, p.char || '諡', 0);
  text(p.name, x + 16 * U_ + 56 * U_, cy + 2 * U_, { size: 18 * U_, weight: 'bold', color: INK, maxW: inner - 56 * U_ });
  cy += 4 * U_ + 22 * U_;
  cy += text(p.epithet || '', x + 16 * U_ + 56 * U_, cy + 4 * U_, { size: 13 * U_, color: '#5a4f45', maxW: inner - 56 * U_ }) + 14 * U_;

  // 四軸評分（數值取整僅供顯示；引擎分數不變）
  for (const a of sc.axes) {
    const v = Math.round(a.score);
    text(a.label, x + 16 * U_, cy, { size: 13 * U_, color: INK });
    text(String(v), x + cw - 16 * U_ - 30 * U_, cy, { size: 13 * U_, weight: 'bold', color: INK, align: 'left' });
    bar(x + 16 * U_, cy + 19 * U_, inner, 8 * U_, v, 100, a.key === 'military' ? RED : GOLD);
    cy += 36 * U_;
  }

  // 結語
  cy += 6 * U_;
  for (const line of sc.lines) cy += text(line, x + 16 * U_, cy, { size: 14 * U_, color: INK, maxW: inner, lh: 1.6 }) + 4 * U_;
  if (scen) {
    cy += 8 * U_;
    cy += text(`本紀「${scen.name}」：${SCEN_STATUS[U.state.scenario.status] || '未完'}`, x + 16 * U_, cy, { size: 13 * U_, color: '#5a4f45', maxW: inner }) + 8 * U_;
  }

  // 生平紀事
  cy += 10 * U_;
  text('生平紀事', x + 16 * U_, cy, { size: 16 * U_, weight: 'bold', color: INK });
  cy += 28 * U_;
  const chron = U.state.chronicle || [];
  if (!chron.length) cy += text('無紀錄', x + 16 * U_, cy, { size: 13 * U_, color: '#5a4f45' }) + 6 * U_;
  for (const ch of chron) {
    const l = chronicleLine(ch);
    const h = text(`${l.text}（${l.tag}）`, x + 16 * U_, cy, { size: 13 * U_, color: INK, maxW: inner, lh: 1.5 });
    cy += h + 8 * U_;
  }

  // 名臣列傳：本局終局最終名單（與跨局列傳同一挑選規則，見 src/biographies.js）
  cy += 12 * U_;
  text('名臣列傳', x + 16 * U_, cy, { size: 16 * U_, weight: 'bold', color: INK });
  cy += 28 * U_;
  const picks = selectBiographies(U.state);
  if (!picks.length) cy += text('本局無名臣入傳', x + 16 * U_, cy, { size: 13 * U_, color: '#5a4f45' }) + 6 * U_;
  for (const p of picks) {
    cy += text(`${p.name}（${BIO_TAGS[p.tag] || p.tag}）`, x + 16 * U_, cy, { size: 14 * U_, weight: 'bold', color: INK, maxW: inner }) + 2 * U_;
    const note = p.endLine || p.lines[p.lines.length - 1] || '';
    if (note) cy += text(note, x + 16 * U_, cy, { size: 13 * U_, color: '#5a4f45', maxW: inner, lh: 1.5 }) + 2 * U_;
    cy += 8 * U_;
  }

  cy += 12 * U_;
  button(x + 16 * U_, cy, Math.min(inner, 260 * U_), 44 * U_, '重新開局', () => { clearSave(); U.state = null; render(); }, { lac: true });
  cy += 44 * U_ + 20 * U_;
  c.contentH = cy;
}

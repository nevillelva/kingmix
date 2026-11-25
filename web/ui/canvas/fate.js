// web/ui/canvas/fate.js：命運線畫面（時間軸，Canvas）。
// 顯示這一局目前走到哪一段命運：已觸發的史冊節點依年月排列（chronicle 的 fate / fate_end），
// 並列出尚未揭曉的伏筆（fates 中未結局者之剩餘段數與最早揭曉月份）。伏筆文字不預先顯示。
// 點選任一節點可篩選該人物的前後因果，再點一次還原。純讀取：不改動狀態、不消耗 rng。
// 依賴：core.js（registerScreen、C）、input.js（hit）、court.js（版面元件）、src/fates.js（arcOf）、src/fate-data.js（標籤）。
import { C, registerScreen } from './core.js';
import { hit } from './input.js';
import { txt, vstack, boxed, btn, tag, screenInner, paintStack, setContentHeight } from './court.js';
import { GOLD, INK, LAC_TEXT } from './theme.js';
import { U } from '../store.js';
import { arcOf } from '../../../src/fates.js';
import { FATE_END_TAG, FATE_ROLE_TAG } from '../../../src/fate-data.js';

const monthIdx = (y, m) => (y - 1) * 12 + (m - 1);
const fromIdx = (i) => ({ year: Math.floor(i / 12) + 1, month: (i % 12) + 1 });
const u = () => C.U;
const RAIL = 'rgba(163,38,42,.45)';
const DIM = 'rgba(60,40,20,.85)';

// 目前篩選的人物名（null 為全部）。僅為畫面狀態，不寫入存檔。
let filter = null;
export function fateFilter() { return filter; }
export function setFateFilter(name) { filter = name ?? null; }

// 純資料模型：時間軸事件與伏筆。不含任何繪製。
// events：依 (year, month) 排序，同月以史冊寫入順序為準。
// pending：未結局者；remaining 為尚未揭曉段數，earliest 為最早揭曉月份（依 after），minAge 為皇嗣年齡門檻。
export function fateTimeline(state) {
  const chron = Array.isArray(state.chronicle) ? state.chronicle : [];
  const events = chron
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c && (c.kind === 'fate' || c.kind === 'fate_end'))
    .sort((a, b) => (monthIdx(a.c.year ?? 0, a.c.month ?? 0) - monthIdx(b.c.year ?? 0, b.c.month ?? 0)) || a.i - b.i)
    .map(({ c }) => ({
      kind: c.kind,
      name: c.name ?? '',
      text: c.text ?? '',
      tag: c.kind === 'fate_end' ? (FATE_END_TAG[c.cause] ?? '結局') : (c.tag ?? ''),
      cause: c.cause ?? null,
      year: c.year ?? 0,
      month: c.month ?? 0,
    }));

  const pending = [];
  for (const [key, rec] of Object.entries(state.fates ?? {})) {
    if (!rec || rec.ended) continue;
    const at = key.indexOf(':');
    const role = key.slice(0, at);
    const id = key.slice(at + 1);
    const arc = arcOf(role, rec.arc);
    if (!arc) continue;
    const stage = rec.stage ?? 0;
    const next = arc.beats[stage];
    if (!next) continue;
    const heir = role === 'heir' ? (state.heirs ?? []).find(h => h.id === id) : null;
    const tagLabel = role === 'heir'
      ? (rec.arc === 'male' ? FATE_ROLE_TAG.heir_male : FATE_ROLE_TAG.heir_female)
      : (FATE_ROLE_TAG[role] ?? '');
    pending.push({
      key,
      name: rec.name ?? id,
      tag: tagLabel,
      remaining: arc.beats.length - stage,
      earliest: fromIdx((rec.last ?? 0) + (next.after ?? 0)),
      minAge: next.minAge ?? 0,
      age: heir ? (heir.age ?? 0) : null,
    });
  }
  return { now: { year: state.year, month: state.month }, events, pending };
}

// 節點外框：左側朱線與圓點（結局為朱色、其餘為金色），整張卡片可點以篩選該人物。
function eventCard(ev, w) {
  const U0 = u(), GUT = 22 * U0;
  const sel = filter === ev.name;
  const inner = boxed(w - GUT, (iw) => vstack([
    txt(`${ev.year} 年 ${ev.month} 月　${ev.name}`, iw, 14, { weight: 'bold', color: ev.kind === 'fate_end' ? LAC_TEXT : INK }),
    tag(ev.tag || '·'),
    txt(ev.text, iw, 14),
  ], 4 * U0), { sel, lac: ev.kind === 'fate_end', pad: 10 });
  return {
    h: inner.h,
    draw(x, y, ww) {
      const c = C.ctx;
      c.save();
      c.strokeStyle = RAIL; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 9 * U0, y); c.lineTo(x + 9 * U0, y + inner.h); c.stroke();
      c.fillStyle = ev.kind === 'fate_end' ? '#8a1f22' : GOLD;
      c.beginPath(); c.arc(x + 9 * U0, y + 18 * U0, 6 * U0, 0, 7); c.fill();
      c.restore();
      inner.draw(x + GUT, y, ww - GUT);
      hit({ x: x + GUT, y, w: ww - GUT, h: inner.h }, () => setFateFilter(filter === ev.name ? null : ev.name));
    },
  };
}

// 伏筆卡：只列段數與最早月份（或年齡門檻），不列未揭曉之文字。
function pendingCard(p, w) {
  const line = p.minAge && p.age !== null && p.age < p.minAge
    ? `待年滿 ${p.minAge} 歲方可揭曉（現年 ${p.age}）`
    : `尚餘 ${p.remaining} 段未揭曉；最早於 ${p.earliest.year} 年 ${p.earliest.month} 月`;
  return boxed(w, (iw) => vstack([
    txt(`${p.name}　${p.tag}`, iw, 14, { weight: 'bold' }),
    txt(line, iw, 13, { color: DIM }),
  ], 3 * u()), { pad: 10 });
}

export function drawFate(Cx) {
  const r = screenInner(Cx);
  const U0 = Cx.U;
  if (!U.state) {
    txt('尚未開局，無命運線可觀。', r.w, 14).draw(r.x, r.top);
    setContentHeight(r.top + 40 * U0);
    return;
  }
  const tl = fateTimeline(U.state);
  // 篩選的人物若已不在紀錄中，自動還原為全部。
  const names = new Set([...tl.events.map(e => e.name), ...tl.pending.map(p => p.name)]);
  if (filter && !names.has(filter)) filter = null;
  const events = filter ? tl.events.filter(e => e.name === filter) : tl.events;
  const pend = filter ? tl.pending.filter(p => p.name === filter) : tl.pending;

  const head = boxed(r.w, (iw) => vstack([
    txt('命運線', iw, 18, { weight: 'bold' }),
    txt(`現在：${tl.now.year} 年 ${tl.now.month} 月　已觸發 ${tl.events.length} 則，未揭曉 ${tl.pending.length} 條`, iw, 13, { color: DIM }),
    filter ? btn(iw, `只看「${filter}」（點此還原全部）`, () => setFateFilter(null), { lac: true, h: 30 * U0 }) : null,
  ].filter(Boolean), 6 * U0));

  const items = [head];
  if (events.length) {
    items.push(...events.map(ev => eventCard(ev, r.w)));
  } else {
    items.push(txt('尚無命運線節點。人物進入命運線後，段落將依年月列於此處。', r.w, 14, { color: DIM }));
  }
  if (pend.length) {
    items.push(txt('尚未揭曉的伏筆', r.w, 15, { weight: 'bold' }));
    items.push(...pend.map(p => pendingCard(p, r.w)));
  }
  const bottom = paintStack(items, r.x, r.top, r.w, 10 * U0);
  setContentHeight(bottom);
}

registerScreen('fate', drawFate);

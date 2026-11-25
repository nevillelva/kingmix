// web/ui/render-curriculum.js：皇子排課（子嗣卡內，Canvas 版）。操作一律經 src/curriculum.js 的 setCourse、
// src/companions.js 的 recommendCompanion，不直接改 state。
// 季末結算的紀錄寫入 chronicle（curriculum_term），於史記頁顯示（chronicleLine 已支援）。
// 子嗣畫面（renderHarem）歸 B；此處僅提供 curriculumBlocks／companionBlocks 供其嵌入。
import { COURSES, CURRICULUM_MIN_AGE, curriculumEntry, setCourse } from '../../src/curriculum.js';
import { COMPANION_MIN_AGE, companionOf, companionSponsor, recommendCompanion } from '../../src/companions.js';
import { BOND_THRESHOLD } from '../../src/bonds.js';
import { isCourtOfficial } from '../../src/officials.js';
import { U } from './store.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';

const REASON_TEXT = {
  no_heir: '查無此皇子。',
  too_young: `年幼未入學，${CURRICULUM_MIN_AGE} 歲方可排課。`,
  no_course: '無此課程。',
  has_companion: '此皇子已有伴讀。',
  no_sponsor: '此臣不在朝，無從舉薦。',
  no_action: '本午後已無行動可用，或本月行動已盡。',
};

// 伴讀舉薦候選人數（依忠誠由高至低）。
const COMPANION_CANDIDATES = 3;

// 排課是否可見：皇子與皇女皆可排課（不分性別），已達入學年齡者。
export const canSchedule = (h) => !!h && Number(h.age) >= CURRICULUM_MIN_AGE;

// 課表摘要文字（純函式，供顯示與測試）。
export function curriculumSummary(entry) {
  if (!entry) return '尚未排課';
  const course = COURSES[entry.course]?.label ?? '—';
  const terms = Array.isArray(entry.terms) ? entry.terms.length : 0;
  return `主修${course}　功績 ${entry.merit ?? 0}　季考 ${terms} 次`;
}

// 單一皇子的排課區塊（供子嗣畫面嵌入）。
export function curriculumBlocks(h, state = U.state) {
  if (!h) return [];
  if (!canSchedule(h)) return [{ t: 'text', s: `課表：年幼，${CURRICULUM_MIN_AGE} 歲方入學。` }];
  const entry = curriculumEntry(state, h.id);
  const current = entry?.course ?? null;
  const items = Object.entries(COURSES).map(([key, c]) => ({
    label: key === current ? `主·${c.label}` : c.label,
    onClick: () => setCourseAct(`${h.id}|${key}`),
  }));
  return [
    { t: 'text', s: `課表：${curriculumSummary(entry)}` },
    { t: 'btns', items },
    ...companionBlocks(h, state),
  ];
}

// 伴讀區塊：已有伴讀則列出舉薦人與相得進度；否則列出在朝忠臣供舉薦（舉薦耗午後一次行動）。
export function companionBlocks(h, state = U.state) {
  const c = companionOf(state, h.id);
  if (c) {
    const sp = companionSponsor(state, h.id);
    const who = sp ? (sp.personName ?? sp.name) : '（舉薦人已不在朝）';
    return [{ t: 'text', s: `伴讀：由${who}舉薦　相得 ${c.bond}/${BOND_THRESHOLD}` }];
  }
  if (Number(h.age) < COMPANION_MIN_AGE) return [];
  const cands = (state.officials ?? []).filter(isCourtOfficial)
    .sort((a, b) => b.loyalty - a.loyalty || a.id.localeCompare(b.id)).slice(0, COMPANION_CANDIDATES);
  if (cands.length === 0) return [];
  return [
    { t: 'text', s: '伴讀：尚未舉薦（耗午後一次行動）' },
    { t: 'btns', items: cands.map((o) => ({
      label: `舉薦${o.personName ?? o.name}`,
      onClick: () => companionAct(`${h.id}|${o.id}`),
    })) },
  ];
}

// 舉薦伴讀：v 為 "皇子id|朝臣id"。舉薦自行耗行動（經 companions.js），故不走 useAction。
export function companionAct(v) {
  const [heirId, sponsorId] = String(v ?? '').split('|');
  const r = recommendCompanion(U.state, heirId, sponsorId);
  U.feedback = r.ok ? '已舉薦伴讀，每季相得加深。' : (REASON_TEXT[r.reason] ?? '舉薦未成。');
  save();
  render();
  return true;
}

// 排課：v 為 "皇子id|課程id"。
export function setCourseAct(v) {
  const [heirId, courseId] = String(v ?? '').split('|');
  const r = setCourse(U.state, heirId, courseId);
  U.feedback = r.ok ? `已排定${COURSES[courseId].label}，將於下一季結算。` : (REASON_TEXT[r.reason] ?? '排課未成。');
  save();
  render();
  return true;
}

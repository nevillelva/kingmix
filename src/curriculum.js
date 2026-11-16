// 皇子課表養成：玩家為皇子排定課程（每季結算一次），課程提升對應能力並累積功績。
// 功績影響繼位評價（succession.js 的 successionScore），登基後依主修課程定出結局稱號（ending.js）。
// 未排課程的皇子不受任何影響，既有局面與平衡不變。數值為暫定值。

import { makeRng } from './rng.js';
import { officeHolder } from './offices.js';
import { ruleMod } from './rule-mods.js';

export const CURRICULUM_MIN_AGE = 6; // 最低入學年齡
export const CURRICULUM_TERM_MONTHS = Object.freeze([3, 6, 9, 12]); // 每季結算月
export const CURRICULUM_GAIN = 2; // 每季基礎能力增益（會乘上太傅才學與皇子該科能力）
export const CURRICULUM_CAP = 100; // 能力上限
export const CURRICULUM_PROSPECT_WEIGHT = 0.5; // 功績計入繼位評價的權重
export const CURRICULUM_MIN_MERIT = 4; // 功績低於此值視為無明確主修，結局不分類

export const COURSES = Object.freeze({
  classics: { label: '經史', ability: 'intellect' },
  statecraft: { label: '政論', ability: 'politics' },
  martial: { label: '騎射', ability: 'martial' },
  administration: { label: '理政', ability: 'command' },
  ethics: { label: '德行', ability: 'virtue' },
});

// 主修課程對應的結局稱號（登基後，依前朝皇子功績最高的課程）。
export const TUTELAGE_TITLES = Object.freeze({
  classics: '文宗睿哲之主',
  statecraft: '謀略長遠之主',
  martial: '騎射雄健之主',
  administration: '經理有方之主',
  ethics: '德範天下之主',
});

// 教育才學（同 education.js tutorQuality，此處獨立計算以免循環引用）。
function tutorQuality(tutor) {
  if (!tutor) return 0;
  return (tutor.abilities.intellect + tutor.abilities.virtue) / 200;
}

// 課表狀態：state.curriculum.heirs[皇子 id] = { course, merit, terms: [{ year, month, course, gain, grade }] }
export function curriculumEntry(state, heirId) {
  return state.curriculum?.heirs?.[heirId] ?? null;
}

export function curriculumMerit(state, heirId) {
  return curriculumEntry(state, heirId)?.merit ?? 0;
}

// 排定（或改排）皇子課程。回傳 { ok, reason }；失敗時不改動狀態。改排保留既有功績與紀錄。
export function setCourse(state, heirId, courseId) {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir) return { ok: false, reason: 'no_heir' };
  if (heir.age < CURRICULUM_MIN_AGE) return { ok: false, reason: 'too_young' };
  if (!Object.prototype.hasOwnProperty.call(COURSES, courseId)) return { ok: false, reason: 'no_course' };
  if (!state.curriculum) state.curriculum = { heirs: {} };
  const prev = state.curriculum.heirs[heirId];
  state.curriculum.heirs[heirId] = prev
    ? { ...prev, course: courseId }
    : { course: courseId, merit: 0, terms: [] };
  return { ok: true };
}

// 單季結算（僅於 CURRICULUM_TERM_MONTHS 月份執行）。
// 增益 = 基礎 × (1 + 太傅才學) × (0.5 + 隨機) × (0.5 + 該科能力/100)，四捨五入；所有隨機數依 (seed, 年, 月, 皇子 id) 決定。
export function tickCurriculum(state) {
  if (!CURRICULUM_TERM_MONTHS.includes(state.month)) return state;
  const heirs = state.curriculum?.heirs;
  if (!heirs) return state;
  const q = tutorQuality(officeHolder(state, 'tutor'));
  for (const h of [...state.heirs].sort((a, b) => a.id.localeCompare(b.id))) {
    const entry = heirs[h.id];
    if (!entry || h.age < CURRICULUM_MIN_AGE) continue;
    const { ability } = COURSES[entry.course];
    const rng = makeRng([state.seed, 'curriculum', state.year, state.month, h.id]);
    const gain = Math.round(CURRICULUM_GAIN * (1 + q) * (0.5 + rng()) * (0.5 + h.abilities[ability] / 100) * ruleMod(state, 'learning_gain', 1));
    const grade = gain >= CURRICULUM_GAIN * 2 ? '甲' : gain >= CURRICULUM_GAIN ? '乙' : '丙';
    h.abilities[ability] = Math.min(CURRICULUM_CAP, h.abilities[ability] + gain);
    entry.merit += gain;
    entry.terms.push({ year: state.year, month: state.month, course: entry.course, gain, grade });
    state.chronicle.push({
      kind: 'curriculum_term',
      generation: state.dynasty.generation,
      year: state.year,
      month: state.month,
      heirId: h.id,
      name: h.name,
      course: entry.course,
      grade,
    });
  }
  return state;
}

// 功績最高的課程（依各課總增益）；功績不足 CURRICULUM_MIN_MERIT 則回傳 null。
export function tutelageCourse(entry) {
  if (!entry || !Array.isArray(entry.terms) || entry.merit < CURRICULUM_MIN_MERIT) return null;
  const totals = {};
  for (const t of entry.terms) totals[t.course] = (totals[t.course] ?? 0) + t.gain;
  const best = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : null;
}

// 登基結局：回傳 { course, title } 或 null。
export function tutelageOf(state, heirId) {
  const course = tutelageCourse(curriculumEntry(state, heirId));
  return course ? { course, title: TUTELAGE_TITLES[course] } : null;
}

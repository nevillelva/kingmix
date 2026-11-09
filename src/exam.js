// 開科取士：玩家主動開科，每 24 個月一次，招募 1–2 名新進士（走既有 generateOfficial）。
// 使用獨立的 rng（由呼叫端以 ['exam', 年, 月] 產生），不影響既有 RNG 路徑。
// 間隔與人數為方案暫定值，待模擬校準。

import { generateOfficial } from './officials.js';
import { attachPerson } from './people.js';
import { MAX_OFFICIALS } from './turn.js';

export const EXAM_INTERVAL_TURNS = 24;
export const EXAM_MIN = 1;
export const EXAM_MAX = 2;

// 距下次可開科的月數；從未開科者為 0（可立即開科）。
export function examRemaining(state) {
  const last = state.exam?.lastTurn;
  if (last === null || last === undefined) return 0;
  return Math.max(0, EXAM_INTERVAL_TURNS - (state.turn - last));
}

// 回傳 { ok, reason, added }；失敗時不改動任何狀態。
export function holdExam(state, rng) {
  if (!state.alive) return { ok: false, reason: 'dead' };
  const remaining = examRemaining(state);
  if (remaining > 0) return { ok: false, reason: 'cooldown', remaining };
  const room = MAX_OFFICIALS - state.officials.length;
  if (room <= 0) return { ok: false, reason: 'full' };
  const want = EXAM_MIN + Math.floor(rng() * (EXAM_MAX - EXAM_MIN + 1));
  const n = Math.min(room, want);
  const base = 30 + Math.round(state.stats.literature / 10);
  const added = [];
  for (let i = 0; i < n; i++) {
    const rid = `x${state.turn}_${i}`;
    let id = rid;
    for (let k = 1; state.officials.some((o) => o.id === id); k++) id = `${rid}_${k}`;
    const o = attachPerson(state.seed, generateOfficial(rng, id, { name: `進士${state.year}-${i + 1}`, base, span: 40 }));
    state.officials.push(o);
    added.push(o);
  }
  state.exam = { lastTurn: state.turn };
  return { ok: true, added: added.map((o) => o.id) };
}

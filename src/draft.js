// 選秀納妃（純函式，引擎端）：每次召四名秀女，可獨寵一人（擇一入宮）或雨露均霑（四人皆入宮）。
// 入宮的妃嬪與 turn.js 的 add_consort 效果同一套路徑：以 generateConsort(seed, id) 產生人物，
// id 依 dynasty.nextConsortId 遞增，上限 CONSORT_CAP。秀女名單以 (seed, 下一個 id) 決定，不消耗任何既有亂數流。
// 家族、性格、寵愛值皆來自 people.js（generateConsort），不在此重定。
import { generateConsort } from './people.js';
import { setStat } from './state.js';

export const DRAFT_SIZE = 4; // 每次召入之秀女名額
export const CONSORT_CAP = 8; // 後宮上限，與 turn.js add_consort 一致
// 國庫成本（定案值）：選秀屬獨立路徑，不沿用事件大小選費用；數值維持 v2 原型之獨寵 10、雨露均霑 25。
export const DRAFT_COST = Object.freeze({ single: 10, all: 25 });

// 本次選秀的四位秀女（純函式，不改 state）。id 與入宮時分配的 id 相同，故預覽與入宮人物一致。
export function draftSlate(state) {
  const base = state.dynasty.nextConsortId;
  return Array.from({ length: DRAFT_SIZE }, (_, slot) => {
    const id = `c${base + 1 + slot}`;
    return { slot, id, ...generateConsort(state.seed, id) };
  });
}

// 檢查能否入宮：mode 為 'single'（獨寵，需 slot）或 'all'（雨露均霑）。回傳 { ok, reason, cost }。
export function draftStatus(state, mode, slot = null) {
  let cost;
  if (mode === 'single') {
    if (!Number.isInteger(slot) || slot < 0 || slot >= DRAFT_SIZE) return { ok: false, reason: 'no_slot', cost: null };
    cost = DRAFT_COST.single;
  } else if (mode === 'all') {
    cost = DRAFT_COST.all;
  } else {
    return { ok: false, reason: 'no_mode', cost: null };
  }
  const n = mode === 'single' ? 1 : DRAFT_SIZE;
  if (state.consorts.length + n > CONSORT_CAP) return { ok: false, reason: 'full', cost };
  if (state.stats.treasury < cost) return { ok: false, reason: 'treasury', cost };
  return { ok: true, reason: null, cost };
}

function admit(state, candidate) {
  state.dynasty.nextConsortId = Math.max(state.dynasty.nextConsortId, Number(candidate.id.slice(1)));
  const { slot: _slot, ...person } = candidate;
  state.consorts.push(person);
  return person;
}

// 獨寵一人：入宮所選之秀女，其餘三人不入宮。成功時扣除國庫並回傳新妃嬪。
export function pickConsort(state, slot) {
  const st = draftStatus(state, 'single', slot);
  if (!st.ok) return st;
  const candidate = draftSlate(state)[slot];
  setStat(state, 'treasury', state.stats.treasury - st.cost);
  const consort = admit(state, candidate);
  return { ok: true, reason: null, cost: st.cost, consorts: [consort] };
}

// 雨露均霑：四人皆入宮。成功時扣除國庫並回傳新入宮之妃嬪。
export function pickAllConsorts(state) {
  const st = draftStatus(state, 'all');
  if (!st.ok) return st;
  const slate = draftSlate(state);
  setStat(state, 'treasury', state.stats.treasury - st.cost);
  const consorts = slate.map((c) => admit(state, c));
  return { ok: true, reason: null, cost: st.cost, consorts };
}

// 臣子關係網：朝臣之間的三種關係（師生 teacher、姻親 marriage、孿敵 rival），
// 以及月結時自然浮現的三種行為：結黨（教師與門生、姻親同派成黨，勢力微增）、
// 互參（孿敵互相上奏彈劾，待奏摺裁決）、連坐（官員遭黜，其師生與姻親忠誠下挫）。
//
// 設計約束：
//   - 事件條件只能使用 events.js 既有條件，因此本模組以 state.flags 與事件溝通：
//     月結時寫入狀態旗標（rel_teacher、bloc_qingliu、impeach_pending、guilt_spread …），
//     事件選項以 setFlag 寫入裁決旗標（rel_order_*），下一次 stepRelations 讀取後清除。
//   - 無任何關係時 stepRelations 為 no-op，且不消耗 rng。
//   - 本模組只寫入 state；呼叫端（turn.js 月結）負責接線，見 stepRelations 註解。

import { isCourtOfficial, FACTIONS } from './officials.js';

export const REL_KINDS = Object.freeze(['teacher', 'marriage', 'rival']);
export const SPREAD_KINDS = Object.freeze(['teacher', 'marriage']); // 連坐沿師生、姻親傳遞；孿敵不連坐

// 數值為暫定，待無頭模擬校準。
export const BLOC_MIN_TIES = 1; // 同派之師生或姻親一條即可成黨
export const BLOC_CHANCE = 0.15; // 每月成黨勢力增加的機率
export const BLOC_GAIN = 2; // 成黨時本派勢力增加
export const BLOC_CEILING = 60; // 本派勢力達此值後，結黨不再加勢（避免與派系逼迫疊加失控）
export const IMPEACH_CHANCE = 0.04; // 每月每對孿敵發動互參的機率
export const IMPEACH_AUTO_MONTHS = 3; // 奏摺無裁決時，滿此月數自動落定
export const IMPEACH_LOYALTY = 10; // 自動落定：被參者忠誠下挫
export const GUILT_CHANCE = 0.5; // 官員遭黜時，每位師生／姻親受牽連的機率
export const GUILT_LOYALTY = 8; // 受牽連者忠誠下挫；赦免裁決則回復相同數值

const DECISION_FLAGS = ['rel_order_disband', 'rel_order_purge', 'rel_order_pardon', 'rel_order_mourn'];

const clampLoyalty = (v) => Math.min(100, Math.max(0, v));

function ensureRelState(state) {
  if (!state.relState) state.relState = { known: null, impeachment: null, guilt: [], spared: null };
  return state.relState;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// 回傳關係清單的副本：[{a, b, kind}]。
export function listRelations(state) {
  return (state.relations ?? []).map((r) => ({ a: r.a, b: r.b, kind: r.kind }));
}

// 新增一組關係。同一對官員僅允許一種關係；已存在則回傳 false。
// 師生關係的 a 為師、b 為生。
export function addRelation(state, a, b, kind) {
  if (!REL_KINDS.includes(kind)) throw new Error(`unknown relation kind: ${kind}`);
  if (a === b) throw new Error(`relation requires two different officials: ${a}`);
  for (const id of [a, b]) {
    if (!state.officials.some((o) => o.id === id)) throw new Error(`unknown official: ${id}`);
  }
  state.relations = state.relations ?? [];
  const key = pairKey(a, b);
  if (state.relations.some((r) => pairKey(r.a, r.b) === key)) return false;
  state.relations.push({ a, b, kind });
  return true;
}

// 關係圖資料：節點為朝臣（知府不入圖），邊僅連接兩端皆在圖中者。
export function relationsForGraph(state) {
  const court = state.officials.filter(isCourtOfficial);
  const ids = new Set(court.map((o) => o.id));
  return {
    nodes: court.map((o) => ({ id: o.id, name: o.name, faction: o.faction })),
    edges: listRelations(state).filter((r) => ids.has(r.a) && ids.has(r.b)).map(({ a, b, kind }) => ({ a, b, kind })),
  };
}

// 初始關係網（供開局或測試使用）：丞相為翰林學士之師、戶部與知府為姻親、丞相與戶部為孿敵。
// 呼叫端決定是否在開局呼叫；未呼叫時本模組維持 no-op。
export function seedRelations(state) {
  addRelation(state, 'o1', 'o4', 'teacher');
  addRelation(state, 'o2', 'o3', 'marriage');
  addRelation(state, 'o1', 'o2', 'rival');
  return state;
}

// 官員遭黜（死諫、刺殺、東廠、互參等）後，其師生與姻親受連坐：各自以 GUILT_CHANCE 機率忠誠下挫。
function spreadGuilt(state, removedId, rs, rng) {
  for (const r of state.relations) {
    if (!SPREAD_KINDS.includes(r.kind)) continue;
    if (r.a !== removedId && r.b !== removedId) continue;
    const other = r.a === removedId ? r.b : r.a;
    const o = state.officials.find((x) => x.id === other);
    if (!o || !isCourtOfficial(o)) continue;
    if (rng() < GUILT_CHANCE) {
      o.loyalty = clampLoyalty(o.loyalty - GUILT_LOYALTY);
      rs.guilt.push(other);
    }
  }
}

// 與 turn.js removeOfficial 同義（不 import turn.js，避免循環匯入）。
function dismiss(state, official) {
  const idx = state.officials.indexOf(official);
  if (idx === -1) return;
  state.officials.splice(idx, 1);
  official.office = null;
  state.factions[official.faction] = Math.max(0, state.factions[official.faction] - 2);
  for (const c of state.dongchang.cases) {
    if (c.officialId === official.id && c.status !== 'closed') {
      c.status = 'closed';
      c.outcome = 'removed';
    }
  }
}

// 月結：結黨、互參、連坐。須於 monthlyTick 之後、advanceMonth 之前呼叫（見回報中的接線說明）。
// 無任何關係時直接回傳，不改動狀態、不消耗 rng。
export function stepRelations(state, rng) {
  if (!state.relations || state.relations.length === 0) return state;
  const rs = ensureRelState(state);
  const flags = state.flags;
  const byId = new Map(state.officials.map((o) => [o.id, o]));
  const court = (id) => {
    const o = byId.get(id);
    return o && isCourtOfficial(o) ? o : null;
  };

  // 1. 連坐：上月存在、本月消失的官員視為遭黜。
  const present = new Set(state.officials.map((o) => o.id));
  // 2. 裁決旗標：連坐赦免（回復上月受牽連者的忠誠）。先於本月新連坐結算。
  const prevGuilt = rs.guilt;
  if (flags.rel_order_mourn) {
    for (const id of prevGuilt) {
      const o = court(id);
      if (o) o.loyalty = clampLoyalty(o.loyalty + GUILT_LOYALTY);
    }
    // 互參未決時下赦令：被參者遭黜後，其師生與姻親免於連坐（見下方 rs.spared）。
    if (rs.impeachment) rs.spared = rs.impeachment.target;
  }
  rs.guilt = [];
  if (rs.known) {
    for (const id of rs.known) {
      if (present.has(id)) continue;
      if (rs.spared === id) {
        rs.spared = null; // 赦令已生效，僅免此一人之連坐
        continue;
      }
      spreadGuilt(state, id, rs, rng);
    }
  }
  rs.known = [...present];
  flags.guilt_spread = rs.guilt.length > 0;

  // 3. 互參：既有奏摺依裁決落定，或逾期自動落定。
  const imp = rs.impeachment;
  if (imp) {
    const accuser = court(imp.accuser);
    const target = court(imp.target);
    if (!accuser || !target) {
      rs.impeachment = null;
    } else if (flags.rel_order_purge) {
      dismiss(state, target); // 黜落後，下月偵測到其離位，連坐於此結算（赦令若在，則免之）
      rs.impeachment = null;
    } else if (flags.rel_order_pardon) {
      accuser.loyalty = clampLoyalty(accuser.loyalty - IMPEACH_LOYALTY);
      rs.impeachment = null;
    } else {
      imp.age += 1;
      if (imp.age >= IMPEACH_AUTO_MONTHS) {
        target.loyalty = clampLoyalty(target.loyalty - IMPEACH_LOYALTY);
        rs.impeachment = null;
      }
    }
    // 互參未經黜落即告終，赦令不再有效
    if (rs.impeachment === null && !flags.rel_order_purge) rs.spared = null;
  }
  // 新互參：每對在場孿敵各擲一次；同時僅一件奏摺在案。
  if (!rs.impeachment) {
    for (const r of state.relations) {
      if (r.kind !== 'rival') continue;
      if (!(rng() < IMPEACH_CHANCE)) continue;
      const a = court(r.a);
      const b = court(r.b);
      if (!a || !b) continue;
      const [accuser, target] = a.abilities.politics >= b.abilities.politics ? [a, b] : [b, a];
      rs.impeachment = { accuser: accuser.id, target: target.id, age: 0 };
      break;
    }
  }
  flags.impeach_pending = rs.impeachment !== null;

  // 4. 裁決旗標：解黨（清除成黨加勢）。
  if (flags.rel_order_disband) {
    for (const f of FACTIONS) {
      if (flags[`bloc_${f}`]) state.factions[f] = Math.max(0, state.factions[f] - BLOC_GAIN * 2);
    }
  }

  // 5. 結黨：同派之師生、姻親達門檻即成黨；成黨時本派勢力有機率微增（不超過 BLOC_CEILING）。
  for (const f of FACTIONS) {
    let ties = 0;
    for (const r of state.relations) {
      if (!SPREAD_KINDS.includes(r.kind)) continue;
      const a = court(r.a);
      const b = court(r.b);
      if (a && b && a.faction === f && b.faction === f) ties += 1;
    }
    const formed = ties >= BLOC_MIN_TIES;
    flags[`bloc_${f}`] = formed;
    if (formed && rng() < BLOC_CHANCE && state.factions[f] < BLOC_CEILING) {
      state.factions[f] = Math.min(100, state.factions[f] + BLOC_GAIN);
    }
  }

  // 6. 狀態旗標（供事件條件）與裁決旗標清除。
  flags.rel_teacher = state.relations.some((r) => r.kind === 'teacher' && court(r.a) && court(r.b));
  flags.rel_marriage = state.relations.some((r) => r.kind === 'marriage' && court(r.a) && court(r.b));
  // 跨派姻親：兩端分屬不同派系的姻親（事件 E542、E543 使用）
  flags.rel_cross_marriage = state.relations.some((r) => {
    if (r.kind !== 'marriage') return false;
    const a = court(r.a);
    const b = court(r.b);
    return Boolean(a && b && a.faction !== b.faction);
  });
  flags.rel_rival = state.relations.some((r) => r.kind === 'rival' && court(r.a) && court(r.b));
  for (const k of DECISION_FLAGS) delete flags[k];
  return state;
}

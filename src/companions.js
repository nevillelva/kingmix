// 伴讀與太傅：皇子（六歲以上）可由一位在朝臣子舉薦一名伴讀，記於 curriculum.heirs[皇子 id].companion = { sponsorId, bond }。
//
// 規則（數值為暫定值）：
//   - 舉薦為玩家行動：耗一次午後「召見大臣」時段（經 slots.js 的 canTakeSlot / spendSlot 記帳）。每位皇子同時僅一名伴讀。
//   - 每季結算（curriculum.js tickCurriculum）：伴讀 bond 增加 1，計數方式同 bonds.js 的共歷事件計數。
//     bond 首次達到 BOND_THRESHOLD 時，舉薦人忠誠小幅上升，並寫入史冊 companion_bond。
//   - 登基（succession.js tryAccession）：bond 達門檻者，其舉薦人所屬派系增勢，且該臣與新君之相得設為已解鎖（寫入史冊 companion_ascend）。
//   - 奪嫡（succession.js successionScore）：舉薦人所屬派系勢力計入該皇子評價；無伴讀則加分為 0，評價完全不變。
//
// 純函式與就地修改皆只觸及 curriculum 與既有官員欄位；不呼叫 rng，不新增獨立數值系統。

import { BOND_THRESHOLD } from './bonds.js';
import { spendSlot } from './slots.js';
import { isCourtOfficial } from './officials.js';

export const COMPANION_MIN_AGE = 6; // 與 curriculum.js 的 CURRICULUM_MIN_AGE 相同（此處獨立宣告以免循環引用）
export const COMPANION_LOYALTY_GAIN = 3; // 舉薦人忠誠：bond 達門檻時一次性上升
export const COMPANION_ASCEND_FACTION = 4; // 登基時舉薦人所屬派系增勢（相得者）
export const COMPANION_RIVAL_WEIGHT = 0.1; // 奪嫡評價：舉薦人派系勢力（0–100）乘以此權重計入

const displayName = (o) => o.personName ?? o.name;

export function companionOf(state, heirId) {
  return state.curriculum?.heirs?.[heirId]?.companion ?? null;
}

// 舉薦人（在朝臣子）；無伴讀或舉薦人已不在朝則回傳 null。
export function companionSponsor(state, heirId) {
  const c = companionOf(state, heirId);
  if (!c) return null;
  return state.officials.find((o) => o.id === c.sponsorId && isCourtOfficial(o)) ?? null;
}

// 舉薦伴讀：回傳 { ok, reason }；失敗時不改動狀態。
export function recommendCompanion(state, heirId, sponsorId) {
  const heir = state.heirs.find((h) => h.id === heirId);
  if (!heir) return { ok: false, reason: 'no_heir' };
  if (heir.age < COMPANION_MIN_AGE) return { ok: false, reason: 'too_young' };
  if (companionOf(state, heirId)) return { ok: false, reason: 'has_companion' };
  const sponsor = state.officials.find((o) => o.id === sponsorId);
  if (!sponsor || !isCourtOfficial(sponsor)) return { ok: false, reason: 'no_sponsor' };
  if (!spendSlot(state, 'afternoon', 'audience').ok) return { ok: false, reason: 'no_action' };
  if (!state.curriculum) state.curriculum = { heirs: {} };
  const entry = state.curriculum.heirs[heirId] ?? { course: null, merit: 0, terms: [] };
  state.curriculum.heirs[heirId] = { ...entry, companion: { sponsorId, bond: 0 } };
  return { ok: true };
}

// 季結算時呼叫（由 tickCurriculum 於季考月呼叫）：伴讀 bond +1；首次達門檻則舉薦人忠誠上升並記史冊。
export function tickCompanionBond(state, heirId) {
  const c = companionOf(state, heirId);
  if (!c) return;
  const sponsor = state.officials.find((o) => o.id === c.sponsorId);
  if (!sponsor) return;
  const before = c.bond;
  c.bond += 1;
  if (before < BOND_THRESHOLD && c.bond >= BOND_THRESHOLD) {
    sponsor.loyalty = Math.min(100, sponsor.loyalty + COMPANION_LOYALTY_GAIN);
    const heir = state.heirs.find((h) => h.id === heirId);
    state.chronicle.push({
      kind: 'companion_bond',
      generation: state.dynasty.generation,
      year: state.year,
      month: state.month,
      heirId,
      name: heir?.name ?? heirId,
      sponsorName: displayName(sponsor),
    });
  }
}

// 奪嫡評價加分：有伴讀且舉薦人在朝者，為其派系勢力 × COMPANION_RIVAL_WEIGHT；否則為 0。
export function companionRivalBonus(state, heirId) {
  const sponsor = companionSponsor(state, heirId);
  if (!sponsor) return 0;
  return COMPANION_RIVAL_WEIGHT * (state.factions[sponsor.faction] ?? 0);
}

// 登基時呼叫（於 tryAccession 刪除課表前）：相得之舉薦人，派系增勢並解鎖相得，回傳紀錄或 null。
export function applyCompanionAscension(state, heirId) {
  const c = companionOf(state, heirId);
  if (!c || c.bond < BOND_THRESHOLD) return null;
  const sponsor = state.officials.find((o) => o.id === c.sponsorId);
  if (!sponsor) return null;
  state.factions[sponsor.faction] = Math.min(100, (state.factions[sponsor.faction] ?? 0) + COMPANION_ASCEND_FACTION);
  if (!state.bonds) state.bonds = { shared: {}, unlocked: {} };
  state.bonds.unlocked[sponsor.id] = true;
  const heir = state.heirs.find((h) => h.id === heirId);
  const rec = {
    kind: 'companion_ascend',
    generation: state.dynasty.generation,
    year: state.year,
    month: state.month,
    heirId,
    name: heir?.name ?? heirId,
    sponsorName: displayName(sponsor),
    faction: sponsor.faction,
  };
  state.chronicle.push(rec);
  return rec;
}

// 祖訓（玩法深度擴充）：開局由玩家勾選 0–2 條已解鎖祖訓，寫入本局 state.edicts。
// 每條祖訓以規則 key 修正數值（見 rule-mods.js ruleMod）；未勾選時 state.edicts 為空，行為與原版相同。
// 解鎖以跨局紀錄為準（沿用 unlocks.js 的 UNLOCK_RULES，kind = 'edict'）；本局一旦開始即不再讀取跨局紀錄，
// 故同種子重現不受局外解鎖影響。純函式：不讀寫儲存空間、不改動輸入。
import { isUnlocked } from './unlocks.js';

export const EDICT_MAX = 2;

// mods：規則 key → { add } 或 { mul }（同一 key 多條祖訓併入時 add 相加、mul 相乘）。
// 修正值採保守設計（約 ±10–20%），每條祖訓只接 1–2 個使用點。
export const EDICT_DEFS = Object.freeze([
  Object.freeze({
    id: 'zhongnong', name: '重農抑商', desc: '農業州府產出 +15%，商業州府產出 −15%。',
    mods: { yield_agriculture: { mul: 1.15 }, yield_commerce: { mul: 0.85 } },
  }),
  Object.freeze({
    id: 'chongwen', name: '崇文抑武', desc: '皇子課業學識進益 +10%。',
    mods: { learning_gain: { mul: 1.1 } },
  }),
  Object.freeze({
    id: 'changwei', name: '廠衛監國', desc: '東廠每局處置行動上限 +2，暴政累積 +15%。',
    mods: { dc_action_cap: { add: 2 }, tyranny_gain: { mul: 1.15 } },
  }),
  Object.freeze({
    id: 'kuanren', name: '寬仁為本', desc: '州府民心增益 +20%，州府國庫增益 −15%。',
    mods: { people_gain: { mul: 1.2 }, treasury_gain: { mul: 0.85 } },
  }),
  Object.freeze({
    id: 'jinzhu', name: '謹守祖制', desc: '臣子忠誠月間流失減緩 3%（僅作用於流失，不影響回升）。',
    mods: { loyalty_loss: { mul: 0.97 } },
  }),
  Object.freeze({
    id: 'kaijiang', name: '開疆拓土', desc: '戰事獎勵 +10%；無戰事之月民心每月 −0.02。',
    mods: { war_reward: { mul: 1.1 }, peace_people: { add: -0.02 } },
  }),
  Object.freeze({
    id: 'jieyong', name: '節用惜財', desc: '國庫每月自然增 +0.5；興建與升級設施費用 −10%。',
    mods: { treasury_natural: { add: 0.5 }, facility_cost: { mul: 0.9 } },
  }),
]);

export const EDICT_IDS = Object.freeze(EDICT_DEFS.map((d) => d.id));

export function edictDef(id) {
  return EDICT_DEFS.find((d) => d.id === id) ?? null;
}

// 檢查所選祖訓：未知、重複、超過上限、未解鎖者皆不合規。回傳 { ok, ids, error }。
export function validateEdictChoice(ids, record) {
  if (!Array.isArray(ids)) return { ok: false, ids: [], error: 'not_array' };
  const uniq = [...new Set(ids)];
  if (uniq.length !== ids.length) return { ok: false, ids: [], error: 'duplicate' };
  if (uniq.length > EDICT_MAX) return { ok: false, ids: [], error: 'too_many' };
  for (const id of uniq) {
    if (!edictDef(id)) return { ok: false, ids: [], error: 'unknown' };
    if (!isUnlocked(record, 'edict', id)) return { ok: false, ids: [], error: 'locked' };
  }
  return { ok: true, ids: uniq, error: null };
}

// 由祖訓 id 清單合成 state.edicts 的形狀（同 key 合併）。空清單回傳 {}。
export function edictMods(ids) {
  const out = {};
  for (const id of ids) {
    const def = edictDef(id);
    if (!def) continue;
    for (const [key, m] of Object.entries(def.mods)) {
      const cur = out[key] ?? { add: 0, mul: 1 };
      out[key] = {
        add: cur.add + (m.add ?? 0),
        mul: cur.mul * (m.mul ?? 1),
      };
    }
  }
  return out;
}

// 寫入本局：只接受合規清單（不合規時丟出錯誤，呼叫端應先以 validateEdictChoice 檢查）。
export function applyEdicts(state, ids, record) {
  const v = validateEdictChoice(ids, record);
  if (!v.ok) throw new Error(`invalid edicts: ${v.error}`);
  state.edicts = edictMods(v.ids);
  return state;
}

// 供模擬與測試使用：不經解鎖檢查，直接寫入指定祖訓（仍限上限與未知 id）。
export function applyEdictsUnchecked(state, ids) {
  if (!Array.isArray(ids) || ids.length > EDICT_MAX) throw new Error('invalid edicts');
  for (const id of ids) if (!edictDef(id)) throw new Error(`unknown edict: ${id}`);
  state.edicts = edictMods([...new Set(ids)]);
  return state;
}

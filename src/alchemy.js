// 煉丹側線的丹毒與方士邏輯（自 side-events.js 拆出；side-events.js 以 re-export 保留介面）。
//
// 狀態（懶初始化，僅在首次煉丹時建立；預設不煉丹則 state.sideEvents.alchemy 不存在）：
//   state.sideEvents.alchemy = { toxicity, doses, fangshi }
//     toxicity  丹毒 0..TOXICITY_MAX，每服上升（依丹藥種類），每月緩降
//     doses     服丹次數
//     fangshi   方士影響力 0..100，每服上升，每月緩降
//
// 三段門檻：甲（丹毒中）每月健康流失；乙（丹毒高）設旗標 alchemy:paranoid，部分奏摺選項以 flag_not 鎖定；
// 丙（方士影響力）每月可能觸發方士干政，極端時經 assassination.js 的 attemptFangshiCoup 觸發政變。
//
// 丹毒致死（原決定：允許丹毒直接致死）：月結時丹毒已達 TOXICITY_LETHAL，健康歸 0，史冊寫入 kind 'alchemy_death'（cause 'toxicity'）；
// 另一條路徑是丹毒中段的每月健康流失歸零，同樣寫入 'alchemy_death'。煉丹失敗不致死（健康下限為 1）；
// endReason 仍為既有代碼 'death'（不新增結束代碼），由 turn.js 月結的健康 ≤ 0 判定寫入。
//
// 亂數：皆以 state.seed、年、月與 'alchemy' 系列雜湊取得，不消耗既有亂數流。
//   煉丹成敗        [seed, year, month, 'alchemy']
//   月結干政與政變  [seed, year, month, 'alchemy', 'tick' | 'coup']（與成敗擲骰分流，避免同月相關）

import { makeRng } from './rng.js';
import { setStat } from './state.js';
import { isCourtOfficial } from './officials.js';
import { attemptFangshiCoup } from './assassination.js';
import {
  PILLS, DEFAULT_PILL, TOXICITY_MAX, TOXICITY_DECAY, TOXICITY_LETHAL, FANGSHI_DECAY,
  TOXICITY_HARM, TOXICITY_PARANOID, FANGSHI_TIER, TOXICITY_HEALTH_LOSS, PARANOID_FLAG,
  FANGSHI_EVENT_CHANCE, FANGSHI_COUP_THRESHOLD, FANGSHI_COUP_CHANCE, FANGSHI_EVENT,
} from './alchemy-data.js';

export const ALCHEMY_COST = 20; // 煉丹：國庫耗費（無論成敗）
export const ALCHEMY_SUCCESS_CHANCE = 0.5;
export const ALCHEMY_REWARD = Object.freeze({ health: 6, charm: 3 });
export const ALCHEMY_BACKFIRE = Object.freeze({ health: -4 });

const monthIndex = (state) => (state.year - 1) * 12 + (state.month - 1);

// 側線基底欄位（與 side-events.js 的 ensureSideEvents 預設相同；此處獨立以免循環匯入）。
function ensureBase(state) {
  if (!state.sideEvents) state.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1 };
  return state.sideEvents;
}

// 丹毒狀態（懶建立，僅於煉丹時呼叫）。
export function ensureAlchemy(state) {
  const se = ensureBase(state);
  if (!se.alchemy) se.alchemy = { toxicity: 0, doses: 0, fangshi: 0 };
  return se.alchemy;
}

// 唯讀：目前丹毒狀態，未曾煉丹時為 null。
export function alchemyState(state) {
  return state.sideEvents?.alchemy ?? null;
}

// 煉丹可用性（唯讀，不建立欄位）：{ ok, reason }；reason 為 disabled / cooldown / treasury 之一，可用時為 null。
// attemptAlchemy 與介面皆以此為準，確保按鈕狀態與實際裁決一致。
export function alchemyStatus(state) {
  const se = state.sideEvents;
  if (se?.enabled === false) return { ok: false, reason: 'disabled' };
  if (se?.alchemyMonth === monthIndex(state)) return { ok: false, reason: 'cooldown' };
  if (state.stats.treasury < ALCHEMY_COST) return { ok: false, reason: 'treasury' };
  return { ok: true, reason: null };
}

// 煉丹：每月至多一次。回傳 { ok, reason, outcome, effects }；reason 為 disabled / cooldown / treasury 時 ok 為 false 且狀態不變。
// 煉丹失敗的健康代價以 1 為下限：失敗不致死。
export function attemptAlchemy(state, pill = DEFAULT_PILL) {
  const se = ensureBase(state); // 與舊版相同：嘗試即建立側線欄位（僅於煉丹呼叫時發生）
  const st = alchemyStatus(state);
  if (!st.ok) return { ok: false, reason: st.reason, outcome: null, effects: null };
  const p = PILLS[pill];
  if (!p) throw new Error(`unknown pill: ${pill}`);
  const a = ensureAlchemy(state);

  se.alchemyMonth = monthIndex(state);
  setStat(state, 'treasury', state.stats.treasury - ALCHEMY_COST);
  const rng = makeRng([state.seed, state.year, state.month, 'alchemy']);
  const success = rng() < ALCHEMY_SUCCESS_CHANCE;
  const effects = success ? ALCHEMY_REWARD : ALCHEMY_BACKFIRE;
  for (const [key, delta] of Object.entries(effects)) {
    // 失敗的健康代價不得使健康低於 1（煉丹失敗不致死）。
    const next = key === 'health' ? Math.max(1, state.stats.health + delta) : state.stats[key] + delta;
    setStat(state, key, next, { silent: true });
  }

  a.doses += 1;
  a.toxicity = Math.min(TOXICITY_MAX, a.toxicity + p.toxicityGain);
  a.fangshi = Math.min(100, a.fangshi + p.fangshiGain);
  return { ok: true, reason: null, outcome: success ? 'success' : 'failure', effects };
}

// 死因為丹毒者寫入史冊。
function recordAlchemyDeath(state, cause) {
  state.chronicle.push({
    kind: 'alchemy_death',
    cause,
    generation: state.dynasty.generation,
    year: state.year,
    month: state.month,
  });
}

// 月結（於 turn.js 的健康 ≤ 0 判定之前呼叫）。未煉丹者直接回傳 null，不改變任何狀態。
export function tickAlchemy(state) {
  const a = alchemyState(state);
  if (!a) return null;
  const rng = makeRng([state.seed, state.year, state.month, 'alchemy', 'tick']);

  // 直接致死：月初丹毒已達 TOXICITY_LETHAL，駕崩；死因為丹毒，史冊記一筆（endReason 由 turn.js 健康 ≤ 0 判定寫入）。
  if (a.toxicity >= TOXICITY_LETHAL) {
    setStat(state, 'health', 0, { silent: true });
    recordAlchemyDeath(state, 'toxicity');
    return null;
  }

  a.toxicity = Math.max(0, a.toxicity - TOXICITY_DECAY);
  a.fangshi = Math.max(0, a.fangshi - FANGSHI_DECAY);

  // 乙段：丹毒高則設旗標，低於門檻即清除（旗標為假視同未設）。
  if (a.toxicity >= TOXICITY_PARANOID) {
    state.flags = state.flags ?? {};
    state.flags[PARANOID_FLAG] = true;
  } else if (state.flags?.[PARANOID_FLAG]) {
    state.flags[PARANOID_FLAG] = false;
  }

  // 甲段：丹毒中每月健康流失。由此流失歸零者，死因為丹毒。
  let toxicityKilled = false;
  if (a.toxicity >= TOXICITY_HARM) {
    setStat(state, 'health', state.stats.health - TOXICITY_HEALTH_LOSS, { silent: true });
    toxicityKilled = state.stats.health <= 0;
  }

  if (state.stats.health <= 0 && toxicityKilled) recordAlchemyDeath(state, 'toxicity');

  // 丙段：方士干政（皇權流失、清流朝臣忠誠下滑）。史冊記一筆。
  let intrigue = false;
  if (a.fangshi >= FANGSHI_TIER && rng() < FANGSHI_EVENT_CHANCE) {
    intrigue = true;
    setStat(state, 'power', state.stats.power + FANGSHI_EVENT.power, { silent: true });
    for (const o of state.officials) {
      if (isCourtOfficial(o) && o.faction === 'qingliu') {
        o.loyalty = Math.max(0, o.loyalty + FANGSHI_EVENT.qingliuLoyalty);
      }
    }
    state.chronicle.push({ kind: 'fangshi', year: state.year, month: state.month });
  }

  return { toxicity: a.toxicity, fangshi: a.fangshi, intrigue };
}

// 丙段極端：方士影響力達門檻時，每月以小機率觸發政變（經 assassination.js 既有皇帝刺殺結果）。
// 須於月結死亡判定之後、且皇帝仍在位時呼叫。
export function tickFangshiCoup(state) {
  const a = alchemyState(state);
  if (!a || a.fangshi < FANGSHI_COUP_THRESHOLD) return null;
  const rng = makeRng([state.seed, state.year, state.month, 'alchemy', 'coup']);
  if (!(rng() < FANGSHI_COUP_CHANCE)) return null;
  return attemptFangshiCoup(state, rng);
}

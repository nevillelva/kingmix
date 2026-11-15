// 遊戲狀態頂層欄位的結構宣告（純資料，不改變行為）。
//
// 每個欄位列出：預設值工廠 default(state)（每次呼叫回傳新物件）與允許的型別 type。
// 這些欄位原本由各模組的 ensureX() 或月初流程懶初始化；此處集中定義，讓 ensureX 與
// 存檔遷移（save.js 的 migrateState）共用同一份預設值，避免兩處定義分歧。
//
// applySchemaDefaults(state) 只補缺（欄位為 undefined 才寫入），不覆寫既有值，重複呼叫冪等。
// createInitialState 的結構（含官員清單）不在此處宣告；巢狀缺漏仍由 save.js 的 fillMissing 處理。

import { createPrefectures } from './economy.js';
import { createEra } from './era.js';
import { NEIGHBORS } from './diplomacy.js';
import { CAPITAL_PREFECTURE } from './events.js';

// 狀態結構版本（save.js 的 STATE_SCHEMA_VERSION 與此相同，由此匯出）。
export const SCHEMA_VERSION = 1;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export const SCHEMA = Object.freeze({
  // 六府經濟（economy.js ensureEconomy）
  economy: { type: ['object'], default: () => ({ tax: '中', efficiency: 1 }) },
  // 州府（economy.js ensureEconomy 以 state.seed 建立；city.js ensureCity 補戰防欄位）
  prefectures: { type: ['array'], default: (s) => createPrefectures(s.seed) },
  // 年號（era.js ensureEra 以 state.year 作為起始年）
  era: { type: ['object'], default: (s) => createEra(null, s.year) },
  // 國策卡（cards.js ensureCardState）
  policyCards: { type: ['object'], default: () => ({ active: [], offer: null }) },
  // 派系逼迫（factions.js ensurePressure）
  factionPressure: { type: ['object'], default: () => ({ forcedFaction: null, forcedMonths: 0, forcedPolicies: [] }) },
  // 道具庫存（items.js ensureInventory）
  inventory: { type: ['object'], default: () => ({}) },
  // 官員關係（relations.js ensureRelState 與 addRelation）
  relState: { type: ['object'], default: () => ({ known: null, impeachment: null, guilt: [], spared: null }) },
  relations: { type: ['array'], default: () => [] },
  // 共歷羈絆（bonds.js ensureBonds）
  bonds: { type: ['object'], default: () => ({ shared: {}, unlocked: {} }) },
  // 人物命運線進度（fates.js，鍵為 "角色:id"）
  fates: { type: ['object'], default: () => ({}) },
  // 後宮（harem.js ensureHarem）。fill: false：harem.js 的 tickHarem 以「無妃嬪且無 harem 欄位」
  // 作為整段略過的條件，故載入時不自動補上，僅於 ensureHarem 懶建立時使用此預設值。
  harem: {
    type: ['object'],
    fill: false,
    default: () => ({ demands: [], nextDemandId: 1, waijia: {}, dominant: null, taihou: { power: 0 } }),
  },
  // 外交（diplomacy.js diplomacyOf，以鄰國 id 為鍵）
  diplomacy: {
    type: ['object'],
    default: () => Object.fromEntries(NEIGHBORS.map((n) => [n.id, { attitude: n.attitude, allied: false, kin: 0 }])),
  },
  diplomacyLog: { type: ['array'], default: () => [] },
  // 集藏收藏（collections.js）
  collections: { type: ['object'], default: () => ({ bonuses: [] }) },
  // 奏摺選擇紀錄（turn.js afterOption）
  choices: { type: ['object'], default: () => ({}) },
  // 歷年紀錄（month.js 退場時寫入）
  annals: { type: ['array'], default: () => [] },
  // 月初奏摺鏈（month-start.js prepareMonth）
  monthChain: { type: ['object', 'null'], default: () => null },
  // 親征進行中的戰役（campaign.js，結束後設為 null）
  campaign: { type: ['object', 'null'], default: () => null },
  // 設施等級（facilities.js levelOf，缺漏視為 0 級）
  facilities: { type: ['object'], default: () => ({}) },
  // 連鎖事件佇列（chains.js）
  pendingChain: { type: ['array'], default: () => [] },
  // 事件歷史（events.js recordEvent）
  eventHistory: { type: ['object'], default: () => ({ counts: {}, last: {} }) },
  // 巡幸（tour.js ensureTour）
  tour: { type: ['object'], default: () => ({ busyUntil: -1 }) },
  location: { type: ['string'], default: () => CAPITAL_PREFECTURE },
  // 旗標（month-start.js、selection.js 以 state.flags || {} 讀寫）
  flags: { type: ['object'], default: () => ({}) },
});

export const SCHEMA_FIELDS = Object.freeze(Object.keys(SCHEMA));

// 取得某欄位的新預設值（每次呼叫都是新物件）。state 供需要種子或年份的工廠使用。
export function defaultOf(name, state) {
  const spec = SCHEMA[name];
  if (!spec) throw new Error(`unknown schema field: ${name}`);
  return spec.default(state);
}

// 欄位值是否符合宣告的型別。
export function matchesType(name, value) {
  const spec = SCHEMA[name];
  if (!spec) throw new Error(`unknown schema field: ${name}`);
  return spec.type.includes(typeOf(value));
}

// 只補缺：欄位為 undefined 時寫入預設值；既有值（含 null）一律保留。就地修改並回傳 state。
// fill: false 的欄位不自動補（其缺漏本身是行為條件），僅供 ensureX 懶建立使用。
export function applySchemaDefaults(state) {
  for (const name of SCHEMA_FIELDS) {
    if (SCHEMA[name].fill === false) continue;
    if (state[name] === undefined) state[name] = defaultOf(name, state);
  }
  return state;
}

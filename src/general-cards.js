// 將領卡：校場朝臣列表的卡片資料組裝（純函式，只讀取官員物件，不改動任何狀態）。
// 資料來源皆為既有欄位：姓名（personName／name）、忠誠、派系、所任官職、年齡、特質、能力（統御、武略）。
// 模型中沒有獨立的「經歷」或「兵力」欄位：經歷以年齡與任官狀態呈現，兵力以統御值呈現（不另造數值）。
// 忠誠警示門檻引用既有常數 ASSASSIN_LOW_LOYALTY（忠誠低於此值視為「離心」），不另定新數字。

import { ASSASSIN_LOW_LOYALTY } from './assassination.js';
import { describeTraits, FACTION_NAMES } from './people.js';

// 武職清單：官員目前所任官職（official.office）屬於此清單者視為武將。
// 來源皆為 src/offices.js 的 OFFICES 既有鍵，未另行新增職位：
//   war：兵部尚書（OFFICES.war）。名稱為文官部院的長官，但職掌軍政，依使用者決定列為武職。
// 目前沒有「大將軍」「校場統領」等職位定義，故不列入；日後新增軍職時於此陣列加入鍵並附來源註解。
export const MILITARY_OFFICES = ['war'];

// 武將判定：依官員目前職位。無職位（office 為 null／缺欄位）或職位不在武職清單者，視為非武將。
// 純函式，只讀取 office 欄位，不改動官員物件，不影響模擬隨機序列。
export function isGeneral(official) {
  const office = official && typeof official === 'object' ? official.office : null;
  return typeof office === 'string' && MILITARY_OFFICES.includes(office);
}

// 回傳卡片欄位；缺欄位時以 null 或預設文字代替，不拋例外。
export function buildGeneralCard(official) {
  const o = official && typeof official === 'object' ? official : {};
  const name = String(o.personName || o.name || o.id || '');
  const loyalty = Number.isFinite(o.loyalty) ? Math.round(o.loyalty) : null;
  const abilities = o.abilities && typeof o.abilities === 'object' ? o.abilities : {};
  const traits = describeTraits(o).slice(0, 2);
  const factionName = FACTION_NAMES[o.faction] ?? '無派';
  return {
    id: o.id ?? null,
    name,
    initial: Array.from(name)[0] ?? '？',
    faction: o.faction ?? null,
    factionName,
    office: o.office ?? null,
    loyalty,
    loyaltyWarn: loyalty !== null && loyalty < ASSASSIN_LOW_LOYALTY,
    loyaltyWarnBelow: ASSASSIN_LOW_LOYALTY,
    tags: traits.length ? traits : [factionName],
    age: Number.isFinite(o.age) ? o.age : null,
    command: Number.isFinite(abilities.command) ? abilities.command : null,
    martial: Number.isFinite(abilities.martial) ? abilities.martial : null,
  };
}

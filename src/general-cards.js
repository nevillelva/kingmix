// 將領卡：校場朝臣列表的卡片資料組裝（純函式，只讀取官員物件，不改動任何狀態）。
// 資料來源皆為既有欄位：姓名（personName／name）、忠誠、派系、所任官職、年齡、特質、能力（統御、武略）。
// 模型中沒有獨立的「經歷」或「兵力」欄位：經歷以年齡與任官狀態呈現，兵力以統御值呈現（不另造數值）。
// 忠誠警示門檻引用既有常數 ASSASSIN_LOW_LOYALTY（忠誠低於此值視為「離心」），不另定新數字。

import { ASSASSIN_LOW_LOYALTY } from './assassination.js';
import { describeTraits, FACTION_NAMES } from './people.js';

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

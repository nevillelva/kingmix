// 收藏：九鼎、四寶、名劇三套。進度以 state.flags["col:<項目>"] 表示，
// 因此既有的 setFlag 效果即可讓事件送出收藏項目，無需新增效果鍵。
// 集齊一套時，該套的永久加成（一次性提升對應屬性）只套用一次。

import { setStat } from './state.js';

export const COLLECTIONS = {
  jiuding: {
    id: 'jiuding', name: '九鼎', items: Array.from({ length: 9 }, (_, i) => `jiuding_${i + 1}`),
    bonus: { stat: 'power', amount: 20 },
  },
  sibao: {
    id: 'sibao', name: '四寶', items: ['sibao_wen', 'sibao_wu', 'sibao_bi', 'sibao_mo'],
    bonus: { stat: 'literature', amount: 30 },
  },
  mingju: {
    id: 'mingju', name: '名劇', items: ['mingju_1', 'mingju_2', 'mingju_3'],
    bonus: { stat: 'charm', amount: 30 },
  },
};

const SET_OF = new Map();
for (const set of Object.values(COLLECTIONS)) for (const item of set.items) SET_OF.set(item, set.id);

export const itemFlag = (item) => `col:${item}`;

export function collectionProgress(state, setId) {
  const set = COLLECTIONS[setId];
  if (!set) throw new Error(`unknown collection: ${setId}`);
  const have = set.items.filter((item) => state.flags[itemFlag(item)] === true).length;
  return { id: setId, name: set.name, have, total: set.items.length, complete: have === set.items.length };
}

// 收得一件收藏項目。重複收得無效；集齊時回傳該套 id 並套用加成。
export function collectItem(state, item) {
  const setId = SET_OF.get(item);
  if (!setId) throw new Error(`unknown collection item: ${item}`);
  if (state.flags[itemFlag(item)]) return { added: false, completed: null };
  state.flags[itemFlag(item)] = true;
  state.collections = state.collections || { bonuses: [] };
  const before = collectionProgress(state, setId);
  const set = COLLECTIONS[setId];
  const justCompleted = before.complete && !state.collections.bonuses.includes(setId);
  if (justCompleted) {
    state.collections.bonuses.push(setId);
    setStat(state, set.bonus.stat, state.stats[set.bonus.stat] + set.bonus.amount);
  }
  return { added: true, completed: justCompleted ? setId : null };
}

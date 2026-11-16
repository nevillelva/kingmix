// 共用訴求佇列工具（由 harem.js 的請求模式抽出）。
//
// 佇列以「視圖」形式包住任一擁有 items 陣列與 nextId 計數的物件，例如：
//   const q = queueView(h, 'demands', 'nextDemandId');
// 所有操作皆就地修改底層物件；行為與抽出前的 harem.js 完全相同。

export const OPEN = 'open';

export function queueView(holder, listKey, idKey) {
  return {
    get items() { return holder[listKey]; },
    set items(v) { holder[listKey] = v; },
    get nextId() { return holder[idKey]; },
    set nextId(v) { holder[idKey] = v; },
  };
}

// 新增一筆（狀態為 open），id 由計數器遞增取得。欄位順序：id、fields…、status。
export function enqueue(q, fields) {
  const item = { id: q.nextId, ...fields, status: OPEN };
  q.items.push(item);
  q.nextId += 1;
  return item;
}

export function openItems(q) {
  return q.items.filter((x) => x.status === OPEN);
}

// 裁決：僅對 open 項目生效，寫入 status（與 extra 欄位），回傳該項目；否則回傳 null。
export function resolve(q, id, status, extra = {}) {
  const item = q.items.find((x) => x.id === id);
  if (!item || item.status !== OPEN) return null;
  item.status = status;
  Object.assign(item, extra);
  return item;
}

// 上限：只保留最後 max 筆（就地以新陣列取代）。
export function cap(q, max) {
  if (q.items.length > max) q.items = q.items.slice(-max);
}

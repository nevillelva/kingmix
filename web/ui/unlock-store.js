// web/ui/unlock-store.js：傳承解鎖紀錄的瀏覽器端存取（localStorage）。純規則見 src/unlocks.js。
// 不匯入 state-io.js，以免形成循環依賴；寫入失敗由呼叫端顯示訊息。
import { readUnlockRecord, recordEarnedTitles, unlockedIds, writeUnlockRecord } from '../../src/unlocks.js';
import { setUnlockedPolicyCards } from '../../src/cards.js';

export const UNLOCK_KEY = 'kingmix-unlocks-v1';

let cache = null;

function current() {
  if (!cache) {
    let r = { record: { version: 1, titles: [] }, readOnly: false };
    try { r = readUnlockRecord(globalThis.localStorage, UNLOCK_KEY); } catch (e) { /* 無儲存空間：維持預設 */ }
    cache = r;
  }
  return cache;
}

// 讀取目前解鎖紀錄（唯讀用途）。
export function loadUnlocks() {
  return current().record;
}

// 併入本局稱號並寫回；有新增且寫入失敗時 writeFailed 為 true，記憶體中的解鎖仍保留於本次工作階段。
// 同時將已解鎖的傳承策卡注入抽卡池（未解鎖者不進池）。
export function syncUnlocks(state) {
  const cur = current();
  let writeFailed = false;
  if (state && !cur.readOnly) {
    const next = recordEarnedTitles(cur.record, state);
    if (next.titles.length !== cur.record.titles.length) {
      writeFailed = !writeUnlockRecord(globalThis.localStorage, UNLOCK_KEY, next);
      cache = { record: next, readOnly: false };
    }
  }
  setUnlockedPolicyCards(unlockedIds(cache.record, 'card'));
  return { record: cache.record, writeFailed };
}

export const UNLOCK_FAIL_MSG = '傳承解鎖紀錄無法寫入瀏覽器（儲存空間可能已滿），本次解鎖於重新整理後可能遺失。';

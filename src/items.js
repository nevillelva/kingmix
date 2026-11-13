// 寶物與賞賜：御賜寶劍、丹藥、字畫三類。皇帝可將持有之物賞賜給朝臣（official）或妃嬪（consort）。
//
// 資料模型：
//   state.inventory = { <itemId>: 件數 }（懶初始化）。
//   每當件數 > 0，同步寫入 state.flags["col:<itemId>"] = true；件數歸零則移除旗標。
//   如此事件的 flag 條件（見下）即可判斷持有，無需修改 events.js。
//   注意：events.js 的 has_item 條件僅認得收藏（collections.js）項目，對寶物 id 會拋錯，故寶物事件一律改用 flag。
//
// 事件可用的條件與效果鍵（寶物事件請只用這些）：
//   條件  flag: "col:<itemId>"     → 持有該寶物時成立（件數 > 0）。
//   效果  setFlag: "col:<itemId>"  → 寶物入手（既有 setFlag 效果，無新增鍵）。
//         同一選項只能有一個 setFlag，故一次只能獲得一件；已持有時重複 setFlag 無效（件數不增加）。
//   「每年／定期掉落」以事件的 every_years（與 months）條件實現：例如 every_years 2、months [4] 為每兩年四月一次。
//   賞賜不由事件發動，須由玩家（介面）呼叫 giveItem，事件不可替玩家賞賜。
//
// 賞賜效果（giveItem）：
//   官員：忠誠 +GIFT_LOYALTY_OFFICIAL（上限 100）。
//   妃嬪：寵愛 +GIFT_FAVOR_CONSORT（上限 100）。
//   數值（GIFT_LOYALTY_OFFICIAL、GIFT_FAVOR_CONSORT）為暫定，見本檔常數。

export const ITEMS = Object.freeze([
  { id: 'yujian', name: '御賜寶劍', desc: '皇帝親賜之劍，象徵天恩，可賜予重臣以示信任。' },
  { id: 'danyao', name: '丹藥', desc: '丹房所進之丹，珍貴難得，賜予妃嬪或近臣可示恩寵。' },
  { id: 'zihua', name: '字畫', desc: '名家墨寶，文雅之物，賜予文臣或妃嬪最為相宜。' },
]);

export const GIFT_LOYALTY_OFFICIAL = 6;
export const GIFT_FAVOR_CONSORT = 8;

const ITEM_IDS = new Set(ITEMS.map((i) => i.id));
const flagKey = (itemId) => `col:${itemId}`;

function assertItem(itemId) {
  if (!ITEM_IDS.has(itemId)) throw new Error(`unknown item: ${itemId}`);
}

function ensureInventory(state) {
  state.inventory = state.inventory || {};
  return state.inventory;
}

// 有效件數：inventory 計數與旗標取較大者（事件以 setFlag 獲得時，inventory 可能為 0 而旗標為真）。
function countOf(state, itemId) {
  const n = state.inventory?.[itemId] || 0;
  return Math.max(n, state.flags[flagKey(itemId)] === true ? 1 : 0);
}

// 同步旗標：依 inventory 計數（不含旗標本身）決定，件數 > 0 設為真，否則移除。
function syncFlag(state, itemId) {
  if ((state.inventory?.[itemId] || 0) > 0) state.flags[flagKey(itemId)] = true;
  else delete state.flags[flagKey(itemId)];
}

export function hasItem(state, itemId) {
  assertItem(itemId);
  return countOf(state, itemId) > 0;
}

// 回傳所有寶物類別的持有件數（件數為 0 者亦列出，供介面顯示缺項）。
export function listInventory(state) {
  return ITEMS.map((i) => ({ id: i.id, name: i.name, count: countOf(state, i.id) }));
}

export function addItem(state, itemId, n = 1) {
  assertItem(itemId);
  if (!Number.isInteger(n) || n < 1) throw new Error(`invalid count: ${n}`);
  const inv = ensureInventory(state);
  inv[itemId] = countOf(state, itemId) + n;
  syncFlag(state, itemId);
  return state;
}

function clampTo100(v) {
  return Math.min(100, Math.max(0, v));
}

// 賞賜寶物。targetKind 為 'official'（依 id 於 state.officials 尋找）或 'consort'（依 id 於 state.consorts 尋找）。
// 失敗時狀態不變。reason：'ok' | 'bad_target_kind' | 'not_owned' | 'no_target'（另有 unknown item 會拋錯）。
export function giveItem(state, itemId, targetKind, targetId) {
  assertItem(itemId);
  if (targetKind !== 'official' && targetKind !== 'consort') {
    return { state, ok: false, reason: 'bad_target_kind' };
  }
  if (countOf(state, itemId) < 1) return { state, ok: false, reason: 'not_owned' };
  if (targetKind === 'official') {
    const official = state.officials.find((o) => o.id === targetId);
    if (!official) return { state, ok: false, reason: 'no_target' };
    official.loyalty = clampTo100(official.loyalty + GIFT_LOYALTY_OFFICIAL);
  } else {
    const consort = state.consorts.find((c) => c.id === targetId);
    if (!consort) return { state, ok: false, reason: 'no_target' };
    consort.favor = clampTo100((consort.favor ?? 0) + GIFT_FAVOR_CONSORT);
  }
  const inv = ensureInventory(state);
  inv[itemId] = countOf(state, itemId) - 1;
  syncFlag(state, itemId);
  return { state, ok: true, reason: 'ok' };
}

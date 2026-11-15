// 新年覆蓋層的 localStorage 鍵清理（M1）。每個種子一鍵 kingmix.newyear.<seed>；
// 開新局或載入存檔時，刪除所有非當前種子的新年鍵，使鍵數上限為 1（當前種子）。
// 不依賴其他 ui 模組，避免與 game-flow／state-io 形成循環依賴。
const PREFIX = 'kingmix.newyear.';

export function pruneNewYearKeys(keepSeed) {
  const keep = `${PREFIX}${keepSeed}`;
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== keep) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
    return dead.length;
  } catch (e) {
    return 0;
  }
}

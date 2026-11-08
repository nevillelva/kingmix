// 確定性隨機數（反 SL 機制的基礎）。
// 同一組 parts（例如 [seed, year, month, "events"]）永遠產生同一串數字。

export function hashSeed(parts) {
  const s = parts.map(String).join('|');
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32：小而快、品質足夠遊戲使用的 PRNG，回傳 [0, 1)
export function makeRng(parts) {
  let a = hashSeed(parts);
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 奏摺的發言大臣：由既有官員池（state.officials）以 (seed, 事件, 年, 月) 決定性地指定一位。
// 事件的 speaker 欄位為官職名（如「戶部尚書」），僅作為身分提示；官員池為空時退回官職名。
// 使用獨立的 makeRng 路徑，不影響事件抽選的隨機序列。

import { makeRng } from './rng.js';

export function pickSpeaker(state, event) {
  const role = event.speaker || '';
  const pool = (state.officials || []).filter((o) => o && (o.personName || o.name));
  if (pool.length === 0) return { role, name: role, officialId: null };
  const rng = makeRng([state.seed, 'speaker', event.id, state.year, state.month]);
  const o = pool[Math.floor(rng() * pool.length)];
  return { role, name: o.personName || o.name, officialId: o.id };
}

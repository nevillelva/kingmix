// 事件已併入 data/events.json；各子系統的測試依 ID 區段取出自己的事件。
import { readFileSync } from 'node:fs';

const ALL = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;

export function eventsRange(lo, hi) {
  return ALL.filter((e) => {
    const n = Number(String(e.id).slice(1));
    return /^E\d+$/.test(e.id) && n >= lo && n <= hi;
  });
}

// 用法：node scripts/audit-balance.js [runs=60] [months=600]
// 以固定種子跑多局無頭模擬，輸出結束方式、平均事件數、王朝中斷率等基本指標。
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';

const runs = Number(process.argv[2] ?? 60);
const months = Number(process.argv[3] ?? 600);
const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

const endReasons = {};
let dynastyBreaks = 0;
let totalTriggered = 0;
let maxTriggered = 0;
for (let i = 0; i < runs; i++) {
  const r = runSimulation({ seed: `audit-${i}`, months, events });
  const reason = r.endReason ?? (r.alive ? 'alive' : 'unknown');
  endReasons[reason] = (endReasons[reason] ?? 0) + 1;
  if (r.dynastyEnded) dynastyBreaks++;
  const counts = Object.values(r.triggered ?? {});
  const n = counts.reduce((a, b) => a + b, 0);
  totalTriggered += n;
  maxTriggered = Math.max(maxTriggered, ...counts);
}

console.log(JSON.stringify({
  runs,
  months,
  endReasons,
  dynastyInterruptRate: +(dynastyBreaks / runs).toFixed(3),
  avgTriggeredCount: +(totalTriggered / runs).toFixed(1),
  maxSingleEventCount: maxTriggered,
}, null, 2));

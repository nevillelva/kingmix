// 用法：node scripts/audit-balance.js [runs=60] [months=600] [--mode=long|short]
// --mode 預設 long；short 時月數若未指定則為 144。
// 以固定種子跑多局無頭模擬，輸出結束方式、平均事件數、王朝中斷率等基本指標。
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';

import { MODES } from '../src/mode.js';

const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.slice('--mode='.length) : 'long';
if (!MODES[mode]) throw new Error(`unknown mode: ${mode}`);
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(positional[0] ?? 60);
const months = Number(positional[1] ?? MODES[mode].months);
const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

const endReasons = {};
let dynastyBreaks = 0;
let totalTriggered = 0;
let maxTriggered = 0;
let dcTotal = 0;
for (let i = 0; i < runs; i++) {
  const r = runSimulation({ seed: `audit-${i}`, months, events, mode });
  const reason = r.endReason ?? (r.alive ? 'alive' : 'unknown');
  endReasons[reason] = (endReasons[reason] ?? 0) + 1;
  if (r.dynastyEnded) dynastyBreaks++;
  // DC 是東廠行動的內部計數鍵，不是奏摺事件；單事件上限只看真正的奏摺事件。
  const memorial = Object.entries(r.triggered ?? {}).filter(([id]) => id !== 'DC');
  const counts = memorial.map(([, n]) => n);
  const n = counts.reduce((a, b) => a + b, 0);
  totalTriggered += n;
  maxTriggered = Math.max(maxTriggered, ...counts, 0);
  dcTotal += r.triggered?.DC ?? 0;
}

console.log(JSON.stringify({
  runs,
  mode,
  months,
  endReasons,
  dynastyInterruptRate: +(dynastyBreaks / runs).toFixed(3),
  avgTriggeredCount: +(totalTriggered / runs).toFixed(1),
  maxSingleEventCount: maxTriggered,
  avgDongchangActions: +(dcTotal / runs).toFixed(1),
}, null, 2));

// 平衡稽核：200 seeds × 40 年，統計死諫（E420）每局次數與設施相關數值漂移。
// 用法：node scripts/balance-e420.js
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const SEEDS = 200;
const YEARS = 40;
const FACILITY_STATS = ['charm', 'health', 'literature'];

const counts = [];
const statSums = Object.fromEntries(FACILITY_STATS.map((k) => [k, []]));

for (let i = 1; i <= SEEDS; i++) {
  const r = runSimulation({ seed: String(i), months: YEARS * 12, events });
  counts.push(r.triggered.E420 ?? 0);
  for (const k of FACILITY_STATS) statSums[k].push(r.stats[k]);
}

const sorted = [...counts].sort((a, b) => a - b);
const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const hist = {};
for (const c of counts) hist[c] = (hist[c] || 0) + 1;

console.log(`runs: ${SEEDS} seeds × ${YEARS} years (mode default, policy default)`);
console.log(`E420 per run: mean ${mean.toFixed(3)}, min ${sorted[0]}, p10 ${pct(10)}, median ${pct(50)}, p90 ${pct(90)}, max ${sorted[sorted.length - 1]}`);
console.log(`E420 histogram (count per run -> runs): ${JSON.stringify(hist)}`);
console.log(`runs with E420 >= 1: ${counts.filter((c) => c >= 1).length}/${SEEDS}`);
console.log('facility note: runSimulation has no facility purchase path and does not return state.facilities, so facility levels stay 0 here and the facility drift is 0 by construction');
for (const k of FACILITY_STATS) {
  const v = statSums[k];
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`final ${k}: mean ${m.toFixed(2)}, min ${Math.min(...v).toFixed(2)}, max ${Math.max(...v).toFixed(2)}`);
}

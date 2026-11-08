// 用法：node scripts/simulate.js [seed] [years]
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const seed = process.argv[2] ?? 'demo';
const years = Number(process.argv[3] ?? 10);

console.log(JSON.stringify(runSimulation({ seed, months: years * 12, events }), null, 2));

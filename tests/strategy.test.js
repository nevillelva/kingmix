// 玩家策略檢驗：每個策略profile 以 6 個種子跑 120 個月，皆須完整結束且 endReason 合法。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';
import { STRATEGY_PROFILES } from '../src/strategy.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const SEEDS = Array.from({ length: 6 }, (_, i) => `strategy-${i}`);
const VALID_END_REASONS = [null, 'death', 'abdicated', 'assassinated'];

for (const [name, choose] of Object.entries(STRATEGY_PROFILES)) {
  test(`strategy profile "${name}" completes 6 seeds x 120 months with a valid endReason`, () => {
    for (const seed of SEEDS) {
      const r = runSimulation({ seed, months: 120, events, choose: choose ?? undefined });
      assert.ok(VALID_END_REASONS.includes(r.endReason ?? null), `invalid endReason ${r.endReason} for ${seed}`);
      assert.equal(typeof r.alive, 'boolean');
      if (r.alive) assert.equal(r.endReason ?? null, null);
    }
  });
}

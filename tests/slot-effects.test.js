import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { takeSlot, applySlotEffect, AUDIENCE_LOYALTY, REVIEW_MILITARY, GARDEN_CHARM, HAREM_CHARM, DC_POWER } from '../src/slot-effects.js';
import { applySimPolicy, defaultSimPolicy } from '../src/sim-policy.js';
import { ensureAgency, periodSpent } from '../src/slots.js';

const fresh = (seed) => createInitialState(seed);

test('takeSlot：午後一次只能選一項，第二次被拒且效果不重複套用', () => {
  const s = fresh('slot-1');
  const military = s.stats.military;
  assert.equal(takeSlot(s, 'afternoon', 'review').ok, true);
  assert.equal(s.stats.military, military + REVIEW_MILITARY);
  assert.equal(takeSlot(s, 'afternoon', 'garden').ok, false);
  assert.equal(s.stats.charm, fresh('slot-1').stats.charm);
});

test('各選項效果：軍事、魅力、健康、皇權', () => {
  const s = fresh('slot-2');
  const b = { military: s.stats.military, charm: s.stats.charm, health: s.stats.health, power: s.stats.power };
  applySlotEffect(s, 'afternoon', 'garden');
  assert.equal(s.stats.charm, b.charm + GARDEN_CHARM);
  applySlotEffect(s, 'night', 'harem');
  assert.equal(s.stats.charm, b.charm + GARDEN_CHARM + HAREM_CHARM);
  assert.equal(s.stats.health, b.health, '後宮不改變健康');
  applySlotEffect(s, 'night', 'dc');
  assert.equal(s.stats.power, b.power + DC_POWER);
});

test('召見大臣：在朝忠誠最低者 +AUDIENCE_LOYALTY，且不影響地方官', () => {
  const s = fresh('slot-3');
  const court = s.officials.filter((o) => !o.prefecture);
  const lowest = [...court].sort((a, b) => a.loyalty - b.loyalty || (a.id < b.id ? -1 : 1))[0];
  const before = lowest.loyalty;
  const others = Object.fromEntries(s.officials.map((o) => [o.id, o.loyalty]));
  applySlotEffect(s, 'afternoon', 'audience');
  assert.equal(lowest.loyalty, Math.min(100, before + AUDIENCE_LOYALTY));
  for (const o of s.officials) if (o.id !== lowest.id) assert.equal(o.loyalty, others[o.id]);
});

test('applySimPolicy：預設策略每月午後與夜間各記一次，確定性且同種子結果相同', () => {
  const run = () => {
    const s = fresh('slot-4');
    ensureAgency(s);
    applySimPolicy(s, defaultSimPolicy(), { seed: 'slot-4', year: 1, month: 1 });
    return { stats: s.stats, used: ensureAgency(s).used, a: periodSpent(s, 'afternoon'), n: periodSpent(s, 'night') };
  };
  const r1 = run();
  assert.deepEqual(run(), r1);
  assert.equal(r1.a, 1);
  assert.equal(r1.n, 1);
  assert.equal(r1.used, 2);
});

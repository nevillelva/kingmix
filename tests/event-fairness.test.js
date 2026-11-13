import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { isStateGated, pickWeight, STATE_GATED_BOOST, FIRED_ALPHA } from '../src/sim.js';
import { recordEvent } from '../src/events.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = new Map(events.map((e) => [e.id, e]));

test('isStateGated: numeric, policy and prior-choice conditions count; pure chance and timing do not', () => {
  assert.equal(isStateGated({ when: { treasury_lt: 50 } }), true);
  assert.equal(isStateGated({ when: { prior_choice: { event: 'E001' } } }), true);
  assert.equal(isStateGated({ when: { chance: 0.2, months: [3] } }), false);
  assert.equal(isStateGated({ when: { every_years: 2 } }), false);
  assert.equal(isStateGated({}), false);
});

test('pickWeight: a state-gated event outweighs an otherwise identical chance event', () => {
  const s = createInitialState('fair-1');
  const state = { e: { when: { treasury_lt: 999 } }, c: { when: { chance: 0.5 } } };
  assert.equal(pickWeight(state.e, s) / pickWeight(state.c, s), STATE_GATED_BOOST);
});

test('pickWeight: events that already fired this run weigh less, and neglected ones weigh more', () => {
  const s = createInitialState('fair-2');
  const e = { id: 'EFAIR', when: {} };
  const fresh = pickWeight(e, s);
  recordEvent(s, 'EFAIR');
  const justFired = pickWeight(e, s);
  assert.ok(justFired < fresh, 'a fired event is down-weighted at the same month');
  s.month = 12; s.year = 6; // 同一事件隔了一段時間未再觸發，權重回升
  assert.ok(pickWeight(e, s) > justFired, 'neglect bonus raises an event that has waited');
  assert.ok(FIRED_ALPHA > 0);
});

test('PR #97 events: E421–E470 exist, use only existing effect keys, and at least half are state-gated', () => {
  const added = [];
  for (let n = 421; n <= 470; n++) {
    const e = byId.get(`E${n}`);
    assert.ok(e, `E${n} must exist`);
    added.push(e);
  }
  const stateGated = added.filter(isStateGated).length;
  assert.ok(stateGated * 2 >= added.length, `state-gated ${stateGated}/${added.length}`);
  const allowed = new Set(['treasury', 'agriculture', 'benevolence', 'people', 'armament', 'charm', 'health', 'military', 'power', 'heaven', 'literature', 'commerce', 'prestige']);
  for (const e of added) for (const o of e.options) {
    for (const k of Object.keys(o.effects)) assert.ok(allowed.has(k), `${e.id} uses unknown effect ${k}`);
  }
});

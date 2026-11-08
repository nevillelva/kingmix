import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { scheduleChain, takeChain } from '../src/chains.js';
import { applyOption, afterOption } from '../src/turn.js';
import { runSimulation } from '../src/sim.js';

// 合成事件：A 的選項排定 B；B 的 when 永不成立，只能靠連鎖觸發。
const EVENTS = [
  { id: 'A', when: {}, options: [{ key: 'x', effects: { chain: 'B' } }] },
  { id: 'B', when: { months: [99] }, options: [{ key: 'y', effects: {} }] },
];

test('chain queue is lazily created and empty by default (old saves are fine)', () => {
  const s = createInitialState('c');
  assert.equal(s.pendingChain, undefined);
  assert.equal(takeChain(s), null);
  scheduleChain(s, 'B');
  assert.deepEqual(s.pendingChain, ['B']);
});

test('takeChain returns scheduled ids in order, one per call', () => {
  const s = createInitialState('c');
  scheduleChain(s, 'B');
  scheduleChain(s, 'C');
  assert.equal(takeChain(s), 'B');
  assert.equal(takeChain(s), 'C');
  assert.equal(takeChain(s), null);
});

test('scheduleChain rejects a missing event id', () => {
  assert.throws(() => scheduleChain(createInitialState('c'), ''), /event id/);
});

test('an option with effects.chain schedules the event through afterOption, not applyOption', () => {
  const s = createInitialState('c');
  const opt = { key: 'x', effects: { chain: 'B' } };
  applyOption(s, opt);
  assert.equal(s.pendingChain, undefined);
  afterOption(s, EVENTS[0], opt);
  assert.deepEqual(s.pendingChain, ['B']);
});

test('applyOption skips chain and shared_event keys instead of throwing as unknown stats', () => {
  const s = createInitialState('c');
  const before = JSON.stringify(s.stats);
  applyOption(s, { effects: { chain: 'B', shared_event: true } });
  assert.equal(JSON.stringify(s.stats), before);
});

// 連鎖為機率觸發（CHAIN_CHANCE），此處取固定序列中第一個會觸發的種子，保持確定性。
function firingRun(prefix) {
  for (let i = 0; i < 200; i++) {
    const r = runSimulation({ seed: prefix + i, months: 3, events: EVENTS });
    if (r.log.some((l) => l.event === 'B')) return r;
  }
  throw new Error('no firing seed found');
}

test('a chained event fires the next month, bypassing its when condition', () => {
  const r = firingRun('chain-fire-');
  const fired = r.log.filter((l) => l.event === 'B');
  assert.equal(fired.length, 1);
  assert.equal(fired[0].month, 2);
  assert.equal(fired[0].year, 1);
  assert.equal(fired[0].chained, true);
  assert.equal(r.log[0].event, 'A');
});

test('without a chain the when-locked event never fires', () => {
  const events = [{ id: 'A', when: {}, options: [{ key: 'x', effects: {} }] }, EVENTS[1]];
  const r = runSimulation({ seed: 'no-chain', months: 3, events });
  assert.equal(r.triggered.B, undefined);
});

test('a chained event is not fired twice when the queue is empty afterwards', () => {
  const r = firingRun('once-');
  assert.equal(r.log.filter((l) => l.event === 'B').length, 1);
});

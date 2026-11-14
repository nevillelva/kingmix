import { eventsRange } from './_events-range.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import { isAvailable, recordEvent } from '../src/events.js';
import { pickEvent, runSimulation } from '../src/sim.js';
import { applyOption, afterOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { autoDecideMemorial } from '../src/autodecide.js';
import { monthlyDrift } from '../src/diplomacy.js';
import {
  listRelations,
  addRelation,
  relationsForGraph,
  stepRelations,
  seedRelations,
  GUILT_LOYALTY,
} from '../src/relations.js';

const base = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const added = eventsRange(527, 546);
const NEW_IDS = added.map((e) => e.id);
const always0 = () => 0; // 擲骰恆得最小值：所有機率判定皆通過
const never = () => { throw new Error('rng must not be consumed'); };

test('addRelation validates kind, self-pairs and unknown officials; rejects duplicate pairs', () => {
  const s = createInitialState('rel-api-1');
  assert.deepEqual(listRelations(s), []);
  assert.equal(addRelation(s, 'o1', 'o4', 'teacher'), true);
  assert.equal(addRelation(s, 'o4', 'o1', 'marriage'), false); // 同一對僅一種關係
  assert.deepEqual(listRelations(s), [{ a: 'o1', b: 'o4', kind: 'teacher' }]);
  assert.throws(() => addRelation(s, 'o1', 'o2', 'friend'), /unknown relation kind/);
  assert.throws(() => addRelation(s, 'o1', 'o1', 'rival'), /two different/);
  assert.throws(() => addRelation(s, 'o1', 'nobody', 'rival'), /unknown official/);
});

test('listRelations returns copies, not live references', () => {
  const s = createInitialState('rel-api-2');
  addRelation(s, 'o1', 'o2', 'rival');
  listRelations(s)[0].kind = 'marriage';
  assert.equal(listRelations(s)[0].kind, 'rival');
});

test('relationsForGraph lists court officials as nodes and drops edges to prefects', () => {
  const s = createInitialState('rel-graph');
  s.officials.push({ id: 'p1', name: '京兆知府', loyalty: 50, ambition: 10, faction: 'xunggui', office: null, prefecture: 'jingzhao', abilities: { intellect: 50, politics: 50, martial: 50, command: 50, virtue: 50 } });
  addRelation(s, 'o1', 'o4', 'teacher');
  addRelation(s, 'o1', 'p1', 'rival');
  const g = relationsForGraph(s);
  assert.deepEqual(g.nodes.map((n) => n.id), ['o1', 'o2', 'o3', 'o4']);
  assert.deepEqual(g.nodes[0], { id: 'o1', name: '丞相', faction: 'qingliu' });
  assert.deepEqual(g.edges, [{ a: 'o1', b: 'o4', kind: 'teacher' }]);
});

test('stepRelations is a no-op without relations and never consumes rng', () => {
  const s = createInitialState('rel-noop');
  const before = JSON.stringify(s);
  assert.equal(stepRelations(s, never), s);
  assert.equal(JSON.stringify(s), before);
});

test('連坐: removing an official lowers the loyalty of his teachers and in-laws, not rivals', () => {
  const s = createInitialState('rel-guilt');
  seedRelations(s); // o1 師 o4；o2 姻 o3；o1 孿 o2
  stepRelations(s, always0); // 建立在場名單
  const o4 = s.officials.find((o) => o.id === 'o4').loyalty;
  const o2 = s.officials.find((o) => o.id === 'o2').loyalty;
  s.officials.splice(s.officials.findIndex((o) => o.id === 'o1'), 1); // o1 遭黜
  stepRelations(s, always0);
  assert.equal(s.officials.find((o) => o.id === 'o4').loyalty, o4 - GUILT_LOYALTY);
  assert.equal(s.flags.guilt_spread, true);
  assert.equal(s.officials.find((o) => o.id === 'o2').loyalty, o2); // 孿敵不連坐
});

test('互參: a rival pair opens an impeachment; a 準其所參 decision removes the target', () => {
  const s = createInitialState('rel-impeach');
  seedRelations(s);
  stepRelations(s, always0); // 通過機率判定，於 o1 與 o2 之間開案
  assert.equal(s.flags.impeach_pending, true);
  const { accuser, target } = s.relState.impeachment;
  assert.ok(['o1', 'o2'].includes(accuser) && ['o1', 'o2'].includes(target) && accuser !== target);
  s.flags.rel_order_purge = true; // 事件選項 setFlag
  stepRelations(s, () => 0.99); // 99 不通過新互參機率
  assert.equal(s.officials.some((o) => o.id === target), false);
  assert.equal(s.flags.impeach_pending, false);
  assert.equal(s.flags.rel_order_purge, undefined); // 裁決旗標已清除
});

test('互參: without a decision the impeachment auto-resolves against the target', () => {
  const s = createInitialState('rel-impeach-auto');
  seedRelations(s);
  stepRelations(s, always0);
  const { target } = s.relState.impeachment;
  const before = s.officials.find((o) => o.id === target).loyalty;
  for (let i = 0; i < 3; i++) stepRelations(s, () => 0.99);
  assert.equal(s.relState.impeachment, null);
  assert.ok(s.officials.find((o) => o.id === target).loyalty < before);
});

test('結黨: a same-faction teacher-student pair forms a bloc flag', () => {
  const s = createInitialState('rel-bloc');
  seedRelations(s); // o1 與 o4 同為清流
  stepRelations(s, () => 0.99);
  assert.equal(s.flags.bloc_qingliu, true);
  assert.equal(s.flags.bloc_xunggui, false);
  assert.equal(s.flags.rel_teacher, true);
  assert.equal(s.flags.rel_rival, true);
});

test('解黨 decision reduces a formed bloc', () => {
  const s = createInitialState('rel-disband');
  seedRelations(s);
  stepRelations(s, () => 0.99);
  const before = s.factions.qingliu;
  s.flags.rel_order_disband = true;
  stepRelations(s, () => 0.99);
  assert.ok(s.factions.qingliu < before);
});

// 模擬主迴圈（同 sim.js，但月結後呼叫 stepRelations，並於開局建立初始關係網）。
// sim.js 尚未接線 stepRelations，故此處以相同順序重現；接線後應改用 runSimulation。
function runWithRelations({ seed, months, events }) {
  const state = createInitialState(seed);
  seedRelations(state);
  const triggered = {};
  for (let i = 0; i < months && state.alive; i++) {
    const { year, month } = state;
    const rng = makeRng([seed, year, month, 'events']);
    const event = pickEvent(state, events, rng);
    if (event) {
      const option = autoDecideMemorial(state, event, seed, year, month)?.option ?? event.options[0];
      applyOption(state, option, makeRng([seed, year, month, 'recruit']));
      afterOption(state, event, option);
      triggered[event.id] = (triggered[event.id] || 0) + 1;
      recordEvent(state, event.id);
    }
    monthlyDrift(state, year, month);
    monthlyTick(state, makeRng([seed, year, month, 'tick']));
    stepRelations(state, makeRng([seed, year, month, 'relations']));
    advanceMonth(state);
  }
  return { triggered, alive: state.alive };
}

const FORTY_YEARS = 480;
// 完整驗證為 200 seeds × 40 年（約 5 分鐘，見回報）；此處取 40 seeds 以維持測試套件速度。
const SEEDS = 40;
const allEvents = [...base, ...added].filter(isAvailable);

test('reachability: at least 15 of the 20 new events fire over 40 seeds x 40 years, none beyond the 8-per-run cap', () => {
  const seen = new Map(NEW_IDS.map((id) => [id, 0]));
  let worst = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { triggered } = runWithRelations({ seed: String(seed), months: FORTY_YEARS, events: allEvents });
    for (const id of NEW_IDS) {
      const n = triggered[id] || 0;
      if (n > 0) seen.set(id, seen.get(id) + 1);
      worst = Math.max(worst, n);
    }
  }
  assert.ok(worst <= 8, `a single event fired ${worst} times in one run (cap 8)`);
  const reached = NEW_IDS.filter((id) => seen.get(id) > 0).length;
  assert.ok(reached >= 15, `only ${reached}/20 new events reached`);
});

test('balance: 死諫 (E420) averages at least 1 per 40-year run with relations active', () => {
  let e420 = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    // 走正式模擬路徑（runSimulation），含死諫保底與出身、關係網，量的是出貨版遊戲的實際次數。
    e420 += runSimulation({ seed: String(seed), months: FORTY_YEARS, events: allEvents }).triggered.E420 || 0;
  }
  assert.ok(e420 / SEEDS >= 1, `E420 averages ${(e420 / SEEDS).toFixed(2)} per run (need >= 1)`);
});

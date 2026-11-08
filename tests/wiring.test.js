import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { afterOption, monthlyTick, applyOption } from '../src/turn.js';
import { isBonded, sharedCount, recordSharedEvent, BOND_THRESHOLD } from '../src/bonds.js';
import { tickEconomy, applyPrefectureYield, YIELD_TREASURY } from '../src/economy.js';
import {
  applyWaijiaCoupling, taihouPenalty, TAIHOU_PENALTY, WAIJIA_FACTION_CAP, WAIJIA_FACTION_COUPLING,
} from '../src/harem.js';
import { runSimulation, resolveScenarioId } from '../src/sim.js';
import { SCENARIO_IDS } from '../src/scenarios.js';
import { readFileSync } from 'node:fs';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

// ---- 君臣相得：shared_event 記在忠誠最低的官員 ----

test('shared_event records the event on the lowest-loyalty official (o3 at start)', () => {
  const s = createInitialState('bond');
  const opt = { key: 'x', effects: { shared_event: true } };
  applyOption(s, opt);
  afterOption(s, { id: 'E-share' }, opt);
  assert.deepEqual(s.bonds.shared.o3, ['E-share']);
  assert.equal(s.bonds.shared.o1, undefined);
});

test('shared_event follows the current lowest loyalty, not a fixed id', () => {
  const s = createInitialState('bond');
  s.officials.find((o) => o.id === 'o1').loyalty = 10;
  afterOption(s, { id: 'E-low' }, { effects: { shared_event: true } });
  assert.deepEqual(s.bonds.shared.o1, ['E-low']);
});

test('shared_event false or absent records nothing', () => {
  const s = createInitialState('bond');
  afterOption(s, { id: 'E' }, { effects: { shared_event: false } });
  afterOption(s, { id: 'E' }, { effects: {} });
  assert.equal(s.bonds, undefined);
});

test('five shared events unlock 君臣相得 for that official', () => {
  const s = createInitialState('bond');
  for (let i = 0; i < BOND_THRESHOLD; i++) afterOption(s, { id: `E${i}` }, { effects: { shared_event: true } });
  assert.equal(sharedCount(s, 'o3'), BOND_THRESHOLD);
  assert.equal(isBonded(s, 'o3'), true);
});

test('recordSharedEvent ignores unknown officials', () => {
  const s = createInitialState('bond');
  assert.equal(recordSharedEvent(s, 'nobody', 'E'), false);
});

// ---- 太后：只在外戚坐大時懲罰 ----

function withHarem(state, { dominant, taihou = 0, family = 'hanmen' }) {
  state.consorts.push({ id: 'c1', family });
  state.harem = {
    demands: [],
    nextDemandId: 1,
    waijia: { [family]: 70 },
    dominant: dominant ? { family, consortId: 'c1' } : null,
    taihou: { power: taihou },
  };
  return state;
}

test('taihouPenalty is zero with no harem or no dominant family', () => {
  assert.equal(taihouPenalty(createInitialState('t')), 0);
  assert.equal(taihouPenalty(withHarem(createInitialState('t'), { dominant: false, taihou: 90 })), 0);
});

test('taihouPenalty applies only when a family is dominant and 太后 opposes', () => {
  assert.equal(taihouPenalty(withHarem(createInitialState('t'), { dominant: true, taihou: 39 })), 0);
  assert.equal(taihouPenalty(withHarem(createInitialState('t'), { dominant: true, taihou: 40 })), TAIHOU_PENALTY);
});

test('monthly tick reduces power by exactly the taihou penalty when dominant and opposing', () => {
  // 兩組狀態相同，只差太后勢力是否達反對門檻（39 不反對、50 反對）
  const opposing = monthlyTick(withHarem(createInitialState('tp'), { dominant: true, taihou: 50 }));
  const neutral = monthlyTick(withHarem(createInitialState('tp'), { dominant: true, taihou: 39 }));
  assert.ok(Math.abs((neutral.stats.power - opposing.stats.power) - Math.abs(TAIHOU_PENALTY)) < 1e-9);
});

// ---- 外戚回寫派系 ----

test('waijia coupling adds a small amount to the dominant family faction, capped', () => {
  const s = withHarem(createInitialState('w'), { dominant: true });
  s.factions.hanmen = 33;
  applyWaijiaCoupling(s);
  assert.equal(s.factions.hanmen, 33 + WAIJIA_FACTION_COUPLING);
  s.factions.hanmen = WAIJIA_FACTION_CAP - 0.01;
  applyWaijiaCoupling(s);
  assert.equal(s.factions.hanmen, WAIJIA_FACTION_CAP);
  applyWaijiaCoupling(s);
  assert.equal(s.factions.hanmen, WAIJIA_FACTION_CAP);
});

test('waijia coupling is a no-op without a dominant family', () => {
  const s = withHarem(createInitialState('w'), { dominant: false });
  const before = { ...s.factions };
  applyWaijiaCoupling(s);
  assert.deepEqual(s.factions, before);
});

// ---- 州府產出 ----

test('prefecture yield is applied to treasury and people, scaled by the governor', () => {
  const s = createInitialState('y');
  tickEconomy(s);
  s.prefectures.forEach((p, i) => { p.yield = 1 + i * 0.25; });
  const sumYield = s.prefectures.reduce((a, p) => a + p.yield, 0);
  const treasury = s.stats.treasury;
  applyPrefectureYield(s);
  assert.ok(Math.abs(s.stats.treasury - (treasury + sumYield * YIELD_TREASURY)) < 0.01);
});

test('a neutral governor (yield 1) adds treasury but no people change', () => {
  const s = createInitialState('y');
  tickEconomy(s);
  s.prefectures.forEach((p) => { p.yield = 1; });
  const people = s.stats.people;
  applyPrefectureYield(s);
  assert.equal(s.stats.people, people);
});

// ---- 劇本入口 ----

test('scenario ids youzhu, zhongxing, shouchengzhi resolve to the scenario definitions', () => {
  assert.equal(resolveScenarioId('youzhu'), 'youth_regency');
  assert.equal(resolveScenarioId('zhongxing'), 'restoration');
  assert.equal(resolveScenarioId('shouchengzhi'), 'steady');
  assert.equal(resolveScenarioId('restoration'), 'restoration');
  assert.throws(() => resolveScenarioId('nope'), /unknown scenario/);
});

test('runSimulation with a scenario reports its status and starts from the scenario', () => {
  const r = runSimulation({ seed: 'sc', months: 12, events, scenario: 'youzhu' });
  assert.equal(r.scenario.id, 'youth_regency');
  assert.equal(r.scenario.status, 'ongoing');
  assert.equal(r.age, 10); // 九歲起始，12 個月後跨年
  assert.ok(SCENARIO_IDS.includes('youth_regency'));
});

test('runSimulation without a scenario keeps the default start and omits the scenario field', () => {
  const a = runSimulation({ seed: 'default', months: 24, events });
  const b = runSimulation({ seed: 'default', months: 24, events, scenario: undefined });
  assert.deepEqual(a, b);
  assert.equal('scenario' in a, false);
  assert.equal(a.age, 20);
});

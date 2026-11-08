import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '../src/state.js';
import { createScenarioState, evaluateScenario, SCENARIOS, SCENARIO_IDS } from '../src/scenarios.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { pickEvent } from '../src/sim.js';
import { makeRng } from '../src/rng.js';

const events = JSON.parse(readFileSync(fileURLToPath(new URL('../data/events.json', import.meta.url)), 'utf8')).events;

test('default new game is unchanged by the scenario module', () => {
  const a = createInitialState('x');
  assert.equal(a.scenario, undefined);
  assert.equal(a.age, 18);
  assert.equal(a.stats.people, 60);
});

test('youth_regency starts as a child with a regent flag', () => {
  const s = createScenarioState('x', 'youth_regency');
  assert.equal(s.age, 9);
  assert.equal(s.stats.power, 20);
  assert.equal(s.flags.regency, true);
  assert.equal(s.scenario.status, 'ongoing');
});

test('restoration starts with a weakened state', () => {
  const s = createScenarioState('x', 'restoration');
  assert.equal(s.stats.people, 25);
  assert.equal(s.stats.treasury, 150);
});

test('youth_regency wins when power is regained at age 18', () => {
  const s = createScenarioState('x', 'youth_regency');
  s.stats.power = 65;
  s.age = 18;
  assert.equal(evaluateScenario(s).status, 'won');
});

test('youth_regency fails when age 18 is reached without power', () => {
  const s = createScenarioState('x', 'youth_regency');
  s.age = 18;
  const r = evaluateScenario(s);
  assert.equal(r.status, 'failed');
  assert.equal(r.endedTurn, 0);
});

test('restoration fails at the 120-month deadline if goals are unmet', () => {
  const s = createScenarioState('x', 'restoration');
  s.turn = 120;
  assert.equal(evaluateScenario(s).status, 'failed');
});

test('restoration wins once people and treasury goals are met in time', () => {
  const s = createScenarioState('x', 'restoration');
  s.stats.people = 60;
  s.stats.treasury = 500;
  s.turn = 50;
  assert.equal(evaluateScenario(s).status, 'won');
});

test('steady fails when people drop below 30 and the failure is sticky', () => {
  const s = createScenarioState('x', 'steady');
  evaluateScenario(s);
  s.stats.people = 25;
  assert.equal(evaluateScenario(s).status, 'failed');
  s.stats.people = 90;
  assert.equal(evaluateScenario(s).status, 'failed');
});

test('steady wins after ten years if people never fell below 30', () => {
  const s = createScenarioState('x', 'steady');
  s.stats.people = 45;
  evaluateScenario(s);
  s.turn = 120;
  assert.equal(evaluateScenario(s).status, 'won');
});

test('death before the goal is a failure', () => {
  const s = createScenarioState('x', 'restoration');
  s.alive = false;
  assert.equal(evaluateScenario(s).status, 'failed');
});

test('evaluateScenario returns null for a non-scenario game', () => {
  assert.equal(evaluateScenario(createInitialState('x')), null);
});

test('unknown scenario id throws', () => {
  assert.throws(() => createScenarioState('x', 'nope'));
});

test('every scenario has a Chinese name, summary, and goal text', () => {
  for (const id of SCENARIO_IDS) {
    assert.equal(SCENARIOS[id].id, id);
    assert.ok(SCENARIOS[id].name && SCENARIOS[id].summary && SCENARIOS[id].goalText);
  }
});

test('headless: each scenario starts and evaluates without crashing for 20 seeds', () => {
  for (const id of SCENARIO_IDS) {
    for (let n = 0; n < 20; n++) {
      const seed = `headless-${n}`;
      const s = createScenarioState(seed, id);
      for (let m = 0; m < 130 && s.alive; m++) {
        const { year, month } = s;
        const pick = pickEvent(s, events, makeRng([seed, year, month, 'events']));
        if (pick) {
          const options = pick.options.filter((o) => !o.phase || o.phase <= 1);
          applyOption(s, options[0], makeRng([seed, year, month, 'recruit']));
        }
        monthlyTick(s, makeRng([seed, year, month, 'tick']));
        advanceMonth(s);
        evaluateScenario(s);
      }
      const r = evaluateScenario(s);
      assert.ok(['won', 'failed', 'ongoing'].includes(r.status), `${id} seed ${seed}`);
      // 120 個月後或死亡後，必須已有定論
      if (s.turn >= 120 || !s.alive) assert.notEqual(r.status, 'ongoing', `${id} seed ${seed} undecided`);
    }
  }
});

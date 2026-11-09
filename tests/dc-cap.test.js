import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { openInvestigation, applyDongchangAction, DC_ACTION_CAP, TYRANNY_GAIN } from '../src/dongchang.js';
import { runSimulation } from '../src/sim.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

// 建立一件已進入把柄階段的案件，編號依序為 DC1, DC2 …
function pendingCase(s, officialId, id) {
  s.dongchang.cases.push({
    id, officialId, startedTurn: 0, status: 'leverage', level: 2, outcome: null,
  });
  return id;
}

test('after the run cap is reached, punish is replaced by warn (no punishment, no tyranny)', () => {
  const s = createInitialState('dc-cap-punish');
  const off = s.officials[0];
  const before = s.officials.length;
  pendingCase(s, off.id, 'DC1');
  s.dongchang.runActions = DC_ACTION_CAP;
  const c = applyDongchangAction(s, 'DC1', 'punish');
  assert.equal(c.outcome, 'warned');
  assert.equal(c.status, 'closed');
  assert.equal(c.cappedFrom, 'punish');
  assert.equal(s.officials.length, before, 'official must not be removed');
  assert.ok(s.officials.includes(off));
  assert.equal(s.tyranny, 0);
  assert.equal(s.dongchang.runActions, DC_ACTION_CAP + 1, 'capped action still counts');
});

test('after the run cap is reached, prison is replaced by warn (no imprisonment, no tyranny)', () => {
  const s = createInitialState('dc-cap-prison');
  pendingCase(s, s.officials[0].id, 'DC1');
  s.dongchang.runActions = DC_ACTION_CAP;
  const c = applyDongchangAction(s, 'DC1', 'prison');
  assert.equal(c.status, 'closed');
  assert.equal(c.outcome, 'warned');
  assert.notEqual(c.status, 'imprisoned');
  assert.equal(s.tyranny, 0);
});

test('warn is still executable after the cap and keeps its effects', () => {
  const s = createInitialState('dc-cap-warn');
  const off = s.officials[0];
  pendingCase(s, off.id, 'DC1');
  s.dongchang.runActions = DC_ACTION_CAP + 3;
  const loyalty = off.loyalty;
  const treasury = s.stats.treasury;
  const c = applyDongchangAction(s, 'DC1', 'warn');
  assert.equal(c.outcome, 'warned');
  assert.equal(c.cappedFrom, undefined, 'a requested warn is not marked as capped');
  assert.equal(off.loyalty, Math.min(100, loyalty + 10));
  assert.equal(s.stats.treasury, treasury + c.level * 10);
  assert.equal(s.dongchang.runActions, DC_ACTION_CAP + 4);
});

test('actions below the cap run as requested', () => {
  const s = createInitialState('dc-cap-below');
  pendingCase(s, s.officials[0].id, 'DC1');
  s.dongchang.runActions = DC_ACTION_CAP - 1;
  const c = applyDongchangAction(s, 'DC1', 'punish');
  assert.equal(c.outcome, 'punished');
  assert.equal(c.cappedFrom, undefined);
  assert.equal(s.tyranny, TYRANNY_GAIN.punish);
  assert.equal(s.dongchang.runActions, DC_ACTION_CAP);
});

test('the 8th action is the last one allowed to be requested as-is', () => {
  const s = createInitialState('dc-cap-edge');
  pendingCase(s, s.officials[0].id, 'DC1');
  pendingCase(s, s.officials[1].id, 'DC2');
  s.dongchang.runActions = DC_ACTION_CAP - 1;
  assert.equal(applyDongchangAction(s, 'DC1', 'prison').outcome, 'imprisoned');
  assert.equal(applyDongchangAction(s, 'DC2', 'prison').outcome, 'warned');
});

test('opening an investigation does not count toward the cap', () => {
  const s = createInitialState('dc-cap-open');
  assert.equal(s.dongchang.runActions, 0);
  openInvestigation(s, 'o1');
  openInvestigation(s, 'o2');
  assert.equal(s.dongchang.runActions, 0);
});

test('a full run never performs more than DC_ACTION_CAP non-warn dongchang actions', () => {
  for (const seed of ['dc-cap-a', 'dc-cap-b', 'dc-cap-c', 'dc-cap-d', 'dc-cap-e']) {
    const r = runSimulation({ seed, months: 600, events });
    const hard = r.log.filter((l) => l.event === 'DC' && l.option !== 'warn').length;
    assert.ok(hard <= DC_ACTION_CAP, `${seed}: ${hard} non-warn DC actions`);
    const dc = r.log.filter((l) => l.event === 'DC').length;
    assert.equal(r.triggered.DC || 0, dc, `${seed}: triggered.DC matches log`);
  }
});

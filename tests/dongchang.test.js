import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { openInvestigation, tickDongchang, applyDongchangAction } from '../src/dongchang.js';
import { applyOption, monthlyTick, advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';

// 讓 rng 永遠回傳固定值，便於測試確定結果
const fixed = (v) => () => v;

function caseReadyForDecision(seed = 't') {
  const s = createInitialState(seed);
  openInvestigation(s, 'o3');
  advanceMonth(s); // 隔月才會結算
  tickDongchang(s, fixed(0)); // 0 < 成功機率 → 取得把柄
  return s;
}

test('an investigation opened this turn is not resolved until the next turn', () => {
  const s = createInitialState('t');
  openInvestigation(s, 'o3');
  tickDongchang(s, fixed(0));
  assert.equal(s.dongchang.cases[0].status, 'investigating');
});

test('a successful investigation yields leverage with a level from 1 to 3', () => {
  const s = caseReadyForDecision();
  const c = s.dongchang.cases[0];
  assert.equal(c.status, 'leverage');
  assert.ok(c.level >= 1 && c.level <= 3);
});

test('a failed investigation closes with no evidence', () => {
  const s = createInitialState('t');
  openInvestigation(s, 'o3');
  advanceMonth(s);
  tickDongchang(s, fixed(0.999)); // 大於成功機率
  assert.equal(s.dongchang.cases[0].status, 'closed');
  assert.equal(s.dongchang.cases[0].outcome, 'no_evidence');
});

test('warn lowers ambition, raises loyalty and pays out', () => {
  const s = caseReadyForDecision();
  const before = { t: s.stats.treasury, o: s.officials.find((x) => x.id === 'o3') };
  const ambition = before.o.ambition;
  applyDongchangAction(s, 'DC1', 'warn');
  assert.equal(s.officials.find((x) => x.id === 'o3').ambition, Math.max(0, ambition - 10));
  assert.ok(s.stats.treasury > before.t);
  assert.equal(s.dongchang.cases[0].outcome, 'warned');
});

test('punish removes the official, raises prestige and pays out', () => {
  const s = caseReadyForDecision();
  const prestige = s.stats.prestige;
  applyDongchangAction(s, 'DC1', 'punish');
  assert.ok(!s.officials.some((o) => o.id === 'o3'));
  assert.equal(s.stats.prestige, prestige + 5);
  assert.equal(s.dongchang.cases[0].outcome, 'punished');
});

test('prison drops loyalty and waits for a confession next turn', () => {
  const s = caseReadyForDecision();
  applyDongchangAction(s, 'DC1', 'prison');
  assert.equal(s.dongchang.cases[0].status, 'imprisoned');
  // 同回合不結算
  tickDongchang(s, fixed(0));
  assert.equal(s.dongchang.cases[0].status, 'imprisoned');
  advanceMonth(s);
  tickDongchang(s, fixed(0)); // 0 < 0.5 → 供出
  assert.equal(s.dongchang.cases[0].status, 'leverage');
  assert.equal(s.dongchang.cases[0].level, 2);
});

test('acting on a case that is not pending throws', () => {
  const s = createInitialState('t');
  openInvestigation(s, 'o3');
  assert.throws(() => applyDongchangAction(s, 'DC1', 'warn'));
});

test('E004 option B opens an investigation on the lowest-loyalty official', () => {
  const s = createInitialState('t');
  applyOption(s, { effects: { investigate_lowest: true } });
  assert.equal(s.dongchang.cases.length, 1);
  assert.equal(s.dongchang.cases[0].officialId, 'o3');
});

test('removing an official closes their open cases', () => {
  const s = caseReadyForDecision();
  applyOption(s, { effects: { removeOfficial: true } }); // 移除最低忠誠者 o3
  assert.equal(s.dongchang.cases[0].status, 'closed');
  assert.equal(s.dongchang.cases[0].outcome, 'removed');
});

test('faction influence shifts official loyalty each month', () => {
  const s = createInitialState('t');
  s.factions.hanmen = 80;
  const before = s.officials.find((o) => o.id === 'o3').loyalty;
  monthlyTick(s, makeRng(['f']));
  assert.ok(s.officials.find((o) => o.id === 'o3').loyalty > before);
});

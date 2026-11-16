import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { makeRng } from '../src/rng.js';
import {
  canalRate, canalPatrolMult, dispatchCanalPatrol, autoCanalPatrol, patrolled, canalOn,
  CANAL_DISLOYAL, CANAL_LOSS_CAP, CANAL_PATROL_MONTHS, CANAL_PATROL_PER_MONTH, CANAL_PATROL_BONUS, CANAL_PATROL_COST,
} from '../src/canal.js';
import { governorOf } from '../src/economy.js';

const rngNever = () => 1; // 劫掠擲骰一律失敗
const rngAlways = () => 0; // 劫掠擲骰一律成功

function setup(seed, loyalty) {
  const s = createInitialState(seed);
  const pref = s.prefectures[0];
  const gov = governorOf(s, pref);
  if (gov) gov.loyalty = loyalty;
  pref.morale = 90;
  pref.rebel = false;
  return { s, pref, gov };
}

test('忠誠府無貪腐損耗；忠誠低於門檻才計損耗，且有上限', () => {
  const { s, pref, gov } = setup('canal-1', 80);
  assert.equal(canalRate(s, pref, gov, rngNever).rate, 0);
  gov.loyalty = 0;
  const r = canalRate(s, pref, gov, rngNever);
  assert.ok(r.rate > 0 && r.rate <= CANAL_LOSS_CAP);
  assert.deepEqual(r.causes, ['corruption']);
  gov.loyalty = CANAL_DISLOYAL - 1;
  assert.ok(canalRate(s, pref, gov, rngNever).rate > 0);
});

test('劫掠：叛亂或民心低時擲骰，成功則計損耗', () => {
  const { s, pref, gov } = setup('canal-2', 90);
  pref.rebel = true;
  assert.equal(canalRate(s, pref, gov, rngNever).rate, 0, '擲骰失敗無損耗');
  const hit = canalRate(s, pref, gov, rngAlways);
  assert.deepEqual(hit.causes, ['raid']);
  pref.rebel = false;
  pref.morale = 10;
  assert.deepEqual(canalRate(s, pref, gov, rngAlways).causes, ['raid'], '民心低落亦為劫掠風險');
});

test('巡漕中的府不計損耗，並享增收係數；到期後恢復', () => {
  const { s, pref, gov } = setup('canal-3', 0);
  dispatchCanalPatrol(s, pref.id);
  assert.equal(patrolled(pref, s.turn), true);
  assert.equal(canalRate(s, pref, gov, rngAlways).rate, 0);
  assert.equal(canalPatrolMult(s, pref), 1 + CANAL_PATROL_BONUS);
  s.turn += CANAL_PATROL_MONTHS - 1;
  assert.equal(patrolled(pref, s.turn), true, '第 CANAL_PATROL_MONTHS 個月仍在巡漕');
  s.turn += 1;
  assert.equal(patrolled(pref, s.turn), false);
  assert.ok(canalRate(s, pref, gov, rngNever).rate > 0);
  assert.equal(canalPatrolMult(s, pref), 1);
});

test('派遣：每月上限、扣除國庫、國庫不足則拒絕', () => {
  const s = createInitialState('canal-4');
  const [a, b] = s.prefectures;
  const t0 = s.stats.treasury;
  assert.equal(dispatchCanalPatrol(s, a.id).ok, true);
  assert.equal(s.stats.treasury, t0 - CANAL_PATROL_COST);
  for (let i = 1; i < CANAL_PATROL_PER_MONTH; i++) assert.equal(dispatchCanalPatrol(s, b.id).ok, false);
  assert.equal(dispatchCanalPatrol(s, b.id).reason, 'limit');
  s.month = s.month === 12 ? 1 : s.month + 1;
  assert.equal(dispatchCanalPatrol(s, b.id).ok, true, '跨月重置上限');
  s.month = s.month === 12 ? 1 : s.month + 1;
  s.stats.treasury = CANAL_PATROL_COST - 1;
  assert.equal(dispatchCanalPatrol(s, s.prefectures[2].id).reason, 'treasury');
  assert.equal(dispatchCanalPatrol(s, 'no-such').reason, 'unknown');
});

test('模擬策略：patrol 派往知府忠誠最低之府；none 不派遣；未開啟時 dispatch 回 disabled', () => {
  const s = createInitialState('canal-5');
  s.canal = { enabled: true };
  const target = s.prefectures[1];
  const gov = governorOf(s, target);
  if (gov) gov.loyalty = 1;
  for (const p of s.prefectures) if (p !== target && governorOf(s, p)) governorOf(s, p).loyalty = 90;
  assert.equal(autoCanalPatrol(s, 'none', governorOf), null);
  assert.equal(patrolled(target, s.turn), false);
  autoCanalPatrol(s, 'patrol', governorOf);
  assert.equal(patrolled(target, s.turn), true);
  s.canal = { enabled: false };
  assert.equal(canalOn(s), false);
  assert.equal(dispatchCanalPatrol(s, s.prefectures[0].id).reason, 'disabled');
});

test('同種子重現：劫掠擲骰與結果一致', () => {
  const a = makeRng([9, 1, 1, 'canal', 'x'])();
  const b = makeRng([9, 1, 1, 'canal', 'x'])();
  assert.equal(a, b);
});

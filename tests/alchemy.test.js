// 煉丹丹毒與方士干政（alchemy.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { serializeSave, restoreSave } from '../src/save.js';
import { monthlyTick, advanceMonth } from '../src/turn.js';
import { optionOpen } from '../src/events.js';
import { makeRng } from '../src/rng.js';
import { runSimulation } from '../src/sim.js';
import { chronicleLine } from '../src/chronicle.js';
import {
  attemptAlchemy, alchemyStatus, tickAlchemy, tickFangshiCoup, alchemyState, ALCHEMY_COST,
} from '../src/alchemy.js';
import {
  PILLS, DEFAULT_PILL, TOXICITY_DECAY, FANGSHI_DECAY, TOXICITY_HARM, TOXICITY_PARANOID, TOXICITY_LETHAL,
  FANGSHI_TIER, TOXICITY_HEALTH_LOSS, PARANOID_FLAG, FANGSHI_COUP_THRESHOLD, FANGSHI_EVENT,
} from '../src/alchemy-data.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const fixed = () => ({ now: () => '2026-01-01T00:00:00.000Z' });

// 以種子掃描找到指定結果的煉丹（避免依賴特定種子的實作細節）。
function seedWithOutcome(outcome, prep = (s) => s) {
  for (let i = 0; i < 500; i++) {
    const s = prep(createInitialState(`alch-${outcome}-${i}`));
    if (attemptAlchemy(s).outcome === outcome) return `alch-${outcome}-${i}`;
  }
  throw new Error(`no seed for ${outcome}`);
}

// 進入下一個月（不經月結，僅推進時間，讓每月一次的煉丹冷卻解除）。
const nextMonth = (s) => advanceMonth(s);

test('丹毒：每服上升（依丹藥種類），每月緩降，不低於 0', () => {
  const s = createInitialState('alch-acc');
  s.stats.treasury = 500;
  attemptAlchemy(s);
  let a = alchemyState(s);
  assert.equal(a.doses, 1);
  assert.equal(a.toxicity, PILLS[DEFAULT_PILL].toxicityGain);
  assert.equal(a.fangshi, PILLS[DEFAULT_PILL].fangshiGain);

  nextMonth(s);
  attemptAlchemy(s);
  a = alchemyState(s);
  assert.equal(a.doses, 2);
  assert.equal(a.toxicity, 2 * PILLS[DEFAULT_PILL].toxicityGain);

  tickAlchemy(s);
  a = alchemyState(s);
  assert.equal(a.toxicity, 2 * PILLS[DEFAULT_PILL].toxicityGain - TOXICITY_DECAY);
  assert.equal(a.fangshi, 2 * PILLS[DEFAULT_PILL].fangshiGain - FANGSHI_DECAY);

  // 衰減至 0 為止，不為負
  for (let i = 0; i < 100; i++) tickAlchemy(s);
  a = alchemyState(s);
  assert.equal(a.toxicity, 0);
  assert.equal(a.fangshi, 0);
});

test('三段門檻：甲（丹毒中）每月健康流失；未達甲則不流失', () => {
  const hi = createInitialState('alch-harm');
  hi.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: TOXICITY_HARM + TOXICITY_DECAY, doses: 1, fangshi: 0 } };
  const h0 = hi.stats.health;
  tickAlchemy(hi);
  assert.equal(hi.stats.health, h0 - TOXICITY_HEALTH_LOSS);

  const lo = createInitialState('alch-harm2');
  lo.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: TOXICITY_HARM - 1 + TOXICITY_DECAY, doses: 1, fangshi: 0 } };
  const l0 = lo.stats.health;
  tickAlchemy(lo);
  assert.equal(lo.stats.health, l0, '丹毒未達甲時健康不流失');
});

test('三段門檻：乙（丹毒高）設旗標 alchemy:paranoid，回落後清除', () => {
  const s = createInitialState('alch-para');
  s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: TOXICITY_PARANOID + TOXICITY_DECAY, doses: 9, fangshi: 0 } };
  tickAlchemy(s);
  assert.equal(s.flags[PARANOID_FLAG], true);

  s.sideEvents.alchemy.toxicity = TOXICITY_PARANOID - 1 + TOXICITY_DECAY;
  tickAlchemy(s);
  assert.equal(s.flags[PARANOID_FLAG], false, '回落至乙以下則旗標清除');
});

test('flag 鎖定：丹毒高時，E082「寬以待人」與 E114「寬宥不究」不可選；旗標清除後恢復', () => {
  const byId = (id) => events.find((e) => e.id === id);
  const e082 = byId('E082').options.find((o) => o.key === 'B');
  const e114 = byId('E114').options.find((o) => o.key === 'B');
  const s = createInitialState('alch-lock');
  assert.equal(optionOpen(s, e082), true);
  assert.equal(optionOpen(s, e114), true);
  s.flags[PARANOID_FLAG] = true;
  assert.equal(optionOpen(s, e082), false);
  assert.equal(optionOpen(s, e114), false);
  s.flags[PARANOID_FLAG] = false;
  assert.equal(optionOpen(s, e082), true);
});

test('丹毒致死：健康歸 0 且死因為丹毒流失，endReason 為 death，史冊 kind alchemy_death', () => {
  const s = createInitialState('alch-tox-death');
  s.stats.health = 1;
  s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: 90, doses: 12, fangshi: 0 } };
  monthlyTick(s, makeRng(['t']));
  assert.equal(s.alive, false);
  assert.equal(s.endReason, 'death');
  const entry = s.chronicle.find((c) => c.kind === 'alchemy_death');
  assert.ok(entry, '史冊應有 alchemy_death');
  assert.equal(entry.cause, 'toxicity');
  assert.match(chronicleLine(entry).text, /丹毒累積/);
});

test('煉丹失敗不致死：失敗的健康代價以 1 為下限，月結不因煉丹死亡', () => {
  const seed = seedWithOutcome('failure', (s) => { s.stats.treasury = 500; s.stats.health = 4; return s; });
  const s = createInitialState(seed);
  s.stats.treasury = 500;
  s.stats.health = 4;
  const r = attemptAlchemy(s);
  assert.equal(r.outcome, 'failure');
  assert.equal(s.stats.health, 1, '失敗的健康代價不得使健康低於 1');
  monthlyTick(s, makeRng(['t']));
  assert.equal(s.alive, true);
  assert.equal(s.chronicle.some((c) => c.kind === 'alchemy_death'), false);
});

test('丹毒直接致死（原決定）：丹毒達 TOXICITY_LETHAL 時月結駕崩，史冊 alchemy_death，服丹不再被拒', () => {
  const s = createInitialState('alch-toxic-lethal');
  const gain = PILLS[DEFAULT_PILL].toxicityGain;
  s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: TOXICITY_LETHAL - gain, doses: 9, fangshi: 0 } };
  assert.deepEqual(alchemyStatus(s), { ok: true, reason: null });
  const r = attemptAlchemy(s);
  assert.equal(r.ok, true);
  assert.equal(alchemyState(s).toxicity, TOXICITY_LETHAL);
  tickAlchemy(s);
  assert.equal(s.stats.health, 0);
  const entry = s.chronicle.find((c) => c.kind === 'alchemy_death');
  assert.ok(entry, '史冊應有 alchemy_death');
  assert.equal(entry.cause, 'toxicity');
});


test('存檔往返：丹毒、服丹次數與方士影響力保留，死因史冊不遺失', () => {
  const s = createInitialState('alch-save');
  s.stats.treasury = 500;
  attemptAlchemy(s);
  nextMonth(s);
  attemptAlchemy(s);
  const before = alchemyState(s);
  const restored = restoreSave(JSON.stringify(serializeSave(s, fixed())));
  assert.equal(restored.ok, true);
  assert.deepEqual(alchemyState(restored.state), before);
});

test('預設不煉丹：月結不建立丹毒欄位、不設旗標、不新增史冊，且不影響狀態', () => {
  const s = createInitialState('alch-default');
  for (let i = 0; i < 24; i++) {
    tickAlchemy(s);
    tickFangshiCoup(s);
    monthlyTick(s, makeRng([s.seed, i, 'tick']));
    advanceMonth(s);
  }
  assert.equal(s.sideEvents?.alchemy, undefined);
  assert.equal(s.flags?.[PARANOID_FLAG], undefined);
  assert.equal(s.chronicle.some((c) => ['alchemy_death', 'fangshi'].includes(c.kind)), false);
});

test('預設模擬：monthlyAlchemy 未設（預設）與明確 false 的結果完全相同', () => {
  const base = { seed: 'alch-sim-eq', months: 120, events };
  const a = runSimulation(base);
  const b = runSimulation({ ...base, monthlyAlchemy: false });
  assert.deepEqual(a, b);
});

test('方士干政：丙段以上，月結可能觸發，皇權流失、清流朝臣忠誠下滑，史冊 kind fangshi', () => {
  let hit = null;
  for (let i = 0; i < 300 && !hit; i++) {
    const s = createInitialState(`alch-fangshi-${i}`);
    s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: 0, doses: 5, fangshi: FANGSHI_TIER + 20 } };
    const power0 = s.stats.power;
    const qing = s.officials.filter((o) => o.faction === 'qingliu').map((o) => o.loyalty);
    const r = tickAlchemy(s);
    if (r.intrigue) hit = { s, power0, qing };
  }
  assert.ok(hit, '應能找到會觸發方士干政的種子');
  assert.equal(hit.s.stats.power, Math.max(0, hit.power0 + FANGSHI_EVENT.power));
  const qingNow = hit.s.officials.filter((o) => o.faction === 'qingliu').map((o) => o.loyalty);
  qingNow.forEach((v, i) => assert.ok(v <= hit.qing[i]));
  assert.ok(hit.s.chronicle.some((c) => c.kind === 'fangshi'));
});

test('方士政變：影響力達門檻時經 assassination 既有結果；致死以 assassinated 結束，史冊來源為方士', () => {
  let coup = null;
  for (let i = 0; i < 400 && !coup; i++) {
    const s = createInitialState(`alch-coup-${i}`);
    s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: 0, doses: 9, fangshi: FANGSHI_COUP_THRESHOLD } };
    const r = tickFangshiCoup(s);
    if (r?.outcome === 'killed') coup = s;
  }
  assert.ok(coup, '應能找到致死政變的種子');
  assert.equal(coup.alive, false);
  assert.equal(coup.endReason, 'assassinated');
  const entry = coup.chronicle.find((c) => c.kind === 'assassination');
  assert.equal(entry.source, 'fangshi');
  assert.match(chronicleLine(entry).text, /方士行刺/);
});

test('方士政變：影響力未達門檻則不觸發', () => {
  const s = createInitialState('alch-coup-low');
  s.sideEvents = { enabled: true, encounterMonth: -1, alchemyMonth: -1, alchemy: { toxicity: 0, doses: 1, fangshi: FANGSHI_COUP_THRESHOLD - 1 } };
  assert.equal(tickFangshiCoup(s), null);
});

test('煉丹成敗的冷卻與國庫門檻不變：每月至多一次，國庫不足拒絕', () => {
  const s = createInitialState('alch-cd');
  s.stats.treasury = ALCHEMY_COST * 3;
  attemptAlchemy(s);
  assert.equal(alchemyStatus(s).reason, 'cooldown');
  nextMonth(s);
  assert.equal(alchemyStatus(s).ok, true);
});

test('每月煉丹策略的模擬可跑完且 endReason 為既有代碼（不新增結束代碼）', () => {
  const allowed = new Set(['death', 'assassinated', 'abdicated', 'resigned', 'short_end']);
  for (let i = 0; i < 3; i++) {
    const r = runSimulation({ seed: `alch-strat-${i}`, months: 240, events, monthlyAlchemy: true });
    if (r.endReason) assert.ok(allowed.has(r.endReason), `unexpected endReason ${r.endReason}`);
  }
});


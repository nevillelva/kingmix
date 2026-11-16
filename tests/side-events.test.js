// 側線玩法（提案 7）：微服私訪奇遇與煉丹（side-events.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { serializeSave, parseSave } from '../src/save.js';
import { tourTo, PREFECTURES, MORALE_MAX } from '../src/tour.js';
import { ensureCity } from '../src/city.js';
import {
  ENCOUNTERS, ALCHEMY_COST, ALCHEMY_REWARD, ALCHEMY_BACKFIRE,
  tourWithEncounter, rollEncounter, attemptAlchemy,
  sideEventsEnabled, setSideEventsEnabled,
} from '../src/side-events.js';

const fixed = () => ({ now: () => '2026-01-01T00:00:00.000Z' });

// 找一個會觸發奇遇的巡幸（以種子掃描，避免依賴特定種子的實作細節）。
function findEncounterSeed() {
  for (let i = 0; i < 200; i++) {
    const s = createInitialState(`side-enc-${i}`);
    const r = tourWithEncounter(s, 'hedong');
    if (r.encounter) return `side-enc-${i}`;
  }
  throw new Error('no encounter seed found');
}

test('tourWithEncounter 在側線啟用時，於巡幸抵達後最多擲一次奇遇，且奇遇來自奇遇表', () => {
  const seed = findEncounterSeed();
  const s = createInitialState(seed);
  const r = tourWithEncounter(s, 'hedong');
  assert.equal(r.ok, true);
  assert.ok(ENCOUNTERS.some((e) => e.id === r.encounter.id));
  assert.equal(s.location, 'hedong');
});

test('奇遇同種子同結果（確定性）', () => {
  const seed = findEncounterSeed();
  const a = createInitialState(seed);
  const b = createInitialState(seed);
  const ra = tourWithEncounter(a, 'yizhou');
  const rb = tourWithEncounter(b, 'yizhou');
  assert.deepEqual(ra.encounter, rb.encounter);
  assert.deepEqual(a.stats, b.stats);
  assert.deepEqual(ensureCity(a), ensureCity(b));
});

test('側線停用時，tourWithEncounter 與 tourTo 結果與狀態完全相同', () => {
  const seed = findEncounterSeed();
  const plain = createInitialState(seed);
  const off = createInitialState(seed);
  setSideEventsEnabled(off, false);
  const rp = tourTo(plain, 'hedong');
  const ro = tourWithEncounter(off, 'hedong');
  assert.equal(ro.encounter, null);
  assert.equal(ro.ok, rp.ok);
  assert.deepEqual(off.stats, plain.stats);
  assert.deepEqual(ensureCity(off), ensureCity(plain));
  assert.equal(off.location, plain.location);
  assert.equal(sideEventsEnabled(off), false);
});

test('失敗的巡幸不擲奇遇，且狀態不變', () => {
  const s = createInitialState('side-fail');
  const r = tourWithEncounter(s, 'jingzhao'); // 已在京兆府
  assert.equal(r.ok, false);
  assert.equal(r.encounter, null);
  assert.equal(s.sideEvents, undefined);
});

test('同一個月只擲一次奇遇，即使未命中亦不重擲', () => {
  const s = createInitialState('side-once');
  rollEncounter(s);
  const first = s.sideEvents.encounterMonth;
  assert.equal(first, 0);
  assert.equal(rollEncounter(s), null);
  assert.equal(s.sideEvents.encounterMonth, first);
});

test('奇遇效果為小幅：屬性變動不超過 4，府民心仍在 [0, MORALE_MAX] 之內', () => {
  for (const e of ENCOUNTERS) {
    for (const [k, v] of Object.entries(e.effects)) {
      if (k === 'morale') assert.ok(Math.abs(v) <= 5, `${e.id} morale`);
      else assert.ok(Math.abs(v) <= 8, `${e.id} ${k}`);
    }
  }
  // 民心在上限與下限附近反覆擲奇遇，仍不越界
  for (const start of [MORALE_MAX, 0]) {
    const s = createInitialState(`side-morale-${start}`);
    tourTo(s, 'denglai');
    const pref = ensureCity(s).find((p) => p.id === 'denglai');
    pref.morale = start;
    for (let month = 1; month <= 12; month++) {
      s.month = month;
      rollEncounter(s);
      assert.ok(pref.morale >= 0 && pref.morale <= MORALE_MAX, `morale ${pref.morale}`);
    }
  }
});

test('煉丹：扣除國庫、每月至多一次，次月可再煉', () => {
  const s = createInitialState('alch-cd');
  const t0 = s.stats.treasury;
  const r1 = attemptAlchemy(s);
  assert.equal(r1.ok, true);
  assert.equal(s.stats.treasury, t0 - ALCHEMY_COST);
  const r2 = attemptAlchemy(s);
  assert.deepEqual([r2.ok, r2.reason], [false, 'cooldown']);
  assert.equal(s.stats.treasury, t0 - ALCHEMY_COST);
  s.month += 1;
  assert.equal(attemptAlchemy(s).ok, true);
});

test('煉丹：國庫不足時拒絕且狀態不變', () => {
  const s = createInitialState('alch-poor');
  s.stats.treasury = ALCHEMY_COST - 1;
  const r = attemptAlchemy(s);
  assert.deepEqual([r.ok, r.reason], [false, 'treasury']);
  assert.equal(s.stats.treasury, ALCHEMY_COST - 1);
  assert.equal(s.sideEvents.alchemyMonth, -1); // 未成功煉丹，當月額度不被消耗
});

test('煉丹：同種子同月份同結果；成敗皆可能出現', () => {
  const outcomes = new Set();
  for (let i = 0; i < 40; i++) {
    const a = createInitialState(`alch-${i}`);
    const b = createInitialState(`alch-${i}`);
    const ra = attemptAlchemy(a);
    const rb = attemptAlchemy(b);
    assert.equal(ra.outcome, rb.outcome);
    assert.deepEqual(a.stats, b.stats);
    outcomes.add(ra.outcome);
  }
  assert.ok(outcomes.has('success') && outcomes.has('failure'));
});

test('煉丹成功得獎勵、失敗得代價（健康變動符合表定值）', () => {
  let sawSuccess = false;
  let sawFailure = false;
  for (let i = 0; i < 40 && !(sawSuccess && sawFailure); i++) {
    const s = createInitialState(`alch-eff-${i}`);
    s.stats.health = 50;
    s.stats.charm = 100;
    const r = attemptAlchemy(s);
    if (r.outcome === 'success') {
      sawSuccess = true;
      assert.equal(r.effects, ALCHEMY_REWARD);
      assert.equal(s.stats.health, 50 + ALCHEMY_REWARD.health);
      assert.equal(s.stats.charm, 100 + ALCHEMY_REWARD.charm);
    } else {
      sawFailure = true;
      assert.equal(r.effects, ALCHEMY_BACKFIRE);
      assert.equal(s.stats.health, 50 + ALCHEMY_BACKFIRE.health);
      assert.equal(s.stats.charm, 100);
    }
  }
  assert.ok(sawSuccess && sawFailure);
});

test('煉丹停用時回傳 disabled，不扣國庫', () => {
  const s = createInitialState('alch-off');
  setSideEventsEnabled(s, false);
  const t0 = s.stats.treasury;
  const r = attemptAlchemy(s);
  assert.deepEqual([r.ok, r.reason], [false, 'disabled']);
  assert.equal(s.stats.treasury, t0);
});

test('側線狀態經存檔往返保留，舊存檔無欄位時預設為啟用', () => {
  const s = createInitialState('side-save');
  attemptAlchemy(s);
  setSideEventsEnabled(s, false);
  const restored = parseSave(JSON.stringify(serializeSave(s, fixed())));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.sideEvents.enabled, false);
  assert.equal(restored.state.sideEvents.alchemyMonth, 0);

  const legacy = createInitialState('side-legacy');
  delete legacy.sideEvents;
  assert.equal(sideEventsEnabled(legacy), true);
});

test('PREFECTURES 仍為六府（側線不改變地圖結構）', () => {
  assert.equal(PREFECTURES.length, 6);
});

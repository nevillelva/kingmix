// 祖訓（玩法深度擴充）：定義與修正值範圍、開局選擇上限與解鎖驗證、未勾選時與原版相同、同種子重現、存檔往返、各使用點生效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDICT_DEFS, EDICT_IDS, EDICT_MAX, validateEdictChoice, edictMods, applyEdictsUnchecked, applyEdicts } from '../src/edicts.js';
import { ruleMod } from '../src/rule-mods.js';
import { UNLOCK_RULES, emptyUnlockRecord, isUnlocked } from '../src/unlocks.js';
import { createInitialState } from '../src/state.js';
import { ensureEconomy, applyPrefectureYield, YIELD_TREASURY } from '../src/economy.js';
import { facilityCost, FACILITIES, FACILITY_IDS } from '../src/facilities.js';
import { runSimulation } from '../src/sim.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const withTitles = (...titles) => ({ version: 1, titles });

test('祖訓共 7 條，皆有解鎖條件，且修正值保守（mul 在 ±20% 內，add 絕對值 ≤ 2）', () => {
  assert.equal(EDICT_DEFS.length, 7);
  assert.ok(EDICT_DEFS.length >= 6 && EDICT_DEFS.length <= 8);
  for (const d of EDICT_DEFS) {
    assert.ok(d.name && d.desc, `${d.id} 需有名稱與說明`);
    assert.ok(UNLOCK_RULES.edict[d.id], `${d.id} 需有解鎖條件`);
    assert.ok(Object.keys(d.mods).length >= 1 && Object.keys(d.mods).length <= 2, `${d.id} 使用點應為 1–2 個`);
    for (const m of Object.values(d.mods)) {
      if ('mul' in m) assert.ok(Math.abs(m.mul - 1) <= 0.2 + 1e-9, `${d.id} mul 超出 ±20%`);
      if ('add' in m) assert.ok(Math.abs(m.add) <= 2, `${d.id} add 過大`);
    }
  }
});

test('未勾選祖訓時，所有祖訓使用的 key 皆回傳 base', () => {
  const st = createInitialState('edict-none', {});
  assert.deepEqual(st.edicts ?? {}, {});
  for (const d of EDICT_DEFS) for (const key of Object.keys(d.mods)) {
    assert.equal(ruleMod(st, key, 7), 7, key);
    assert.equal(ruleMod(st, key, 0), 0, key);
  }
});

test('每條祖訓的修正值正確套用到 ruleMod', () => {
  for (const d of EDICT_DEFS) {
    const st = { edicts: edictMods([d.id]) };
    for (const [key, m] of Object.entries(d.mods)) {
      const expected = (10 + (m.add ?? 0)) * (m.mul ?? 1);
      assert.ok(Math.abs(ruleMod(st, key, 10) - expected) < 1e-9, `${d.id}.${key}`);
    }
  }
});

test('開局選擇：超過 2 條、重複、未知、未解鎖皆拒絕；已解鎖且合規者通過', () => {
  const all = withTitles('博士', '鴻儒', '知兵', '文宗', '名將', '戰神');
  assert.equal(EDICT_MAX, 2);
  assert.equal(validateEdictChoice(['zhongnong', 'chongwen', 'changwei'], all).error, 'too_many');
  assert.equal(validateEdictChoice(['zhongnong', 'zhongnong'], all).error, 'duplicate');
  assert.equal(validateEdictChoice(['nope'], all).error, 'unknown');
  assert.equal(validateEdictChoice(['zhongnong'], emptyUnlockRecord()).error, 'locked');
  assert.equal(validateEdictChoice(['zhongnong'], all).ok, true);
  assert.equal(validateEdictChoice([], emptyUnlockRecord()).ok, true);
  assert.equal(validateEdictChoice(['zhongnong', 'chongwen'], withTitles('博士')).error, 'locked');
});

test('祖訓解鎖以跨局紀錄判定（kind = edict）', () => {
  assert.equal(isUnlocked(emptyUnlockRecord(), 'edict', 'zhongnong'), false);
  assert.equal(isUnlocked(withTitles('博士'), 'edict', 'zhongnong'), true);
});

test('applyEdicts 寫入合併後的修正；同一 key 多條併入時 add 相加、mul 相乘', () => {
  const st = createInitialState('edict-merge', {});
  applyEdicts(st, ['zhongnong', 'kuanren'], withTitles('博士', '文宗'));
  assert.deepEqual(Object.keys(st.edicts).sort(), ['people_gain', 'treasury_gain', 'yield_agriculture', 'yield_commerce']);
  assert.throws(() => applyEdicts(st, ['zhongnong'], emptyUnlockRecord()));
  assert.throws(() => applyEdictsUnchecked(st, ['zhongnong', 'chongwen', 'changwei']));
  const merged = edictMods(['changwei', 'changwei']);
  assert.deepEqual(merged.dc_action_cap, { add: 4, mul: 1 });
});

test('同種子同祖訓重現：模擬摘要逐項相同；未勾選時與原版（無 edicts 參數）相同', () => {
  const opts = { seed: 'edict-repro', months: 120, events };
  const a = runSimulation({ ...opts, edicts: ['chongwen', 'jieyong'] });
  const b = runSimulation({ ...opts, edicts: ['chongwen', 'jieyong'] });
  assert.deepEqual(a.triggered, b.triggered);
  assert.equal(a.endReason, b.endReason);
  assert.deepEqual(runSimulation({ ...opts, edicts: [] }), runSimulation(opts));
});

test('存檔往返：state.edicts 經 JSON 來回後仍生效', () => {
  const st = createInitialState('edict-save', {});
  applyEdictsUnchecked(st, ['changwei']);
  const back = JSON.parse(JSON.stringify(st));
  assert.deepEqual(back.edicts, st.edicts);
  assert.equal(ruleMod(back, 'dc_action_cap', 8), 10);
});

test('使用點：重農抑商只改變農業州府的產出（商業州府另行減少）', () => {
  const run = (ids) => {
    const st = createInitialState('edict-yield', {});
    ensureEconomy(st);
    for (const p of st.prefectures) { p.yield = 0; p.rebel = false; p.autonomous = false; }
    const ag = st.prefectures.find((p) => p.output === 'agriculture');
    ag.yield = 20;
    st.stats.treasury = 100;
    if (ids) applyEdictsUnchecked(st, ids);
    applyPrefectureYield(st);
    return st.stats.treasury - 100;
  };
  assert.ok(Math.abs(run(null) - YIELD_TREASURY * 20) < 0.01);
  assert.ok(Math.abs(run(['zhongnong']) - YIELD_TREASURY * 20 * 1.15) < 0.01);
});

test('使用點：節用惜財降低設施成本（四捨五入）', () => {
  const st = createInitialState('edict-cost', {});
  const def = FACILITIES[FACILITY_IDS[0]];
  assert.equal(facilityCost(st, def, 0), def.levels[0].cost);
  applyEdictsUnchecked(st, ['jieyong']);
  assert.equal(facilityCost(st, def, 0), Math.round(def.levels[0].cost * 0.9));
});

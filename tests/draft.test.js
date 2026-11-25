import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { draftSlate, draftStatus, pickConsort, pickAllConsorts, DRAFT_SIZE, CONSORT_CAP, DRAFT_COST } from '../src/draft.js';
import { FACTIONS } from '../src/officials.js';
import { tickHarem } from '../src/harem.js';

function fresh(seed = 'draft-test', treasury = 500) {
  const s = createInitialState(seed);
  s.stats.treasury = treasury;
  return s;
}

test('秀女名單為四人，id 接續 nextConsortId，且與入宮後的 id 相同', () => {
  const s = fresh();
  const slate = draftSlate(s);
  assert.equal(slate.length, DRAFT_SIZE);
  const base = s.dynasty.nextConsortId;
  assert.deepEqual(slate.map((c) => c.id), [1, 2, 3, 4].map((k) => `c${base + k}`));
  for (const c of slate) {
    assert.ok(FACTIONS.includes(c.family), `family ${c.family}`);
    assert.ok(c.favor >= 40 && c.favor <= 60, 'favor 40–60 as in generateConsort');
    assert.ok(c.personName);
  }
});

test('預覽名單不改動 state，且同一狀態下結果確定', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  const a = draftSlate(s);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(draftSlate(s), a);
});

test('獨寵一人：扣國庫、入宮所選秀女，並只推進到該 id', () => {
  const s = fresh();
  const base = s.dynasty.nextConsortId;
  const slate = draftSlate(s);
  const r = pickConsort(s, 2);
  assert.equal(r.ok, true);
  assert.equal(s.consorts.length, 1);
  assert.equal(s.consorts[0].id, slate[2].id);
  assert.equal(s.consorts[0].personName, slate[2].personName);
  assert.equal(s.consorts[0].favor, slate[2].favor);
  assert.equal(s.stats.treasury, 500 - DRAFT_COST.single);
  assert.equal(s.dynasty.nextConsortId, base + 3);
});

test('雨露均霑：四人皆入宮並一次扣除 DRAFT_COST.all', () => {
  const s = fresh();
  const base = s.dynasty.nextConsortId;
  const r = pickAllConsorts(s);
  assert.equal(r.ok, true);
  assert.deepEqual(s.consorts.map((c) => c.id), [1, 2, 3, 4].map((k) => `c${base + k}`));
  assert.equal(s.stats.treasury, 500 - DRAFT_COST.all);
  assert.equal(s.dynasty.nextConsortId, base + 4);
});

test('國庫不足時拒絕入宮，state 不變', () => {
  const s = fresh('poor', DRAFT_COST.single - 1);
  const before = JSON.stringify(s);
  assert.deepEqual(pickConsort(s, 0), { ok: false, reason: 'treasury', cost: DRAFT_COST.single });
  assert.equal(JSON.stringify(s), before);
  const s2 = fresh('poor2', DRAFT_COST.all - 1);
  assert.equal(pickAllConsorts(s2).reason, 'treasury');
  assert.equal(s2.consorts.length, 0);
});

test('後宮上限：容不下時拒絕（獨寵與雨露均霑）', () => {
  const s = fresh();
  for (let i = 0; i < CONSORT_CAP - 3; i++) s.consorts.push({ id: `x${i}`, family: 'qingliu', favor: 50 });
  assert.equal(pickAllConsorts(s).reason, 'full'); // 剩 3 位，容不下 4 人
  assert.equal(pickConsort(s, 0).ok, true);
  assert.equal(pickConsort(s, 1).ok, true);
  assert.equal(pickConsort(s, 2).ok, true);
  assert.equal(s.consorts.length, CONSORT_CAP);
  assert.equal(pickConsort(s, 0).reason, 'full');
});

test('非法名額或模式回傳原因，不改 state', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  assert.equal(draftStatus(s, 'single', 9).reason, 'no_slot');
  assert.equal(draftStatus(s, 'single', null).reason, 'no_slot');
  assert.equal(draftStatus(s, 'bogus').reason, 'no_mode');
  assert.equal(pickConsort(s, -1).ok, false);
  assert.equal(JSON.stringify(s), before);
});

test('入宮後的妃嬪可由既有月結 tickHarem 接續處理', () => {
  const s = fresh();
  pickAllConsorts(s);
  for (let i = 0; i < 30; i++) {
    tickHarem(s);
    s.turn += 1;
  }
  assert.equal(s.consorts.length, 4);
  assert.ok(s.harem, 'harem 狀態已建立');
});

test('選秀國庫成本定案：獨寵 10、雨露均霑 25，註解不再標示暫定', async () => {
  assert.deepEqual({ ...DRAFT_COST }, { single: 10, all: 25 });
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/draft.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /暫定|待模擬校準/);
  assert.match(src, /定案值/);
});

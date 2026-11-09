import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { loyaltySafetyStatus, loyaltySafeInfluence } from '../src/officials.js';
import { assignOffice, dismissOffice, officeFit, officeHolder, OFFICES } from '../src/offices.js';
import { rallyFaction, suppressFaction, RALLY_TARGET_DELTA, RALLY_OTHER_DELTA } from '../src/factions.js';
import { buildGazette, yearChronicle } from '../src/gazette.js';

test('安全線判定：達標與未達標分別回報，並與 loyaltySafeInfluence 一致', () => {
  const need = loyaltySafeInfluence(40);
  assert.deepEqual(loyaltySafetyStatus({ ambition: 40 }, need), { need, influence: need, ok: true });
  const low = loyaltySafetyStatus({ ambition: 40 }, need - 1);
  assert.equal(low.ok, false);
  assert.equal(low.influence, need - 1);
});

test('手動免職：空出官職並回傳原任者；無人任職則回傳 null', () => {
  const s = createInitialState('dismiss');
  assignOffice(s, 'o1', 'revenue');
  const prev = dismissOffice(s, 'revenue');
  assert.equal(prev.id, 'o1');
  assert.equal(officeHolder(s, 'revenue'), null);
  assert.equal(dismissOffice(s, 'revenue'), null);
  assert.throws(() => dismissOffice(s, 'nope'), /unknown office/);
});

test('官職達標檢查：列出未達標需求，達標者為空陣列', () => {
  const s = createInitialState('fit');
  const o3 = s.officials.find((o) => o.id === 'o3'); // 忠誠 55，丞相需忠誠 80
  const gaps = officeFit(o3, 'chancellor');
  assert.ok(gaps.some((g) => g.key === 'loyalty' && g.need === OFFICES.chancellor.requires.loyalty));
  const o1 = s.officials.find((o) => o.id === 'o1');
  assert.deepEqual(officeFit(o1, 'revenue'), []);
});

test('拉攏：目標派 +10、其餘兩派各 -5，勢力限於 0–100', () => {
  const s = createInitialState('rally');
  s.factions = { qingliu: 40, xunggui: 30, hanmen: 30 };
  rallyFaction(s, 'qingliu');
  assert.equal(s.factions.qingliu, 40 + RALLY_TARGET_DELTA);
  assert.equal(s.factions.xunggui, 30 + RALLY_OTHER_DELTA);
  assert.equal(s.factions.hanmen, 30 + RALLY_OTHER_DELTA);
  s.factions = { qingliu: 95, xunggui: 3, hanmen: 2 };
  rallyFaction(s, 'qingliu');
  assert.equal(s.factions.qingliu, 100);
  assert.equal(s.factions.xunggui, 0);
  assert.throws(() => rallyFaction(s, 'nobody'), /unknown faction/);
});

test('拉攏與打壓互為對稱（目標派與其餘派的增減相反）', () => {
  const a = createInitialState('sym');
  const b = createInitialState('sym');
  a.factions = { qingliu: 30, xunggui: 30, hanmen: 30 };
  b.factions = { ...a.factions };
  rallyFaction(a, 'hanmen');
  suppressFaction(b, 'hanmen');
  assert.equal(a.factions.hanmen - 30, -(b.factions.hanmen - 30));
});

test('年度邸報：只取同年紀事，並與前一年比較增減', () => {
  const s = createInitialState('gz');
  s.chronicle = [
    { kind: 'era', year: 20, month: 3, text: '改元為永和' },
    { kind: 'heir_death', year: 21, month: 2, name: '甲', cause: 'rivalry' },
    { kind: 'assassination', year: 20, month: 9, source: 'tyranny', targetName: '乙', outcome: 'blocked' },
    { generation: 1, endedInYear: 22, age: 60, endReason: 'death', wars: 0 },
  ];
  s.annals = [
    { year: 19, generation: 1, treasury: 100, people: 50, military: 40, agriculture: 30, wars: 1, wins: 1 },
    { year: 20, generation: 1, treasury: 130, people: 45, military: 40, agriculture: 35, wars: 2, wins: 1 },
  ];
  const g = buildGazette(s, 20);
  assert.equal(g.lines.length, 2);
  assert.equal(g.annal.year, 20);
  assert.deepEqual(g.deltas, { treasury: 30, people: -5, military: 0, agriculture: 5 });
  assert.equal(g.empty, false);
  assert.equal(yearChronicle(s, 22).length, 1); // 世代紀錄以 endedInYear 歸年
});

test('邸報：首年無前年可比，增減為 null；全無資料者標記為空', () => {
  const s = createInitialState('gz2');
  s.annals = [{ year: 19, generation: 1, treasury: 1, people: 1, military: 1, agriculture: 1 }];
  const g = buildGazette(s, 19);
  assert.deepEqual(g.deltas, { treasury: null, people: null, military: null, agriculture: null });
  const none = buildGazette(createInitialState('gz3'), 99);
  assert.equal(none.empty, true);
  assert.equal(none.annal, null);
  assert.equal(none.generation, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { buildGeneralCard } from '../src/general-cards.js';
import { ASSASSIN_LOW_LOYALTY } from '../src/assassination.js';
import { exportSave } from '../src/save.js';

const official = (over = {}) => ({
  id: 'o1',
  personName: '王伯安',
  name: 'o1',
  loyalty: 72,
  ambition: 20,
  faction: 'qingliu',
  office: 'war',
  age: 48,
  traits: ['bold', 'diligent', 'cautious'],
  abilities: { intellect: 50, politics: 40, martial: 70, command: 65, virtue: 55 },
  ...over,
});

test('卡片資料組裝：欄位取自官員物件（姓名、首字、派系、官職、忠誠、統御）', () => {
  const c = buildGeneralCard(official());
  assert.equal(c.id, 'o1');
  assert.equal(c.name, '王伯安');
  assert.equal(c.initial, '王');
  assert.equal(c.faction, 'qingliu');
  assert.equal(c.factionName, '清流');
  assert.equal(c.office, 'war');
  assert.equal(c.loyalty, 72);
  assert.equal(c.age, 48);
  assert.equal(c.command, 65);
  assert.equal(c.martial, 70);
});

test('特質標籤最多兩個，且為既有特質的中文名稱', () => {
  const c = buildGeneralCard(official());
  assert.equal(c.tags.length, 2);
  assert.deepEqual(c.tags, ['果敢', '勤勉']);
});

test('無特質時以派系名稱作為標籤', () => {
  const c = buildGeneralCard(official({ traits: [] }));
  assert.deepEqual(c.tags, ['清流']);
});

test('忠誠警示門檻引用既有常數 ASSASSIN_LOW_LOYALTY', () => {
  const below = buildGeneralCard(official({ loyalty: ASSASSIN_LOW_LOYALTY - 1 }));
  const at = buildGeneralCard(official({ loyalty: ASSASSIN_LOW_LOYALTY }));
  assert.equal(below.loyaltyWarn, true);
  assert.equal(at.loyaltyWarn, false);
  assert.equal(below.loyaltyWarnBelow, ASSASSIN_LOW_LOYALTY);
});

test('忠誠高於門檻者不標示警示', () => {
  assert.equal(buildGeneralCard(official({ loyalty: 95 })).loyaltyWarn, false);
});

test('缺欄位時不拋例外，並以 null 或預設值代替', () => {
  const empty = buildGeneralCard({ id: 'x' });
  assert.equal(empty.name, 'x');
  assert.equal(empty.initial, 'x');
  assert.equal(empty.loyalty, null);
  assert.equal(empty.loyaltyWarn, false);
  assert.equal(empty.age, null);
  assert.equal(empty.command, null);
  assert.equal(empty.office, null);
  assert.equal(empty.factionName, '無派');
  assert.deepEqual(empty.tags, ['無派']);
});

test('缺整個物件或 null 輸入時不拋例外', () => {
  assert.doesNotThrow(() => buildGeneralCard(undefined));
  assert.doesNotThrow(() => buildGeneralCard(null));
  assert.equal(buildGeneralCard(null).name, '');
  assert.equal(buildGeneralCard(null).initial, '？');
});

test('abilities 或數值欄位型別錯誤時不拋例外', () => {
  const c = buildGeneralCard(official({ abilities: null, age: 'old', loyalty: 'high' }));
  assert.equal(c.command, null);
  assert.equal(c.martial, null);
  assert.equal(c.age, null);
  assert.equal(c.loyalty, null);
});

test('組裝卡片不改動官員物件', () => {
  const o = official();
  const before = JSON.stringify(o);
  buildGeneralCard(o);
  assert.equal(JSON.stringify(o), before);
});

test('展開狀態不進入存檔：組裝卡片前後存檔內容完全相同', () => {
  const s = createInitialState('general-cards-test');
  const fixedNow = () => 0;
  const before = exportSave(s, { now: fixedNow });
  for (const o of s.officials) buildGeneralCard(o);
  const after = exportSave(s, { now: fixedNow });
  assert.equal(after, before);
  assert.equal(before.includes('expanded'), false);
  assert.equal(before.includes('gcard'), false);
});

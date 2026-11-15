import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { isGeneral, buildGeneralCard, MILITARY_OFFICES } from '../src/general-cards.js';
import { isCourtOfficial, unmetRequirements } from '../src/officials.js';
import { officeFit, assignOffice, OFFICES } from '../src/offices.js';
import { autoAppoint } from '../src/selection.js';
import { MAX_OFFICIALS, applyOption } from '../src/turn.js';

const o5Of = (s) => s.officials.find((o) => o.id === 'o5');

test('開局恰有一名武將：兵部尚書 o5，其餘朝臣皆非武將', () => {
  const s = createInitialState('open-gen-1');
  const generals = s.officials.filter(isGeneral).map((o) => o.id);
  assert.deepEqual(generals, ['o5']);
  assert.deepEqual(MILITARY_OFFICES, ['war']);
});

test('o5 的官職、派系、忠誠與野心符合設計預設', () => {
  const o = o5Of(createInitialState('open-gen-2'));
  assert.equal(o.name, '兵部尚書');
  assert.equal(o.office, 'war');
  assert.equal(o.faction, 'xunggui');
  assert.equal(o.loyalty, 70);
  assert.equal(o.ambition, 25);
});

test('o5 智力達兵部需求，開局即為適任（無 unfit_office 缺口）', () => {
  const o = o5Of(createInitialState('open-gen-3'));
  assert.deepEqual(officeFit(o, 'war'), []);
  assert.deepEqual(unmetRequirements(o, OFFICES.war.requires), []);
});

test('o5 的人物欄位決定性：同一種子重建得到相同姓名、年齡與特質', () => {
  const a = o5Of(createInitialState('open-gen-det'));
  const b = o5Of(createInitialState('open-gen-det'));
  assert.equal(a.personName, b.personName);
  assert.equal(a.age, b.age);
  assert.deepEqual(a.traits, b.traits);
  assert.ok(typeof a.personName === 'string' && a.personName.length > 0);
});

test('開局官員總數未超過 MAX_OFFICIALS，且仍可招募至上限', () => {
  const s = createInitialState('open-gen-cap');
  assert.equal(s.officials.filter(isCourtOfficial).length, 5);
  assert.equal(s.officials.length, 11);
  assert.ok(s.officials.length <= MAX_OFFICIALS);
});

test('吏部自動任命不會改動兵部：o5 持有 war 時僅此一人任職', () => {
  const s = createInitialState('open-gen-auto');
  autoAppoint(s);
  assert.equal(o5Of(s).office, 'war');
  assert.equal(s.officials.filter((o) => o.office === 'war').length, 1);
});

test('o5 的將領卡資料可由既有欄位組裝，職位為 war', () => {
  const card = buildGeneralCard(o5Of(createInitialState('open-gen-card')));
  assert.equal(card.office, 'war');
  assert.equal(card.loyalty, 70);
  assert.equal(card.command, 70);
  assert.equal(card.martial, 10);
});

test('以 assignOffice 任命他人為兵部時，o5 卸任，仍只有一位武將', () => {
  const s = createInitialState('open-gen-swap');
  assignOffice(s, 'o2', 'war');
  assert.equal(o5Of(s).office, null);
  assert.deepEqual(s.officials.filter(isGeneral).map((o) => o.id), ['o2']);
});

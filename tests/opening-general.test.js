import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { isGeneral, buildGeneralCard, MILITARY_OFFICES } from '../src/general-cards.js';
import { isCourtOfficial } from '../src/officials.js';
import { OFFICES, assignOffice } from '../src/offices.js';
import { autoAppoint } from '../src/selection.js';
import { MAX_OFFICIALS } from '../src/turn.js';

// 方案 3：不設開局武將，兵部武職定義保留，叛亂產出減半另見 rebel-yield.test.js。

test('開局朝堂無武將：所有朝臣皆非武將，故無將領卡', () => {
  const s = createInitialState('open-gen-1');
  assert.equal(s.officials.filter(isCourtOfficial).filter(isGeneral).length, 0);
});

test('開局無兵部尚書任職：war 官職開局無人持有', () => {
  const s = createInitialState('open-gen-2');
  assert.equal(s.officials.filter((o) => o.office === 'war').length, 0);
  assert.equal(OFFICES.war.name, '兵部尚書');
});

test('兵部武職定義仍為 war，且開局僅朝臣四位加六位知府', () => {
  assert.deepEqual(MILITARY_OFFICES, ['war']);
  const s = createInitialState('open-gen-3');
  assert.equal(s.officials.filter(isCourtOfficial).length, 4);
  assert.equal(s.officials.length, 10);
});

test('開局官員名單未超過 MAX_OFFICIALS', () => {
  const s = createInitialState('open-gen-cap');
  assert.ok(s.officials.length <= MAX_OFFICIALS);
});

test('吏部自動任命於開局後可補上兵部，且只會有一位兵部尚書', () => {
  const s = createInitialState('open-gen-auto');
  autoAppoint(s);
  assert.equal(s.officials.filter((o) => o.office === 'war').length, s.officials.some((o) => o.office === 'war') ? 1 : 0);
});

test('官職 war 任命後，該官員判為武將並可產生將領卡，職位為 war', () => {
  const s = createInitialState('open-gen-assign');
  assignOffice(s, 'o2', 'war');
  assert.deepEqual(s.officials.filter(isGeneral).map((o) => o.id), ['o2']);
  assert.equal(buildGeneralCard(s.officials.find((o) => o.id === 'o2')).office, 'war');
});

test('武略不影響武將判定：職位非武職者即使武略滿分亦非武將', () => {
  const s = createInitialState('open-gen-mart');
  const o = s.officials.find((x) => x.id === 'o1');
  o.abilities.martial = 100;
  assert.equal(isGeneral(o), false);
});

test('同種子重建的開局狀態完全相同（決定性不受影響）', () => {
  const a = createInitialState('open-gen-det');
  const b = createInitialState('open-gen-det');
  assert.deepEqual(a.officials, b.officials);
});

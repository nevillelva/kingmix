import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { governorOf, PREFECTURE_DEFS } from '../src/economy.js';
import {
  prefectureLatePressure, courtMinisterStatus,
  AUTONOMY_MONTHS, DEFIANT_MONTHS, MINISTER_END, MINISTER_FACTION, MINISTER_MONTHS,
} from '../src/late-pressure.js';
import { prefecturePressureText, courtMinisterText } from '../web/ui/render-pressure.js';

const snapshot = (s) => structuredClone(s);

test('州府狀況：安穩之府回報無割據、無天災', () => {
  const s = createInitialState('pui-calm');
  const id = s.prefectures[0].id;
  const st = prefectureLatePressure(s, id);
  assert.equal(st.autonomous, false);
  assert.equal(st.autonomyLeft, 0);
  assert.equal(st.defiantLimit, DEFIANT_MONTHS);
  assert.equal(st.disasterCount, 0);
  assert.equal(st.lastDisaster, null);
  assert.equal(prefecturePressureText(s, id), '安穩　天災 無');
});

test('州府狀況：離心中顯示已離心月數與上限', () => {
  const s = createInitialState('pui-defiant');
  const pref = s.prefectures[0];
  pref.defiantMonths = 5;
  assert.equal(prefectureLatePressure(s, pref.id).defiantMonths, 5);
  assert.equal(prefecturePressureText(s, pref.id), `離心 5 / ${DEFIANT_MONTHS} 月　天災 無`);
});

test('州府狀況：割據中顯示已割據月數與歸順剩餘月數', () => {
  const s = createInitialState('pui-auto');
  const pref = s.prefectures[1];
  pref.autonomous = true;
  pref.autonomyMonths = 10;
  const st = prefectureLatePressure(s, pref.id);
  assert.equal(st.autonomous, true);
  assert.equal(st.autonomyMonths, 10);
  assert.equal(st.autonomyLeft, AUTONOMY_MONTHS - 10);
  assert.match(prefecturePressureText(s, pref.id), new RegExp(`割據中，已 10 月，歸順尚餘 ${AUTONOMY_MONTHS - 10} 月`));
});

test('州府狀況：天災紀錄只計本府，並取最近一筆', () => {
  const s = createInitialState('pui-disaster');
  const [a, b] = s.prefectures;
  s.latePressure = {
    minister: null, ministerMonths: 0,
    disasters: [
      { turn: 1, year: 1, month: 2, prefecture: a.id },
      { turn: 2, year: 1, month: 3, prefecture: b.id },
      { turn: 3, year: 1, month: 5, prefecture: a.id },
    ],
  };
  const st = prefectureLatePressure(s, a.id);
  assert.equal(st.disasterCount, 2);
  assert.deepEqual(st.lastDisaster, { year: 1, month: 5 });
  assert.equal(prefecturePressureText(s, a.id), '安穩　天災 2 起，最近於 1 年 5 月');
});

test('州府狀況：府不存在時回傳 null，文字為空', () => {
  const s = createInitialState('pui-missing');
  assert.equal(prefectureLatePressure(s, 'no-such-prefecture'), null);
  assert.equal(prefecturePressureText(s, 'no-such-prefecture'), '');
});

test('州府狀況：缺少 latePressure 與割據欄位的舊存檔不報錯', () => {
  const s = createInitialState('pui-legacy');
  delete s.latePressure;
  for (const p of s.prefectures) { delete p.defiantMonths; delete p.autonomous; delete p.autonomyMonths; }
  const id = s.prefectures[0].id;
  assert.equal(prefectureLatePressure(s, id).autonomous, false);
  assert.equal(prefectureLatePressure(s, id).defiantMonths, 0);
  assert.equal(courtMinisterStatus(s).present, false);
});

test('權臣狀況：無權臣時回報最強派系與累積月數', () => {
  const s = createInitialState('pui-nominister');
  s.factions = { qingliu: 60, xunggui: 20, hanmen: 20 };
  s.latePressure = { minister: null, ministerMonths: 4, disasters: [] };
  const st = courtMinisterStatus(s);
  assert.equal(st.present, false);
  assert.deepEqual(st.strongest, { faction: 'qingliu', power: 60 });
  assert.equal(st.watchMonths, 4);
  assert.equal(st.watchLimit, MINISTER_MONTHS);
  assert.equal(st.watchThreshold, MINISTER_FACTION);
  assert.equal(courtMinisterText(s), `朝中無權臣。最強派系 清流勢 60，高於 ${MINISTER_FACTION} 已 4 / ${MINISTER_MONTHS} 月。`);
});

test('權臣狀況：在朝時回報其人、所屬派系與勢力數值', () => {
  const s = createInitialState('pui-minister');
  s.factions = { qingliu: 20, xunggui: 70, hanmen: 10 };
  s.latePressure = { minister: { id: 'x', name: '甲', faction: 'xunggui', year: 2, month: 3 }, ministerMonths: 0, disasters: [] };
  const st = courtMinisterStatus(s);
  assert.equal(st.present, true);
  assert.equal(st.name, '甲');
  assert.deepEqual(st.since, { year: 2, month: 3 });
  assert.equal(st.factionPower, 70);
  assert.equal(st.endBelow, MINISTER_END);
  assert.equal(courtMinisterText(s), `權臣在朝：甲（勳貴），所屬派系勢力 70，派系跌破 ${MINISTER_END} 即失勢。`);
});

test('純讀取：讀取狀況不修改 state（懶初始化與數值皆不變）', () => {
  const s = createInitialState('pui-pure');
  delete s.latePressure;
  const before = snapshot(s);
  for (const def of PREFECTURE_DEFS) {
    prefectureLatePressure(s, def.id);
    prefecturePressureText(s, def.id);
  }
  courtMinisterStatus(s);
  courtMinisterText(s);
  assert.deepEqual(s, before);
  assert.equal(s.latePressure, undefined, '讀取不得補上 latePressure');
});

test('純讀取：府與知府的對應不變，缺任命時仍可讀取', () => {
  const s = createInitialState('pui-gov');
  const pref = s.prefectures[0];
  const gov = governorOf(s, pref);
  const st = prefectureLatePressure(s, pref.id);
  assert.equal(st.governorless, !gov);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chronicleLine } from '../src/chronicle.js';
import { eraChronicleEntry } from '../src/era.js';

test('era 紀錄：文字來自 eraChronicleEntry，標籤為改元', () => {
  const c = eraChronicleEntry({ year: 2, month: 3, from: '永和', to: '承平' });
  assert.deepEqual(chronicleLine(c), { text: '改元為承平，於 2 年 3 月', tag: '改元' });
});

test('heir_death：依 cause 顯示奪嫡失勢或幼年夭折，不含 generation/endedInYear', () => {
  const base = { kind: 'heir_death', generation: 1, year: 5, month: 7, heirId: 'h1', name: '弘', age: 3 };
  assert.deepEqual(chronicleLine({ ...base, cause: 'child_mortality' }), { text: '皇子弘 · 5年7月', tag: '幼年夭折' });
  assert.deepEqual(chronicleLine({ ...base, cause: 'rivalry' }), { text: '皇子弘 · 5年7月', tag: '奪嫡失勢' });
  assert.equal(chronicleLine({ ...base, cause: 'other' }).tag, '夭折');
});

test('世代紀錄（無 kind）：第 N 世 · 年 · 歲，並依 endReason 顯示駕崩／禪位／致仕', () => {
  const base = { generation: 2, endedInYear: 30, age: 61 };
  assert.deepEqual(chronicleLine({ ...base, endReason: 'death' }), { text: '第2世 · 30年 · 61歲', tag: '駕崩' });
  assert.equal(chronicleLine({ ...base, endReason: 'abdicated' }).tag, '高年致仕');
  assert.equal(chronicleLine({ ...base, endReason: '禪位' }).tag, '禪位');
  assert.equal(chronicleLine({ ...base, endReason: null }).tag, '駕崩');
});

test('缺漏欄位以「—」代替，任何 kind 的輸出都不含 undefined 或 null', () => {
  const samples = [
    { kind: 'era' },
    { kind: 'heir_death' },
    { kind: 'heir_death', cause: 'rivalry', name: '弘' },
    {},
    { generation: 3 },
    { generation: 1, endedInYear: 4, age: null, endReason: 'death' },
  ];
  for (const c of samples) {
    const { text, tag } = chronicleLine(c);
    for (const s of [text, tag]) {
      assert.ok(!/undefined|null/.test(s), `${JSON.stringify(c)} → ${s}`);
    }
  }
  assert.equal(chronicleLine(null).text, '—');
});

test('heir_death 的渲染不再產生「第undefined世」', () => {
  const { text } = chronicleLine({ kind: 'heir_death', generation: 1, year: 5, month: 7, name: '弘', cause: 'rivalry' });
  assert.ok(!text.includes('第'), text);
});

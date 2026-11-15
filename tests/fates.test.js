import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { tickFates, endFate, closeFatesAtEnd } from '../src/fates.js';
import { FATE_ARCS, FATE_END_TAG } from '../src/fate-data.js';
import { chronicleLine } from '../src/chronicle.js';
import { removeOfficial } from '../src/turn.js';
import { bondedRemonstrant } from '../src/turn.js';
import { recordSharedEvent, BOND_THRESHOLD } from '../src/bonds.js';

const at = (s, year, month) => Object.assign(s, { year, month });
const court = (s) => s.officials.filter((o) => !o.prefecture);
const fated = (s, role) => Object.entries(s.fates).filter(([k]) => k.startsWith(`${role}:`));

function fresh(seed = 'fate-test') {
  const s = createInitialState(seed);
  s.chronicle = [];
  s.consorts = [];
  s.heirs = [];
  s.fates = {};
  at(s, 1, 1);
  return s;
}

test('命運線資料：每條線 2–3 段，結局與標籤齊全，文本無 undefined', () => {
  for (const [role, arcs] of Object.entries(FATE_ARCS)) {
    for (const [key, arc] of Object.entries(arcs)) {
      assert.ok(arc.beats.length >= 2 && arc.beats.length <= 3, `${role}/${key} beats`);
      for (const b of arc.beats) {
        for (const t of Object.values(b.text)) assert.ok(t && !t.includes('undefined'), `${role}/${key} text`);
      }
      for (const [cause, t] of Object.entries(arc.endings)) {
        assert.ok(t.includes('{name}'), `${role}/${key}/${cause} uses {name}`);
        assert.ok(FATE_END_TAG[cause], `${role}/${key}/${cause} has tag`);
      }
      assert.ok(arc.endings.survived, `${role}/${key} has survived ending`);
    }
  }
  assert.ok(FATE_ARCS.official.qingliu.endings.remonstrance);
  assert.ok(FATE_ARCS.official.xunggui.endings.slain);
});

test('朝臣進入命運線：首段寫入史冊，人名代入、無殘留 {name}', () => {
  const s = fresh();
  tickFates(s);
  const o = court(s)[0];
  const rec = s.fates[`official:${o.id}`];
  assert.equal(rec.stage, 1);
  const entries = s.chronicle.filter((c) => c.kind === 'fate');
  assert.equal(entries.length, court(s).length, 'every court official enters on first tick');
  assert.ok(entries.every((c) => !c.text.includes('{name}')));
  assert.equal(chronicleLine(entries[0]).tag, '朝臣');
});

test('第二段須經 12 個月，且依相得與否分歧', () => {
  const s = fresh();
  tickFates(s);
  const o = court(s)[0];
  o.loyalty = 90;
  recordSharedEvent(s, o.id, 'E1');
  for (let i = 0; i < BOND_THRESHOLD - 1; i++) recordSharedEvent(s, o.id, `E${i + 2}`);
  at(s, 1, 6);
  tickFates(s);
  assert.equal(s.fates[`official:${o.id}`].stage, 1, 'not yet after 5 months');
  at(s, 2, 1);
  tickFates(s);
  assert.equal(s.fates[`official:${o.id}`].stage, 2);
  const line = s.chronicle.filter((c) => c.kind === 'fate' && c.name === (o.personName ?? o.name)).at(-1);
  assert.match(line.text, /君臣相得/);
});

test('皇嗣須達年齡門檻才進入命運線', () => {
  const s = fresh();
  s.heirs.push({ id: 'h1', name: '皇子h1', gender: 'male', mother: null, personality: 'gentle', age: 5, abilities: {} });
  tickFates(s);
  assert.equal(fated(s, 'heir').length, 0);
  s.heirs[0].age = 6;
  tickFates(s);
  assert.equal(s.fates['heir:h1'].stage, 1);
  assert.equal(s.chronicle.at(-1).tag, '皇子');
});

test('死諫除名寫入結局，標籤為死諫；同一人只結局一次', () => {
  const s = fresh();
  tickFates(s);
  const o = court(s).find((x) => x.faction === 'qingliu') ?? court(s)[0];
  removeOfficial(s, o, 'remonstrance');
  const end = s.chronicle.find((c) => c.kind === 'fate_end');
  assert.ok(end, 'ending written');
  assert.equal(chronicleLine(end).tag, '死諫');
  assert.equal(s.fates[`official:${o.id}`].ended, true);
  assert.equal(endFate(s, 'official', o.id, 'dismissed'), false);
  assert.equal(s.chronicle.filter((c) => c.kind === 'fate_end').length, 1);
});

test('未曾進入命運線者不寫結局；終局時仍在世者以善終收束', () => {
  const s = fresh();
  assert.equal(endFate(s, 'heir', 'h99', 'child_mortality'), false);
  tickFates(s);
  closeFatesAtEnd(s);
  const ends = s.chronicle.filter((c) => c.kind === 'fate_end');
  assert.equal(ends.length, court(s).length);
  assert.ok(ends.every((c) => chronicleLine(c).tag === '善終'));
  assert.ok(ends.every((c) => !c.text.includes('{name}')));
});

test('史冊的命運線紀錄可由 chronicleLine 正常渲染，無 undefined 或 null', () => {
  const s = fresh();
  tickFates(s);
  closeFatesAtEnd(s);
  for (const c of s.chronicle) {
    const l = chronicleLine(c);
    assert.ok(l.text && !/undefined|null/.test(l.text), l.text);
    assert.ok(l.tag && !/undefined|null/.test(l.tag), l.tag);
  }
});

test('命運線純紀錄：不改動任何數值或亂數狀態', () => {
  const s = fresh();
  const before = JSON.stringify({ stats: s.stats, officials: s.officials, factions: s.factions });
  tickFates(s);
  closeFatesAtEnd(s);
  assert.equal(JSON.stringify({ stats: s.stats, officials: s.officials, factions: s.factions }), before);
  assert.equal(bondedRemonstrant(s), null);
});

test('皇帝駕崩後命運線不再推進', () => {
  const s = fresh();
  s.alive = false;
  tickFates(s);
  assert.equal(s.chronicle.length, 0);
  assert.deepEqual(s.fates, {});
});

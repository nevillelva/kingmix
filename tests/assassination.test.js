import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { tickAssassination, assassinChance, MEMORIAL, ASSASSIN_TYRANNY_THRESHOLD } from '../src/assassination.js';
import { chronicleLine } from '../src/chronicle.js';
import { pickEvent } from '../src/sim.js';
import { makeRng } from '../src/rng.js';
import { eventAllowed, EVENT_MAX_PER_RUN, EVENT_COOLDOWN } from '../src/events.js';
import { monthlyTick } from '../src/turn.js';
import { FACTION_BASE } from '../src/state.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const MEMORIAL_IDS = Object.values(MEMORIAL);

// 逐月掃描：每回合重置會被刺殺改寫的狀態（駕崩、奏摺排程），回傳第一個符合 predicate 的結果。
function scan(state, predicate, maxMonths = 6000, { keepChain = false } = {}) {
  for (let i = 0; i < maxMonths; i++) {
    state.year = 1 + Math.floor(i / 12);
    state.month = (i % 12) + 1;
    if (!keepChain) state.pendingChain = [];
    const r = tickAssassination(state);
    if (r && predicate(r, state)) return { r, state };
    state.alive = true;
    state.endReason = null;
  }
  return null;
}

// 來源一：暴政
test('tyranny: no chance at or below the E305 threshold, rising above it', () => {
  const s = createInitialState('a-tyr');
  s.tyranny = ASSASSIN_TYRANNY_THRESHOLD;
  assert.equal(assassinChance(s, 'tyranny'), 0);
  s.tyranny = 100;
  assert.ok(assassinChance(s, 'tyranny') > 0);
  s.tyranny = 70;
  const mid = assassinChance(s, 'tyranny');
  s.tyranny = 100;
  assert.ok(mid < assassinChance(s, 'tyranny'));
});

test('tyranny source fires as a 暴政 assassination at high tyranny', () => {
  const s = createInitialState('a-tyr-hit');
  s.tyranny = 100;
  const hit = scan(s, (r) => r.source === 'tyranny');
  assert.ok(hit, 'expected a tyranny-sourced attempt within 6000 months');
  const c = s.chronicle.find((x) => x.kind === 'assassination' && x.source === 'tyranny');
  assert.ok(c);
});

// 來源二：前朝遺臣
test('remnant: only after a dynastic change (generation > 1)', () => {
  const s = createInitialState('a-rem');
  assert.equal(assassinChance(s, 'remnant'), 0);
  s.dynasty.generation = 2;
  assert.ok(assassinChance(s, 'remnant') > 0);
});

test('remnant source fires after a dynastic change', () => {
  const s = createInitialState('a-rem-hit');
  s.dynasty.generation = 2;
  assert.ok(scan(s, (r) => r.source === 'remnant'));
});

// 來源三：朝堂江湖
test('court: needs a strong faction and disloyal officials', () => {
  const s = createInitialState('a-court');
  s.factions = { qingliu: FACTION_BASE, xunggui: FACTION_BASE, hanmen: FACTION_BASE };
  for (const o of s.officials) o.loyalty = 10;
  assert.equal(assassinChance(s, 'court'), 0, '派系中性（無強勢派系）時為 0');
  s.factions.qingliu = 90;
  assert.ok(assassinChance(s, 'court') > 0);
});

test('court source fires with strong faction and disloyal officials', () => {
  const s = createInitialState('a-court-hit');
  for (const o of s.officials) o.loyalty = 5;
  s.factions = { qingliu: 95, xunggui: FACTION_BASE, hanmen: FACTION_BASE };
  assert.ok(scan(s, (r) => r.source === 'court'));
});

// 確定性
test('same seed and month give the same assassination result', () => {
  const a = createInitialState('det');
  const b = createInitialState('det');
  a.tyranny = b.tyranny = 90;
  a.dynasty.generation = b.dynasty.generation = 2;
  a.year = b.year = 7;
  a.month = b.month = 5;
  assert.deepEqual(tickAssassination(a), tickAssassination(b));
  assert.deepEqual(a.chronicle, b.chronicle);
});

// 上限與冷卻
test('a memorial already at the per-run cap blocks that attempt', () => {
  const s = createInitialState('cap');
  s.dynasty.generation = 2;
  s.eventHistory = { counts: Object.fromEntries(MEMORIAL_IDS.map((id) => [id, EVENT_MAX_PER_RUN])), last: {} };
  const hit = scan(s, (r) => MEMORIAL[`${r.source}|${r.target}|${r.outcome}`] !== undefined);
  assert.equal(hit, null, '所有有奏摺的刺殺皆被上限擋下');
  assert.ok(MEMORIAL_IDS.every((id) => !eventAllowed(s, id)));
});

test('a memorial inside its cooldown blocks that attempt', () => {
  const s = createInitialState('cool');
  s.dynasty.generation = 2;
  const now = (s.year - 1) * 12 + (s.month - 1);
  s.eventHistory = { counts: {}, last: Object.fromEntries(MEMORIAL_IDS.map((id) => [id, now])) };
  assert.equal(EVENT_COOLDOWN, 24);
  // 冷卻為 24 個月：掃描範圍限於冷卻期內
  const hit = scan(s, (r) => MEMORIAL[`${r.source}|${r.target}|${r.outcome}`] !== undefined, 24);
  assert.equal(hit, null);
});

test('a memorial already queued for next month is not queued twice', () => {
  const s = createInitialState('dup');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  const queued = MEMORIAL_IDS;
  s.pendingChain = [...queued];
  const hit = scan(s, (r) => MEMORIAL[`${r.source}|${r.target}|${r.outcome}`] !== undefined, 6000, { keepChain: true });
  assert.equal(hit, null);
});

// 結果：皇帝死亡、太子死亡、官員死亡
test('emperor killed: alive false and endReason assassinated', () => {
  const s = createInitialState('kill-emp');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  const hit = scan(s, (r) => r.target === 'emperor' && r.outcome === 'killed');
  assert.ok(hit, 'expected an emperor killing within 6000 months');
  assert.equal(hit.state.alive, false);
  assert.equal(hit.state.endReason, 'assassinated');
});

test('heir killed: crown prince cleared and heir removed', () => {
  const s = createInitialState('kill-heir');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  s.heirs = [{ id: 'h9', name: '皇子h9', gender: 'male', age: 20, abilities: {} }];
  s.dynasty.crownPrince = 'h9';
  const hit = scan(s, (r) => r.target === 'heir' && r.outcome === 'killed');
  assert.ok(hit, 'expected a crown prince killing within 6000 months');
  assert.equal(hit.state.dynasty.crownPrince, null);
  assert.equal(hit.state.heirs.some((h) => h.id === 'h9'), false);
});

test('official killed: returned to the caller for removal', () => {
  const s = createInitialState('kill-off');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  const hit = scan(s, (r) => r.target === 'official' && r.outcome === 'killed');
  assert.ok(hit, 'expected an official killing within 6000 months');
  assert.ok(hit.r.official && hit.r.official.id);
});

test('monthlyTick removes a killed official from the court', () => {
  const s = createInitialState('kill-off-tick');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  const before = s.officials.length;
  let removed = false;
  for (let i = 0; i < 6000 && !removed; i++) {
    s.year = 1 + Math.floor(i / 12);
    s.month = (i % 12) + 1;
    s.pendingChain = [];
    const count = s.officials.length;
    monthlyTick(s, makeRng(['t', i]));
    if (s.officials.length < count) removed = true;
    if (!s.alive) { s.alive = true; s.endReason = null; }
    if (s.officials.length < 4) s.officials.push({ id: `x${i}`, name: '補缺', loyalty: 60, ambition: 10, faction: 'qingliu', office: null, abilities: { intellect: 50, politics: 50, martial: 50, command: 50, virtue: 50 } });
  }
  assert.ok(removed && before >= 1);
});

// 事件與文字
test('E401–E412 are assassination events with narrative and speaker, using existing effect keys', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `E${401 + i}`);
  const STAT = new Set(['health', 'literature', 'military', 'power', 'benevolence', 'prestige', 'charm', 'treasury', 'people', 'agriculture', 'commerce', 'armament', 'heaven', 'population']);
  const KNOWN = new Set(['official_loyalty_add', 'recruit', 'removeOfficial', 'chain', 'shared_event', 'setFlag']);
  for (const id of ids) {
    const e = events.find((x) => x.id === id);
    assert.ok(e, id);
    assert.equal(e.kind, 'assassination');
    assert.ok(e.narrative && e.speaker, id);
    for (const o of e.options) {
      for (const k of Object.keys(o.effects || {})) assert.ok(STAT.has(k) || KNOWN.has(k), `${id} effect ${k}`);
    }
  }
  assert.equal(ids.length, new Set(ids).size);
});

test('assassination events never enter the random pool', () => {
  const s = createInitialState('pool');
  s.dynasty.generation = 2;
  s.tyranny = 100;
  for (let i = 0; i < 300; i++) {
    const e = pickEvent(s, events, makeRng(['pool', i]));
    if (e) assert.equal(e.kind === 'assassination', false, e.id);
  }
});

test('chronicleLine formats assassination without undefined', () => {
  assert.deepEqual(
    chronicleLine({ kind: 'assassination', source: 'remnant', target: 'emperor', targetName: '皇帝', year: 3, month: 4, outcome: 'killed' }),
    { text: '前朝遺臣行刺皇帝 · 3年4月', tag: '死亡' },
  );
  assert.equal(chronicleLine({ kind: 'assassination', source: 'court', targetName: '戶部尚書', year: 2, month: 1, outcome: 'blocked' }).tag, '擋下');
  assert.equal(chronicleLine({ kind: 'assassination', source: 'tyranny', targetName: '皇子h2', year: 5, month: 6, outcome: 'injured' }).tag, '受傷');
  for (const c of [{ kind: 'assassination' }, { kind: 'assassination', source: 'x', outcome: 'y' }]) {
    const { text, tag } = chronicleLine(c);
    assert.ok(!/undefined|null/.test(`${text}${tag}`), JSON.stringify(c));
  }
});

test('an emperor killed by assassination is labeled 遇刺 in the ending chronicle', () => {
  assert.equal(chronicleLine({ generation: 2, endedInYear: 30, age: 40, endReason: 'assassinated' }).tag, '遇刺');
});

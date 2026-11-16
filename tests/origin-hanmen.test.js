import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINS, UNLOCKABLE_ORIGINS, applyOrigin, originEvents, originEventDefs, withOriginEvents } from '../src/origin.js';
import { createInitialState, BOUNDS } from '../src/state.js';
import { isEligible, optionOpen } from '../src/events.js';
import { pickEvent } from '../src/selection.js';
import { runSimulation } from '../src/sim.js';
import { readFileSync } from 'node:fs';
import { HANMEN_EVENTS } from '../src/origin-events-data.js';

const mainEvents = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const always = () => 0;
const hanmenIds = HANMEN_EVENTS.map((e) => e.id);

test('寒門崛起：originEvents 回傳 6–8 則、與獨立檔一致、ID 不與主事件庫衝突', () => {
  const ids = originEvents('hanmen');
  assert.ok(ids.length >= 6 && ids.length <= 8);
  assert.deepEqual(ids, hanmenIds);
  for (const id of ids) assert.equal(mainEvents.some((e) => e.id === id), false, `${id} must not be in data/events.json`);
});

test('寒門崛起：事件格式正確（名稱、說明、when、2–3 個選項、效果鍵皆為數值屬性）', () => {
  for (const e of originEventDefs('hanmen')) {
    assert.equal(typeof e.name, 'string');
    assert.equal(typeof e.speaker, 'string');
    assert.equal(typeof e.narrative, 'string');
    assert.equal(e.when.flag, 'origin:hanmen', e.id);
    assert.ok(e.options.length >= 2 && e.options.length <= 3, e.id);
    for (const o of e.options) {
      assert.equal(typeof o.key, 'string');
      assert.equal(typeof o.label, 'string');
      assert.equal(typeof o.tone, 'string');
      for (const [k, v] of Object.entries(o.effects)) {
        assert.ok(k in BOUNDS, `${e.id} unknown effect ${k}`);
        assert.equal(typeof v, 'number');
      }
    }
  }
});

test('寒門崛起：其他出身（含預設）不併入寒門事件，且事件池不變', () => {
  for (const o of ORIGINS) {
    assert.deepEqual(originEventDefs(o.id), [], o.id);
    assert.equal(originEvents(o.id).some((id) => hanmenIds.includes(id)), false, o.id);
    assert.equal(withOriginEvents(mainEvents, o.id), mainEvents, o.id);
  }
  for (const o of UNLOCKABLE_ORIGINS.filter((x) => x.id !== 'hanmen')) {
    assert.deepEqual(originEvents(o.id), [], o.id);
    assert.deepEqual(originEventDefs(o.id), [], o.id);
  }
});

test('寒門崛起：每則事件只在寒門出身的局中可觸發', () => {
  for (const e of originEventDefs('hanmen')) {
    const month = e.when.months?.[0] ?? 1;
    const hanmen = applyOrigin(createInitialState(9), 'hanmen');
    hanmen.month = month;
    // 讓數值門檻成立（_lt 取門檻以下、_gt 取門檻以上），確認事件於該處境下可觸發。
    for (const [key, val] of Object.entries(e.when)) {
      const m = key.match(/^([a-z]+)_(lt|gt)$/);
      if (m && m[1] in hanmen.stats) hanmen.stats[m[1]] = m[2] === 'lt' ? val - 1 : val + 1;
    }
    assert.equal(isEligible(createInitialState(9), e, always), false, `${e.id} must not fire without origin`);
    const other = applyOrigin(createInitialState(9), 'dichangzi');
    other.month = month;
    assert.equal(isEligible(other, e, always), false, `${e.id} must not fire for dichangzi`);
    assert.equal(isEligible(hanmen, e, always), true, `${e.id} must fire for hanmen`);
  }
});

test('寒門崛起：每個選項都能由既有解析器處理（optionOpen 與效果鍵）', () => {
  const s = applyOrigin(createInitialState(9), 'hanmen');
  for (const e of originEventDefs('hanmen')) {
    for (const o of e.options) assert.equal(optionOpen(s, o), true, `${e.id}/${o.key}`);
  }
});

test('寒門崛起：同種子重現（事件池併入後，同一出身同種子結果一致）', () => {
  const pool = withOriginEvents(mainEvents, 'hanmen');
  assert.equal(pool.length, mainEvents.length + HANMEN_EVENTS.length);
  const a = runSimulation({ seed: 'hanmen-repro', months: 120, events: mainEvents, origin: 'hanmen' });
  const b = runSimulation({ seed: 'hanmen-repro', months: 120, events: mainEvents, origin: 'hanmen' });
  assert.deepEqual(a, b);
  const st = applyOrigin(createInitialState(3), 'hanmen');
  const p1 = pickEvent(st, pool, () => 0);
  const p2 = pickEvent(applyOrigin(createInitialState(3), 'hanmen'), pool, () => 0);
  assert.equal(p1?.id, p2?.id);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';
import { PREFECTURE_DEFS } from '../src/economy.js';

const base = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const war = JSON.parse(readFileSync(new URL('../data/events-war.json', import.meta.url), 'utf8')).events;

const WAR_IDS = Array.from({ length: 12 }, (_, i) => `E${573 + i}`);
const TONES = new Set(base.flatMap((e) => e.options.map((o) => o.tone)));
const EFFECT_KEYS = new Set([
  ...base.flatMap((e) => e.options.flatMap((o) => Object.keys(o.effects || {}))),
  'war', 'campaign',
]);
const WHEN_KEYS = new Set([
  'chance', 'every_years', 'months', 'policy', 'flag', 'consorts_gt', 'heirs_gt', 'tyranny_gt', 'tyranny_lt',
  'has_item', 'terrain_is', 'bond_with', 'prior_choice', 'official_trait', 'bonded_loyalty_lt', 'official_loyalty_lt',
  'agriculture_lt', 'treasury_lt', 'people_lt', 'charm_gt', 'treasury_gt', 'people_gt', 'power_gt',
  'armament_gt', 'armament_lt', 'military_gt', 'military_lt', 'literature_gt', 'literature_lt',
  'benevolence_lt', 'commerce_gt', 'heaven_lt', 'health_lt', 'prestige_lt',
]);
const PREFECTURES = new Set(PREFECTURE_DEFS.map((d) => d.id));

test('war events file holds exactly E573–E584, unique and not already in events.json', () => {
  assert.deepEqual(war.map((e) => e.id), WAR_IDS);
  const baseIds = new Set(base.map((e) => e.id));
  for (const id of WAR_IDS) assert.equal(baseIds.has(id), false, `${id} collides with events.json`);
});

test('each war event matches the events.json schema', () => {
  for (const e of war) {
    assert.equal(typeof e.name, 'string', e.id);
    assert.ok(e.name.length > 0, e.id);
    assert.equal(typeof e.speaker, 'string', e.id);
    assert.equal(typeof e.narrative, 'string', e.id);
    assert.ok(e.when && typeof e.when === 'object', e.id);
    for (const k of Object.keys(e.when)) assert.ok(WHEN_KEYS.has(k), `${e.id} unknown when key ${k}`);
    assert.ok(e.options.length >= 2 && e.options.length <= 4, `${e.id} option count`);
    e.options.forEach((o, i) => {
      assert.equal(o.key, 'ABCD'[i], `${e.id} option key order`);
      assert.equal(typeof o.label, 'string', e.id);
      assert.ok(TONES.has(o.tone), `${e.id} unknown tone ${o.tone}`);
      for (const k of Object.keys(o.effects)) assert.ok(EFFECT_KEYS.has(k), `${e.id} unknown effect ${k}`);
      if (o.effects.war) {
        const w = o.effects.war;
        assert.ok(PREFECTURES.has(w.prefecture), `${e.id} unknown prefecture ${w.prefecture}`);
        assert.equal(typeof w.strength, 'number', e.id);
        assert.ok(w.reward && w.loss, `${e.id} war spec needs reward and loss`);
      }
    });
  }
});

test('the twelve events cover the four unit types and four famous generals', () => {
  const text = war.map((e) => e.name + e.narrative).join('');
  for (const unit of ['騎', '盾', '弓', '槍']) assert.ok(text.includes(unit), `missing unit ${unit}`);
  for (const general of ['霍去病', '岳飛', '李廣', '呂布']) {
    assert.ok(war.some((e) => e.name.includes(general)), `missing general ${general}`);
  }
});

// 完整驗證（200 seeds × 40 年）已於 PR 說明中記錄；此處以確定性的 40 seeds × 40 年做快速守門，
// 確認每則戰爭事件至少在一局中觸發。
test('every war event is reachable in a fixed 40-seed, 40-year sample', () => {
  const events = [...base, ...war];
  const seen = new Set();
  for (let s = 1; s <= 40; s++) {
    const r = runSimulation({ seed: `war-reach-${s}`, months: 40 * 12, events });
    for (const x of r.log ?? []) if (WAR_IDS.includes(x.event)) seen.add(x.event);
  }
  for (const id of WAR_IDS) assert.ok(seen.has(id), `${id} never fired in the sample`);
});

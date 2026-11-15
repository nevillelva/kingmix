import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, BOUNDS } from '../src/state.js';
import { monthlyTick } from '../src/turn.js';
import {
  TAX_TIERS, TAX_EFFECTS, PREFECTURE_DEFS, setTaxTier, tickEconomy,
  createPrefectures, administrativeEfficiency, ensureEconomy, VACANT_YIELD,
} from '../src/economy.js';

test('default tax tier is 中 and its effect is empty (neutral)', () => {
  const s = createInitialState('t');
  assert.equal(ensureEconomy(s).tax, '中');
  assert.deepEqual(TAX_EFFECTS['中'], {});
  const before = { ...s.stats };
  tickEconomy(s);
  assert.deepEqual(s.stats, before);
});

test('setTaxTier validates the tier and rejects unknown values', () => {
  const s = createInitialState('t');
  assert.deepEqual(TAX_TIERS, ['低', '中', '高']);
  setTaxTier(s, '低');
  assert.equal(s.economy.tax, '低');
  assert.throws(() => setTaxTier(s, '極高'), /unknown tax tier/);
  assert.equal(s.economy.tax, '低');
});

test('低 tax raises people and lowers treasury each month', () => {
  const s = createInitialState('t');
  const people = s.stats.people;
  const treasury = s.stats.treasury;
  setTaxTier(s, '低');
  tickEconomy(s);
  assert.ok(s.stats.people > people, 'people should rise under 低');
  assert.ok(s.stats.treasury < treasury, 'treasury should fall under 低');
});

test('高 tax raises treasury and lowers people each month', () => {
  const s = createInitialState('t');
  const people = s.stats.people;
  const treasury = s.stats.treasury;
  setTaxTier(s, '高');
  tickEconomy(s);
  assert.ok(s.stats.treasury > treasury, 'treasury should rise under 高');
  assert.ok(s.stats.people < people, 'people should fall under 高');
});

test('tax effects are scaled by administrative efficiency (balanced factions = 0.9)', () => {
  const s = createInitialState('t');
  assert.equal(administrativeEfficiency(s), 0.9);
  setTaxTier(s, '高');
  tickEconomy(s);
  assert.equal(s.stats.treasury, 500 + TAX_EFFECTS['高'].treasury * 0.9);
  const skewed = createInitialState('t');
  skewed.factions = { qingliu: 60, xunggui: 20, hanmen: 20 };
  assert.equal(administrativeEfficiency(skewed), 1);
});

test('tax tier effects keep every stat within its bounds over many months', () => {
  for (const tier of ['低', '高']) {
    const s = createInitialState('bounds');
    setTaxTier(s, tier);
    for (let m = 0; m < 240; m++) {
      monthlyTick(s);
      s.turn += 1;
    }
    for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
      assert.ok(s.stats[k] >= lo && s.stats[k] <= hi, `${tier}: ${k}=${s.stats[k]}`);
    }
  }
});

test('six prefectures, each with a character and a governor', () => {
  assert.equal(PREFECTURE_DEFS.length, 6);
  assert.equal(new Set(PREFECTURE_DEFS.map((p) => p.id)).size, 6);
  for (const p of PREFECTURE_DEFS) assert.ok(['farming', 'trade'].includes(p.character));
  const s = createInitialState('t');
  // 開局即建立六府，知府併入官員名單（同一人、同一官職）
  assert.equal(s.prefectures.length, 6);
  tickEconomy(s);
  assert.equal(s.prefectures.length, 6);
  assert.ok(s.prefectures.every((p) => p.governor.name && p.governor.abilities.politics >= 40));
  for (const p of s.prefectures) {
    const gov = s.officials.find((o) => o.office === `prefect:${p.id}`);
    assert.ok(gov, `${p.id} has a governor on the official list`);
    assert.equal(gov.name, p.governor.name);
  }
});

test('governors are officials: six of them, one per prefecture, and all appointable', () => {
  const s = createInitialState('gov-list');
  const govs = s.officials.filter((o) => o.prefecture);
  assert.equal(govs.length, 6);
  assert.equal(new Set(govs.map((o) => o.office)).size, 6);
  for (const o of govs) {
    assert.ok(o.traits && o.traits.length >= 2, 'governors carry traits like other officials');
    assert.ok(typeof o.personName === 'string' && o.personName === o.name);
  }
  // 知府不是朝臣：不被「忠誠最低」類事件選中
  assert.ok(s.officials.filter((o) => !o.prefecture).length === 4);
});

test('a vacant prefecture yields at the vacancy rate; an appointed governor restores the normal yield', () => {
  const s = createInitialState('vacancy');
  const holder = s.officials.find((o) => o.office === 'prefect:hedong');
  holder.office = null;
  tickEconomy(s);
  const hedong = s.prefectures.find((p) => p.id === 'hedong');
  assert.equal(hedong.yield, VACANT_YIELD);
  assert.equal(hedong.governor, null);
  holder.office = 'prefect:hedong';
  tickEconomy(s);
  assert.equal(hedong.yield, Math.round((holder.abilities.politics / 40) * 100) / 100);
});

test('governors are deterministic per seed and differ across seeds', () => {
  const a = createPrefectures('seed-a').map((p) => p.governor);
  const b = createPrefectures('seed-a').map((p) => p.governor);
  const c = createPrefectures('seed-b').map((p) => p.governor);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

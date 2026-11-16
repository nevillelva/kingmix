import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import {
  diplomacyOf, investNeighbor, tickVassalTribute, openTrade, tickTrade, diplomacyAction, canDiplomacy,
  INVEST_COST, INVEST_ATTITUDE, TRADE_OPEN_COST, TRADE_HORSE_MONTHS, TRADE_ITEM, TRIBUTE_GAIN, TRIBUTE_MIN_ATTITUDE,
} from '../src/diplomacy.js';
import { startCampaign, payPeaceTribute, PEACE_TRIBUTE_COST } from '../src/campaign.js';
import { hasItem, ITEMS, addItem } from '../src/items.js';

const fresh = (seed = 'dx') => createInitialState(seed);

test('investiture is one-time, costs treasury, and lifts attitude', () => {
  const s = fresh();
  diplomacyOf(s).east.attitude = 60;
  s.stats.treasury = INVEST_COST + 5;
  const before = diplomacyOf(s).east.attitude;
  assert.equal(investNeighbor(s, 'east').ok, true);
  assert.equal(s.stats.treasury, 5);
  assert.equal(diplomacyOf(s).east.attitude, Math.min(100, before + INVEST_ATTITUDE));
  assert.equal(diplomacyOf(s).east.invested, true);
  assert.equal(investNeighbor(s, 'east').reason, 'already');
});

test('investiture is gated by attitude, treasury and an active war with that neighbor', () => {
  const s = fresh();
  diplomacyOf(s).north.attitude = TRIBUTE_MIN_ATTITUDE - 1;
  s.stats.treasury = 999;
  assert.equal(investNeighbor(s, 'north').reason, 'attitude');
  diplomacyOf(s).north.attitude = 80;
  s.stats.treasury = INVEST_COST - 1;
  assert.equal(investNeighbor(s, 'north').reason, 'treasury');
  s.stats.treasury = 999;
  startCampaign(s, { strength: 100, reward: {}, loss: {} }, { neighborId: 'north' });
  assert.equal(investNeighbor(s, 'north').reason, 'war');
});

test('invested vassals pay the tribute once per year through acceptTribute', () => {
  const s = fresh();
  diplomacyOf(s).east.attitude = 70;
  diplomacyOf(s).east.invested = true;
  s.year = 5;
  const t0 = s.stats.treasury;
  tickVassalTribute(s);
  assert.equal(s.stats.treasury, t0 + TRIBUTE_GAIN);
  tickVassalTribute(s); // 同年再呼叫不再結算
  assert.equal(s.stats.treasury, t0 + TRIBUTE_GAIN);
  s.year = 6;
  tickVassalTribute(s);
  assert.equal(s.stats.treasury, t0 + 2 * TRIBUTE_GAIN);
});

test('trade gives a monthly treasury gain and a horse on the cycle when attitude is high', () => {
  const s = fresh();
  diplomacyOf(s).south.attitude = 70;
  s.stats.treasury = TRADE_OPEN_COST + 50;
  assert.equal(openTrade(s, 'south').ok, true);
  assert.equal(s.stats.treasury, 50);
  let horses = 0;
  for (let m = 0; m < TRADE_HORSE_MONTHS; m++) horses += tickTrade(s).filter((i) => i === TRADE_ITEM).length;
  assert.equal(s.stats.treasury, 50 + TRADE_HORSE_MONTHS);
  assert.equal(horses, 1);
});

test('no horse when attitude is below the trade threshold', () => {
  const s = fresh();
  diplomacyOf(s).south.attitude = 45;
  s.stats.treasury = 100;
  openTrade(s, 'south');
  let horses = 0;
  for (let m = 0; m < TRADE_HORSE_MONTHS * 2; m++) horses += tickTrade(s).length;
  assert.equal(horses, 0);
});

test('a neighbor at war does not trade', () => {
  const s = fresh();
  diplomacyOf(s).west.attitude = 70;
  diplomacyOf(s).west.trade = true;
  s.stats.treasury = 100;
  startCampaign(s, { strength: 50, reward: {}, loss: {} }, { neighborId: 'west' });
  tickTrade(s);
  assert.equal(s.stats.treasury, 100);
});

test('peace tribute ends an active neighbor campaign by the existing peace outcome and costs treasury', () => {
  const s = fresh();
  s.stats.treasury = 500;
  assert.equal(payPeaceTribute(s).reason, 'inactive');
  startCampaign(s, { strength: 50, reward: {}, loss: {} }, { neighborId: 'north' });
  s.stats.treasury = PEACE_TRIBUTE_COST - 1;
  assert.equal(payPeaceTribute(s).reason, 'treasury');
  s.stats.treasury = 200;
  const r = payPeaceTribute(s, () => {}); // 不套用獎懲，單獨檢驗花費
  assert.equal(r.ok, true);
  assert.equal(r.finished.outcome, 'peace');
  assert.equal(s.stats.treasury, 200 - PEACE_TRIBUTE_COST);
  assert.equal(s.campaign, null);
});

test('default state (no player diplomacy) is left untouched by the monthly hooks', () => {
  const s = fresh();
  const before = structuredClone(s);
  assert.deepEqual(tickVassalTribute(s), []);
  assert.deepEqual(tickTrade(s), []);
  assert.deepEqual(s, before);
});

test('horse is a catalogued item that can be added to inventory', () => {
  assert.ok(ITEMS.some((i) => i.id === TRADE_ITEM));
  const s = fresh();
  addItem(s, TRADE_ITEM);
  assert.equal(hasItem(s, TRADE_ITEM), true);
});

test('dispatch: invest and trade are reachable through diplomacyAction and canDiplomacy', () => {
  const s = fresh();
  diplomacyOf(s).east.attitude = 70;
  s.stats.treasury = 500;
  assert.equal(canDiplomacy(s, 'invest', 'east'), true);
  assert.equal(diplomacyAction(s, 'invest', 'east').ok, true);
  assert.equal(canDiplomacy(s, 'invest', 'east'), false);
  assert.equal(diplomacyAction(s, 'trade', 'east').ok, true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { OFFICES, assignOffice, dismissOffice, officeHolder } from '../src/offices.js';
import { tickEconomy, VACANT_YIELD, PREFECTURE_DEFS, prefectOfficeKey } from '../src/economy.js';
import { lowestLoyaltyOfficial, removeOfficial } from '../src/turn.js';

test('each of the six prefectures has its own appointable prefect office', () => {
  for (const def of PREFECTURE_DEFS) assert.ok(OFFICES[prefectOfficeKey(def.id)], def.id);
  assert.equal(OFFICES.prefect, undefined, 'the single generic 知府 office is replaced by per-prefecture offices');
});

test('the six governors sit on the official list in their prefecture office', () => {
  const s = createInitialState('gov-visible');
  for (const def of PREFECTURE_DEFS) {
    const holder = officeHolder(s, prefectOfficeKey(def.id));
    assert.ok(holder, def.id);
    assert.equal(holder.prefecture, def.id);
  }
});

test('dismissing a governor leaves the prefecture vacant until someone is appointed', () => {
  const s = createInitialState('gov-dismiss');
  const gov = dismissOffice(s, 'prefect:yangzhou');
  assert.equal(gov.prefecture, 'yangzhou');
  tickEconomy(s);
  assert.equal(s.prefectures.find((p) => p.id === 'yangzhou').yield, VACANT_YIELD);
  assert.equal(s.prefectures.find((p) => p.id === 'yangzhou').governor, null);
});

test('a court official can be appointed prefect, displacing the previous governor', () => {
  const s = createInitialState('gov-appoint');
  const before = officeHolder(s, 'prefect:denglai');
  assignOffice(s, 'o4', 'prefect:denglai');
  assert.equal(officeHolder(s, 'prefect:denglai').id, 'o4');
  assert.equal(before.office, null);
});

test('governors are not counted as the court for loyalty-targeted events', () => {
  const s = createInitialState('gov-court');
  for (const o of s.officials) if (o.prefecture) o.loyalty = 1;
  const target = lowestLoyaltyOfficial(s.officials);
  assert.equal(target.prefecture, undefined);
  assert.equal(target.id, 'o3');
});

test('removing a governor as a court official is not a court removal, but still vacates the office', () => {
  const s = createInitialState('gov-remove');
  const gov = s.officials.find((o) => o.id === 'gov_hedong');
  removeOfficial(s, gov);
  assert.equal(officeHolder(s, 'prefect:hedong'), null);
});

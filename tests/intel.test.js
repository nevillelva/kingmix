import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { intelReports, prepareIntel, hasChannel, INTEL_DOMAIN } from '../src/intel.js';
import { DEFIANT_MONTHS } from '../src/late-pressure.js';
import { isCourtOfficial } from '../src/officials.js';

function base() {
  const s = createInitialState('intel-test');
  s.year = 3;
  s.month = 2;
  return s;
}

function openCase(s) {
  s.dongchang.cases.push({ id: 'DCx', officialId: 'o0', startedTurn: 0, status: 'investigating', level: 0, outcome: null });
}

function bondCourt(s, domainValue = 60, key = 'politics') {
  const o = s.officials.find(isCourtOfficial);
  s.bonds = s.bonds || { shared: {}, unlocked: {} };
  s.bonds.unlocked[o.id] = true;
  o.abilities[key] = domainValue;
  return o;
}

test('intelReports is a pure read: state is unchanged after the call', () => {
  const s = base();
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  s.latePressure = { minister: null, ministerMonths: 11, disasters: [] };
  openCase(s);
  const before = structuredClone(s);
  const reports = intelReports(s);
  assert.ok(reports.length >= 2);
  assert.deepEqual(s, before);
});

test('a warning appears only when a channel exists (open case or bonded official in the domain)', () => {
  const s = base();
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  assert.equal(intelReports(s).length, 0, 'no channel, no warning');
  assert.equal(hasChannel(s, INTEL_DOMAIN.defiant), false);

  const o = bondCourt(s, 30); // 能力不足，不成管道
  assert.equal(intelReports(s).length, 0);
  o.abilities.politics = 60;
  const rs = intelReports(s);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].kind, 'defiant');

  s.dongchang.cases = [];
  openCase(s);
  assert.equal(intelReports(s).length, 1, 'an open dongchang case is also a channel');
});

test('no warning before the approach window, and none for an autonomous prefecture', () => {
  const s = base();
  openCase(s);
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 10;
  assert.equal(intelReports(s).filter((r) => r.kind === 'defiant').length, 0);
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  s.prefectures[0].autonomous = true;
  assert.equal(intelReports(s).filter((r) => r.kind === 'defiant').length, 0);
});

test('minister, neighbor and unrest warnings come from existing counters', () => {
  const s = base();
  openCase(s);
  s.latePressure = { minister: null, ministerMonths: 10, disasters: [] };
  s.diplomacy = { north: { attitude: 5, allied: false, kin: 0 }, west: { attitude: 90, allied: true, kin: 0 }, south: { attitude: 50, allied: false, kin: 0 }, east: { attitude: 50, allied: false, kin: 0 } };
  s.prefectures[1].morale = 10;
  s.prefectures[1].defense = 10;
  const kinds = intelReports(s).map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['minister', 'unrest', 'war']);
});

test('prepareIntel records seen warnings and does not repeat them', () => {
  const s = base();
  openCase(s);
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  prepareIntel(s);
  assert.equal(s.intel.reports.length, 1);
  const key = s.intel.reports[0].key;
  assert.ok(s.intel.seen[key]);

  // 同月冪等
  const same = prepareIntel(s);
  assert.equal(same.reports.length, 1);

  // 下月條件仍成立：不再呈報
  s.month = 3;
  prepareIntel(s);
  assert.equal(s.intel.reports.length, 0);
  assert.ok(s.intel.seen[key], 'still remembered while the warning holds');
});

test('a warning that clears is forgotten, so a new episode is reported again', () => {
  const s = base();
  openCase(s);
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  prepareIntel(s);
  s.prefectures[0].defiantMonths = 0;
  s.month = 3;
  prepareIntel(s);
  assert.equal(s.intel.seen['defiant:' + s.prefectures[0].id], undefined);
  s.prefectures[0].defiantMonths = DEFIANT_MONTHS - 1;
  s.month = 4;
  prepareIntel(s);
  assert.equal(s.intel.reports.length, 1);
});

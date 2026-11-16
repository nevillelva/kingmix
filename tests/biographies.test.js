import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { selectBiographies, runKeyOf, biographiesForSeed, BIO_CAP, BIOGRAPHY_CAP } from '../src/biographies.js';
import { endFate, closeFatesAtEnd } from '../src/fates.js';
import {
  UNLOCK_RECORD_VERSION, readUnlockRecord, writeUnlockRecord, recordBiographies, recordEarnedTitles, emptyUnlockRecord,
} from '../src/unlocks.js';

function memStorage(initial = null) {
  let text = initial;
  return {
    getItem: () => text,
    setItem: (k, v) => { text = v; },
    get text() { return text; },
  };
}

function withFate(s, role, id, name, lines, extra = {}) {
  s.fates = s.fates || {};
  s.fates[`${role}:${id}`] = { arc: 'x', name, stage: lines.length, last: 0, ended: false, lines, ...extra };
}

test('cross-run record is version 2 and carries biographies', () => {
  assert.equal(UNLOCK_RECORD_VERSION, 2);
  assert.deepEqual(emptyUnlockRecord(), { version: 2, titles: [], biographies: [] });
});

test('v1 records migrate to v2 with an empty biography list, keeping titles', () => {
  const storage = memStorage(JSON.stringify({ version: 1, titles: ['博士'] }));
  const { record, readOnly } = readUnlockRecord(storage, 'k');
  assert.equal(readOnly, false);
  assert.equal(record.version, 2);
  assert.deepEqual(record.titles, ['博士']);
  assert.deepEqual(record.biographies, []);
});

test('a version-less legacy record is also migrated', () => {
  const storage = memStorage(JSON.stringify({ titles: ['鴻儒'] }));
  const { record } = readUnlockRecord(storage, 'k');
  assert.equal(record.version, 2);
  assert.deepEqual(record.titles, ['鴻儒']);
  assert.deepEqual(record.biographies, []);
});

test('a newer record version stays read-only', () => {
  const storage = memStorage(JSON.stringify({ version: 3, titles: [] }));
  assert.equal(readUnlockRecord(storage, 'k').readOnly, true);
});

test('write failure returns false and never throws', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => {
    assert.equal(writeUnlockRecord(broken, 'k', emptyUnlockRecord()), false);
  });
  const ok = memStorage();
  assert.equal(writeUnlockRecord(ok, 'k', emptyUnlockRecord()), true);
});

test('selection is capped at BIO_CAP per run', () => {
  const s = createInitialState('cap');
  s.consorts = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, favor: 80 + i }));
  for (const c of s.consorts) withFate(s, 'consort', c.id, c.id, ['一段']);
  s.bonds = { shared: {}, unlocked: {} };
  for (const o of s.officials.slice(0, 4)) {
    s.bonds.unlocked[o.id] = true;
    withFate(s, 'official', o.id, o.name, ['相得段']);
  }
  assert.ok(selectBiographies(s).length <= BIO_CAP);
  assert.equal(selectBiographies(s).length, BIO_CAP);
});

test('entries come from the fate records (lines and end line), not from the chronicle', () => {
  const s = createInitialState('src');
  s.chronicle = [];
  s.bonds = { shared: {}, unlocked: {} };
  const o = s.officials[0];
  s.bonds.unlocked[o.id] = true;
  withFate(s, 'official', o.id, '甲', ['第一段', '第二段'], { endCause: 'survived', endLine: '善終。' });
  const [bio] = selectBiographies(s);
  assert.equal(bio.tag, 'bonded');
  assert.equal(bio.name, '甲');
  assert.deepEqual(bio.lines, ['第一段', '第二段']);
  assert.equal(bio.endLine, '善終。');
});

test('endFate records the end cause and line on the fate record', () => {
  const s = createInitialState('end');
  s.fates = s.fates || {};
  s.fates['official:o1'] = { arc: 'qingliu', name: '乙', stage: 1, last: 0, ended: false, lines: ['段'] };
  endFate(s, 'official', 'o1', 'remonstrance');
  assert.equal(s.fates['official:o1'].endCause, 'remonstrance');
  assert.equal(typeof s.fates['official:o1'].endLine, 'string');
  const [bio] = selectBiographies({ ...s, bonds: { shared: {}, unlocked: {} } });
  assert.equal(bio.tag, 'remonstrance');
});

test('recordBiographies writes only at dynasty end, once per run, and keeps titles', () => {
  const s = createInitialState('run1');
  s.bonds = { shared: {}, unlocked: {} };
  const o = s.officials[0];
  s.bonds.unlocked[o.id] = true;
  withFate(s, 'official', o.id, '丙', ['段']);

  const base = { version: 2, titles: ['博士'], biographies: [] };
  assert.deepEqual(recordBiographies(base, s).biographies, [], 'not ended yet');

  s.dynasty.ended = true;
  closeFatesAtEnd(s);
  const once = recordBiographies(base, s);
  assert.equal(once.biographies.length, 1);
  assert.equal(once.biographies[0].runKey, runKeyOf(s));
  assert.deepEqual(once.titles, ['博士']);

  const twice = recordBiographies(once, s);
  assert.equal(twice.biographies.length, 1, 'same run is not written twice');
});

test('recordEarnedTitles keeps the biography list', () => {
  const rec = { version: 2, titles: [], biographies: [{ runKey: 'a:1', name: 'n', tag: 't', lines: [], endLine: null, role: 'official', id: 'x', year: 1 }] };
  const s = createInitialState('keep');
  assert.equal(recordEarnedTitles(rec, s).biographies.length, 1);
});

test('biography list is capped across runs', () => {
  const big = { version: 2, titles: [], biographies: Array.from({ length: BIOGRAPHY_CAP + 5 }, (_, i) => ({ runKey: `r${i}:1`, name: 'n', tag: 't', lines: [], endLine: null, role: '', id: null, year: 1 })) };
  const s = createInitialState('cap2');
  s.dynasty.ended = true;
  s.bonds = { shared: {}, unlocked: {} };
  const out = recordBiographies(big, s);
  assert.ok(out.biographies.length <= BIOGRAPHY_CAP);
});

test('legacy rows can look up their run biographies by seed', () => {
  const rec = { version: 2, titles: [], biographies: [
    { runKey: 'alpha:1', name: 'a', tag: 'bonded', lines: [], endLine: null, role: 'official', id: 'x', year: 1 },
    { runKey: 'beta:1', name: 'b', tag: 'bonded', lines: [], endLine: null, role: 'official', id: 'y', year: 1 },
  ] };
  assert.deepEqual(biographiesForSeed(rec, 'alpha').map((b) => b.name), ['a']);
  assert.deepEqual(biographiesForSeed(undefined, 'alpha'), []);
});

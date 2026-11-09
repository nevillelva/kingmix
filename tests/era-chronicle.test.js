import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { advanceMonth } from '../src/turn.js';
import { changeEra, migrateEraLog, eraChronicleEntry } from '../src/era.js';

test('changeEra writes an era entry into state.chronicle with the chronicle fields', () => {
  const s = createInitialState('ec-write');
  s.year = 4; s.month = 9;
  assert.equal(changeEra(s, '景運').ok, true);
  assert.equal(s.chronicle.length, 1);
  const e = s.chronicle[0];
  assert.equal(e.kind, 'era');
  assert.equal(e.year, 4);
  assert.equal(e.month, 9);
  assert.equal(e.from, '永和');
  assert.equal(e.to, '景運');
  assert.equal(e.text, '改元為景運，於 4 年 9 月');
  assert.deepEqual(s.era.log, []);
});

test('era entries have no generation field and do not look like succession entries', () => {
  const e = eraChronicleEntry({ year: 2, month: 1, from: '永和', to: '承平' });
  assert.equal(e.generation, undefined);
  assert.equal(e.endedInYear, undefined);
  assert.equal(e.kind, 'era');
});

test('migrateEraLog moves legacy era.log entries into chronicle and empties the log', () => {
  const s = createInitialState('ec-mig');
  s.chronicle.push({ generation: 1, endedInYear: 10, age: 60, endReason: 'death', wars: 2 });
  s.era.log = [
    { year: 2, month: 3, from: '永和', to: '承平', kind: 'change' },
    { year: 5, month: 7, from: '承平', to: '景運', kind: 'change' },
  ];
  assert.equal(migrateEraLog(s), 2);
  assert.equal(s.chronicle.length, 3);
  assert.equal(s.chronicle[1].kind, 'era');
  assert.equal(s.chronicle[1].text, '改元為承平，於 2 年 3 月');
  assert.equal(s.chronicle[2].text, '改元為景運，於 5 年 7 月');
  assert.deepEqual(s.era.log, []);
  // 冪等：再次遷移不重複寫入
  assert.equal(migrateEraLog(s), 0);
  assert.equal(s.chronicle.length, 3);
});

test('migrateEraLog tolerates saves without era.log or era', () => {
  const s = createInitialState('ec-old');
  delete s.era;
  s.chronicle = undefined;
  assert.equal(migrateEraLog(s), 0);
  assert.deepEqual(s.chronicle, []);
  assert.equal(migrateEraLog(null), 0);
});

test('a fresh game with the default era does not write to chronicle', () => {
  const s = createInitialState('ec-open', { era: '景運' });
  assert.equal(s.chronicle.length, 0);
  assert.equal(s.era.name, '景運');
  assert.deepEqual(s.era.log, []);
  const d = createInitialState('ec-open2');
  assert.equal(d.chronicle.length, 0);
});

test('opening a game and advancing months leaves chronicle empty when no era change is made', () => {
  const s = createInitialState('ec-open3', { era: '寧康' });
  for (let i = 0; i < 12 && s.alive; i++) advanceMonth(s);
  assert.equal(s.chronicle.filter((c) => c.kind === 'era').length, 0);
});

test('era module source still never imports the RNG', () => {
  const src = readFileSync(new URL('../src/era.js', import.meta.url), 'utf8');
  assert.equal(/import[^\n]*rng/i.test(src), false);
});

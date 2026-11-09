import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { TRAITS } from '../src/people.js';
import { optionOpen } from '../src/events.js';
import { runSimulation } from '../src/sim.js';

const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;
const traitOptions = events.flatMap((e) => e.options.filter((o) => o.when?.official_trait).map((o) => ({ event: e.id, key: o.key, trait: o.when.official_trait })));

test('every one of the 16 traits is used by at least one event option', () => {
  const used = new Set(traitOptions.map((o) => o.trait));
  const missing = TRAITS.map((t) => t.id).filter((id) => !used.has(id));
  assert.deepEqual(missing, []);
});

test('trait-conditioned options number at least 12 beyond the original E901–E903 set', () => {
  const original = traitOptions.filter((o) => o.event.startsWith('E9'));
  assert.equal(original.length, 3);
  assert.ok(traitOptions.length - original.length >= 12, `only ${traitOptions.length - original.length} added`);
});

test('a trait-conditioned option is hidden unless someone on the official list holds the trait', () => {
  const s = createInitialState('trait-gate');
  s.officials.forEach((o) => { o.traits = []; });
  const opt = events.find((e) => e.id === 'E028').options.find((o) => o.when?.official_trait === 'loyal');
  assert.equal(optionOpen(s, opt), false);
  s.officials[0].traits = ['loyal'];
  assert.equal(optionOpen(s, opt), true);
});

test('unconditioned original options are always open (existing behaviour)', () => {
  const s = createInitialState('trait-plain');
  const plain = events.find((e) => e.id === 'E028').options.find((o) => o.key === 'A');
  assert.equal(optionOpen(s, plain), true);
});

test('trait options actually get chosen in headless runs', () => {
  const picked = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const r = runSimulation({ seed: `trait-pick-${seed}`, months: 600, events });
    for (const l of r.log) {
      const e = events.find((x) => x.id === l.event);
      const o = e?.options.find((x) => x.key === l.option);
      if (o?.when?.official_trait) picked.add(o.when.official_trait);
    }
  }
  assert.ok(picked.size >= 8, `only ${picked.size} trait options were ever chosen`);
});

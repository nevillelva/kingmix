import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSimulation } from '../src/sim.js';
import { createInitialState } from '../src/state.js';
import {
  NEIGHBORS, ALLIANCE_MIN_ATTITUDE, diplomacyOf, diplomacyAction, monthlyDrift,
} from '../src/diplomacy.js';
import { PREFECTURE_DEFS, prefectOfficeKey } from '../src/economy.js';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const events = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8')).events;

// ---- 結盟可達：好感的漂移中心為 50，結盟門檻取 50，使好感達標成為常態 ----

test('alliance threshold sits on the drift centre (50), so an ordinary neighbor can ally', () => {
  assert.equal(ALLIANCE_MIN_ATTITUDE, 50);
  const s = createInitialState('ally-centre');
  diplomacyOf(s).north.attitude = 50;
  assert.equal(diplomacyAction(s, 'ally', 'north').ok, true);
});

test('monthly drift pulls attitude toward 50, so it keeps returning to the alliance threshold', () => {
  const s = createInitialState('ally-drift');
  for (const n of NEIGHBORS) diplomacyOf(s)[n.id].attitude = 80;
  for (let m = 0; m < 60; m++) monthlyDrift(s, 1000, m + 1);
  for (const n of NEIGHBORS) {
    const a = diplomacyOf(s)[n.id].attitude;
    assert.ok(Math.abs(a - 50) <= 3, `${n.id} settles near 50, got ${a}`);
  }
});

test('headless sim forms at least 15 alliances over 200 seeds', () => {
  let ok = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = runSimulation({ seed: `big${seed}`, months: 600, events });
    ok += r.diplomacy?.ally?.ok ?? 0;
  }
  assert.ok(ok >= 15, `only ${ok} alliances in 200 seeds`);
});

// ---- 網頁顯示名稱：新效果鍵與官職鍵不外露原始字串 ----

// 從 web/index.html 取出純資料的物件字面值（EFFECT_EXTRA 與 EFFECT 的展開）。
function labelMap(name) {
  const m = html.match(new RegExp(`const ${name} = (\\{[^\\n]*\\});`));
  assert.ok(m, `${name} not found in web/index.html`);
  return new Function(`return ${m[1]};`)();
}

test('every effect key used by events has a Chinese display label in the web UI', () => {
  const extra = labelMap('EFFECT_EXTRA');
  const stats = html.match(/const EFFECT = \{ \.\.\.EFFECT_EXTRA, ([^}]*)\};/);
  assert.ok(stats, 'EFFECT table not found');
  const effect = { ...extra, ...new Function(`return {${stats[1]}};`)() };
  const AFTER = ['chain', 'shared_event']; // 與 turn.js 的 AFTER_OPTION_KEYS 相同，不顯示為選項效果
  const keys = new Set();
  for (const e of events) for (const o of e.options || []) for (const k of Object.keys(o.effects || {})) keys.add(k);
  for (const k of keys) {
    if (AFTER.includes(k)) continue;
    assert.ok(effect[k], `effect key "${k}" has no display label`);
  }
  assert.equal(effect.diplomacy, '外交');
  assert.equal(effect.campaign, '戰役進度');
});

test('diplomacy routes and prefect offices have Chinese names', () => {
  const diplo = labelMap('DIPLO_LABEL');
  assert.deepEqual(Object.values(diplo).sort(), ['刺探', '宣戰', '朝貢', '結盟', '聯姻']);
  const src = html.match(/function officeName\(k\)\{[\s\S]*?\n\}/)[0];
  const OFFICE = labelMap('OFFICE');
  const officeName = new Function('OFFICE', 'PREFECTURE_DEFS', `${src}\nreturn officeName;`)(OFFICE, PREFECTURE_DEFS);
  assert.equal(officeName('chancellor'), '丞相');
  for (const d of PREFECTURE_DEFS) {
    assert.equal(officeName(prefectOfficeKey(d.id)), `${d.name}知府`);
  }
  assert.equal(officeName('prefect:unknown'), '知府');
  assert.equal(officeName('no-such-key'), '閒置');
});

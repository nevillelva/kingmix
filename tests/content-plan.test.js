import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phase 7 內容計畫：奏摺敘事、時令（每月一則）、類別數量下限、連鎖後續 8 條。
const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const memorials = events.filter((e) => e.kind !== 'assassination');
const byId = new Map(events.map((e) => [e.id, e]));

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `E${String(a + i).padStart(3, '0')}`);

// 類別對照（未列入者歸「朝政」）。目標數量來自方案：朝政 60、後宮與子嗣 40、東廠與派系 30、
// 軍事外交 30、天象民生 20、時令 12、連鎖後續 8（合計 200）。
const CATEGORY_IDS = {
  連鎖後續: range(201, 208),
  時令: ['E006', ...range(194, 200), ...range(209, 213)],
  後宮與子嗣: ['E008','E010','E014','E015','E019','E021','E026','E033','E040','E045','E050','E055','E061','E075','E076','E120','E121','E122','E123','E124','E125','E126','E127','E128','E129','E130','E131','E132','E133','E134','E135','E136','E137','E138','E139','E140','E141','E142','E143','E144','E163'],
  東廠與派系: ['E004','E027','E038','E117','E145','E146','E147','E148','E149','E150','E151','E152','E153','E154','E155','E156','E157','E158','E159','E160','E161','E162','E305','E306', ...range(307, 312)],
  軍事外交: ['E005','E011','E012','E013','E020','E028','E029','E036','E042','E047','E057','E063','E070','E074','E078','E079','E106','E164','E165','E166','E167','E168','E169','E170','E171','E172','E173','E174','E175','E176','E177','E178','E179','E180','E181'],
  天象民生: ['E001','E003','E007','E016','E018','E022','E024','E032','E037','E041','E051','E054','E064','E065','E072','E081','E090','E094','E097','E107','E108','E110','E119','E182','E183','E184','E185','E186','E187','E188','E189','E190','E191','E192','E193'],
};
const TARGET = { 朝政: 60, 後宮與子嗣: 40, 東廠與派系: 30, 軍事外交: 30, 天象民生: 20, 時令: 12, 連鎖後續: 8 };

test('every memorial has a 40–80 character narrative and a speaker', () => {
  for (const e of memorials) {
    const n = [...(e.narrative || '')].length;
    assert.ok(n >= 40 && n <= 80, `${e.id} narrative is ${n} characters`);
    assert.ok(e.speaker && e.speaker.length > 0, `${e.id} needs a speaker`);
  }
});

test('the category table covers real events without duplicates', () => {
  const seen = new Map();
  for (const [cat, ids] of Object.entries(CATEGORY_IDS)) {
    for (const id of ids) {
      assert.ok(byId.has(id), `${id} (${cat}) must exist`);
      assert.ok(!seen.has(id), `${id} listed under both ${seen.get(id)} and ${cat}`);
      seen.set(id, cat);
    }
  }
});

test('each plan category meets its target count', () => {
  const counts = Object.fromEntries(Object.keys(TARGET).map((k) => [k, 0]));
  for (const e of memorials) {
    const cat = [...Object.entries(CATEGORY_IDS)].find(([, ids]) => ids.includes(e.id))?.[0] ?? '朝政';
    counts[cat]++;
  }
  for (const [cat, target] of Object.entries(TARGET)) {
    assert.ok(counts[cat] >= target, `${cat} has ${counts[cat]}, target ${target}`);
  }
});

test('seasonal festivals: exactly one fixed (single-month) festival per month, 1 through 12', () => {
  const festivalIds = [...range(194, 200), ...range(209, 213)];
  const months = festivalIds.map((id) => {
    const w = byId.get(id).when;
    assert.ok(Array.isArray(w.months) && w.months.length === 1, `${id} must be pinned to one month`);
    return w.months[0];
  });
  assert.deepEqual([...months].sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
});

// 階段 C 新增危機奏摺鏈：10 條（後續為 E914–E923），與原 8 條（E201–E208）合計 18 條。
const CRISIS_FOLLOWUPS = range(914, 923);
test('chain follow-ups: 18 chain links (8 original E201–E208 + 10 crisis E914–E923), each pointing at an existing follow-up', () => {
  const links = [];
  for (const e of events) for (const o of e.options) if (o.effects?.chain) links.push(o.effects.chain);
  assert.equal(links.length, 18);
  for (const id of links) assert.ok(byId.has(id), `chain target ${id} must exist`);
  assert.ok(links.every((id) => /^E20[1-8]$/.test(id) || CRISIS_FOLLOWUPS.includes(id)));
});

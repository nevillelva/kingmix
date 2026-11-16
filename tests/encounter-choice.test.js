// 微服輿情（二選一奇遇）：遭遇待決、嚴懲與安撫之效果、割據連動、待決持久化與存檔往返、側線關閉時不變。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { serializeSave, parseSave } from '../src/save.js';
import { ensureCity } from '../src/city.js';
import { ensureCapture } from '../src/city-capture.js';
import { governorOf } from '../src/economy.js';
import { tickAutonomy, DEFIANT_LOYALTY, DEFIANT_MONTHS } from '../src/late-pressure.js';
import { MORALE_MAX } from '../src/tour.js';
import {
  ENCOUNTERS, rollEncounter, tourWithEncounter, pendingEncounter, resolveEncounter,
  sideEventsEnabled,
} from '../src/side-events.js';
import { CHOICE_ENCOUNTERS, DEFIANT_PUSH, PUNISH_LOYALTY, PUNISH_MORALE, SOOTHE_COST, SOOTHE_MORALE } from '../src/encounter-data.js';

const fixed = () => ({ now: () => '2026-01-01T00:00:00.000Z' });

// 找出一個有知府在任的州府（避免依賴特定種子）。
function prefWithGovernor(s) {
  const pref = ensureCapture(s).find((p) => governorOf(s, p));
  assert.ok(pref, '需有知府在任的州府');
  return pref;
}

// 直接設定一筆待決奇遇（不經擲骰），便於逐項檢驗裁決效果。
function setPending(s, prefId, encounterId = 'corrupt') {
  s.sideEvents = { ...(s.sideEvents ?? { enabled: true, encounterMonth: -1, alchemyMonth: -1 }), pending: { encounterId, prefectureId: prefId, year: s.year, month: s.month } };
}

test('奇遇為三類二選一（貪官、豪強、流民），每類皆有嚴懲與安撫', () => {
  assert.deepEqual(CHOICE_ENCOUNTERS.map((e) => e.id).sort(), ['corrupt', 'magnate', 'refugee']);
  for (const e of CHOICE_ENCOUNTERS) {
    assert.ok(e.choices.punish && e.choices.soothe, `${e.id} 有兩個選項`);
    assert.doesNotMatch(JSON.stringify(e), /undefined/);
  }
});

test('遭遇奇遇時僅設為待決，待決期間不再擲奇遇（效果待裁決後才套用）', () => {
  let seed = null;
  for (let i = 0; i < 200 && !seed; i++) {
    const s = createInitialState(`choice-pend-${i}`);
    if (tourWithEncounter(s, 'hedong').encounter) seed = `choice-pend-${i}`;
  }
  assert.ok(seed, '需找到會遭遇奇遇的種子');
  const s = createInitialState(seed);
  const r = tourWithEncounter(s, 'hedong');
  assert.ok(r.encounter.choices);
  assert.equal(s.sideEvents.pending.prefectureId, 'hedong');
  assert.equal(pendingEncounter(s).id, r.encounter.id);
  s.month += 1;
  assert.equal(rollEncounter(s), null);
  assert.ok(pendingEncounter(s));
});

test('嚴懲：所至府民心上升、知府忠誠下降、離心月數推進；待決清除', () => {
  const s = createInitialState('choice-punish');
  const pref = prefWithGovernor(s);
  const gov = governorOf(s, pref);
  pref.morale = 50;
  gov.loyalty = 60;
  pref.defiantMonths = 2;
  setPending(s, pref.id, 'magnate');
  const r = resolveEncounter(s, 'punish');
  assert.equal(r.ok, true);
  assert.equal(pref.morale, 50 + PUNISH_MORALE);
  assert.equal(gov.loyalty, 60 + PUNISH_LOYALTY);
  assert.equal(pref.defiantMonths, 2 + DEFIANT_PUSH);
  assert.equal(s.sideEvents.pending, null);
  assert.equal(pendingEncounter(s), null);
});

test('安撫：耗國庫，民心小升，知府忠誠與離心月數不變', () => {
  const s = createInitialState('choice-soothe');
  const pref = prefWithGovernor(s);
  const gov = governorOf(s, pref);
  pref.morale = 50;
  gov.loyalty = 60;
  pref.defiantMonths = 2;
  s.stats.treasury = 100;
  setPending(s, pref.id, 'refugee');
  const r = resolveEncounter(s, 'soothe');
  assert.equal(r.ok, true);
  assert.equal(s.stats.treasury, 100 - SOOTHE_COST);
  assert.equal(pref.morale, 50 + SOOTHE_MORALE);
  assert.equal(gov.loyalty, 60);
  assert.equal(pref.defiantMonths, 2);
  assert.equal(s.sideEvents.pending, null);
});

test('安撫國庫不足：失敗時狀態不變，待決仍在', () => {
  const s = createInitialState('choice-poor');
  const pref = prefWithGovernor(s);
  s.stats.treasury = SOOTHE_COST - 1;
  setPending(s, pref.id);
  const before = JSON.stringify(s);
  assert.deepEqual(resolveEncounter(s, 'soothe'), { ok: false, reason: 'treasury' });
  assert.equal(JSON.stringify(s), before);
  assert.ok(pendingEncounter(s));
});

test('無待決或無此選項：裁決失敗且不改動狀態', () => {
  const s = createInitialState('choice-none');
  assert.deepEqual(resolveEncounter(s, 'punish'), { ok: false, reason: 'none' });
  setPending(s, prefWithGovernor(s).id);
  assert.deepEqual(resolveEncounter(s, 'bribe'), { ok: false, reason: 'no_choice' });
  assert.ok(pendingEncounter(s));
});

test('嚴懲可導致割據：離心月數推進至門檻後，下一次月結算即割據', () => {
  const s = createInitialState('choice-autonomy');
  const pref = prefWithGovernor(s);
  const gov = governorOf(s, pref);
  gov.loyalty = DEFIANT_LOYALTY - 2; // 已在離心線下
  pref.defiantMonths = DEFIANT_MONTHS - DEFIANT_PUSH;
  setPending(s, pref.id);
  resolveEncounter(s, 'punish');
  assert.ok(gov.loyalty < DEFIANT_LOYALTY);
  tickAutonomy(s);
  assert.equal(pref.autonomous, true);
  assert.ok(s.chronicle.some((c) => c.kind === 'autonomy' && c.prefecture === pref.id));
});

test('待決奇遇持久化：存檔往返後仍可裁決，且府民心等未於遭遇時套用', () => {
  const s = createInitialState('choice-save');
  const pref = prefWithGovernor(s);
  setPending(s, pref.id, 'corrupt');
  const restored = parseSave(JSON.stringify(serializeSave(s, fixed())));
  assert.equal(restored.ok, true);
  const p = pendingEncounter(restored.state);
  assert.equal(p.id, 'corrupt');
  assert.equal(p.prefectureId, pref.id);
  const r = resolveEncounter(restored.state, 'soothe');
  assert.equal(r.ok, true);
  assert.equal(restored.state.sideEvents.pending, null);
});

test('側線關閉：不擲奇遇、無待決，舊版奇遇表內容不變', () => {
  const s = createInitialState('choice-off');
  s.sideEvents = { enabled: false, encounterMonth: -1, alchemyMonth: -1 };
  const r = tourWithEncounter(s, 'hedong');
  assert.equal(r.ok, true);
  assert.equal(r.encounter, null);
  assert.equal(s.sideEvents.pending, undefined);
  assert.equal(sideEventsEnabled(s), false);
  assert.deepEqual(ENCOUNTERS.map((e) => e.id), ['farmer', 'scholar', 'bandit', 'merchant']);
  assert.equal(MORALE_MAX, 100);
});

// 對話框 HTML（web/ui/render-side.js）：替身 DOM 後動態匯入，與 curriculum-ui.test.js 相同做法。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}
test('奇遇對話框：二選一顯示嚴懲與安撫按鈕；舊式奇遇僅「知道了」', async () => {
  const { encounterHtml } = await import('../web/ui/render-side.js');
  const html = encounterHtml(CHOICE_ENCOUNTERS[0], '河東');
  assert.match(html, /data-dlg="punish"/);
  assert.match(html, /data-dlg="soothe"/);
  assert.match(html, /河東/);
  const legacy = encounterHtml(ENCOUNTERS[0], '河東');
  assert.match(legacy, /data-dlg="ok"/);
  assert.doesNotMatch(legacy, /data-dlg="punish"/);
});

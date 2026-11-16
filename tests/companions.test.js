// 伴讀與太傅（companions.js）：舉薦（耗午後行動）、季結算相得、登基派系增勢與相得解鎖、奪嫡評價加分、太傅派系權重與史冊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { applySchemaDefaults } from '../src/schema.js';
import { createHeir, tryAccession, successionScore, heirStrength, ADULT_AGE } from '../src/succession.js';
import { makeRng } from '../src/rng.js';
import { tickCurriculum, curriculumEntry } from '../src/curriculum.js';
import {
  recommendCompanion, companionOf, COMPANION_MIN_AGE, COMPANION_LOYALTY_GAIN,
  COMPANION_ASCEND_FACTION, COMPANION_RIVAL_WEIGHT,
} from '../src/companions.js';
import { BOND_THRESHOLD } from '../src/bonds.js';
import { periodSpent, spendSlot } from '../src/slots.js';
import { chronicleLine } from '../src/chronicle.js';
import { tutorGoodChance } from '../src/education.js';
import { isCourtOfficial } from '../src/officials.js';

function fresh(seed = 'companion-test') {
  const s = applySchemaDefaults(createInitialState(seed));
  s.chronicle = [];
  s.alive = true;
  s.year = 1;
  s.month = 1;
  return s;
}

function addHeir(s, age = 8) {
  const h = createHeir(s, makeRng(['companion-heir', s.heirs.length, age]), { gender: 'male', mother: null });
  h.age = age;
  return h;
}

const sponsorOf = (s) => s.officials.find(isCourtOfficial);

test('舉薦伴讀：六歲以上、在朝臣子、每位皇子僅一名；舉薦耗午後一次行動', () => {
  const s = fresh();
  const young = addHeir(s, COMPANION_MIN_AGE - 1);
  const h = addHeir(s, 8);
  const sp = sponsorOf(s);
  assert.deepEqual(recommendCompanion(s, young.id, sp.id), { ok: false, reason: 'too_young' });
  assert.deepEqual(recommendCompanion(s, h.id, 'nobody'), { ok: false, reason: 'no_sponsor' });
  assert.equal(companionOf(s, h.id), null);
  assert.deepEqual(recommendCompanion(s, h.id, sp.id), { ok: true });
  assert.deepEqual(companionOf(s, h.id), { sponsorId: sp.id, bond: 0 });
  assert.equal(s.agency.used, 1);
  assert.equal(periodSpent(s, 'afternoon'), 1);
  assert.deepEqual(recommendCompanion(s, h.id, sp.id), { ok: false, reason: 'has_companion' });
  assert.equal(s.agency.used, 1);
});

test('舉薦失敗於午後時段已用盡時：不改動狀態', () => {
  const s = fresh();
  const h = addHeir(s, 8);
  assert.equal(spendSlot(s, 'afternoon', 'audience').ok, true);
  const before = JSON.stringify(s.curriculum ?? null);
  assert.deepEqual(recommendCompanion(s, h.id, sponsorOf(s).id), { ok: false, reason: 'no_action' });
  assert.equal(JSON.stringify(s.curriculum ?? null), before);
});

test('季結算：伴讀 bond 僅於季考月增加；達門檻時舉薦人忠誠上升一次並寫入史冊；僅有伴讀未排課不計季考', () => {
  const s = fresh();
  const h = addHeir(s, 8);
  const sp = sponsorOf(s);
  sp.loyalty = 50;
  recommendCompanion(s, h.id, sp.id);
  s.month = 2;
  tickCurriculum(s);
  assert.equal(companionOf(s, h.id).bond, 0);
  for (const m of [3, 6]) { s.month = m; tickCurriculum(s); }
  assert.equal(companionOf(s, h.id).bond, BOND_THRESHOLD);
  assert.equal(sp.loyalty, 50 + COMPANION_LOYALTY_GAIN);
  assert.equal(s.chronicle.filter((c) => c.kind === 'companion_bond').length, 1);
  assert.equal(s.chronicle.filter((c) => c.kind === 'curriculum_term').length, 0);
  s.month = 9;
  tickCurriculum(s);
  assert.equal(companionOf(s, h.id).bond, BOND_THRESHOLD + 1);
  assert.equal(sp.loyalty, 50 + COMPANION_LOYALTY_GAIN);
});

test('登基：相得之舉薦人所屬派系增勢並解鎖相得；未相得者不變', () => {
  const s = fresh();
  const h = addHeir(s, ADULT_AGE);
  const sp = sponsorOf(s);
  s.factions[sp.faction] = 30;
  recommendCompanion(s, h.id, sp.id);
  companionOf(s, h.id).bond = BOND_THRESHOLD - 1;
  s.alive = false;
  s.dynasty.crownPrince = null;
  s.bonds.unlocked[sp.id] = undefined;
  assert.equal(tryAccession(s), true);
  assert.equal(s.factions[sp.faction], 30); // 未達門檻：不增勢

  const s2 = fresh('companion-test-2');
  const h2 = addHeir(s2, ADULT_AGE);
  const sp2 = sponsorOf(s2);
  s2.factions[sp2.faction] = 30;
  recommendCompanion(s2, h2.id, sp2.id);
  companionOf(s2, h2.id).bond = BOND_THRESHOLD;
  s2.alive = false;
  s2.dynasty.crownPrince = null;
  assert.equal(tryAccession(s2), true);
  assert.equal(s2.factions[sp2.faction], 30 + COMPANION_ASCEND_FACTION);
  assert.equal(s2.bonds.unlocked[sp2.id], true);
  assert.equal(s2.chronicle.filter((c) => c.kind === 'companion_ascend').length, 1);
});

test('奪嫡評價：無伴讀時等於能力與功績；有伴讀時加上舉薦人派系勢力權重', () => {
  const s = fresh();
  const h = addHeir(s, ADULT_AGE);
  const sp = sponsorOf(s);
  s.factions[sp.faction] = 40;
  assert.equal(successionScore(s, h), heirStrength(h));
  recommendCompanion(s, h.id, sp.id);
  assert.ok(Math.abs(successionScore(s, h) - heirStrength(h) - COMPANION_RIVAL_WEIGHT * 40) < 1e-9);
});

test('太傅派系調整正面特質類別權重：清流加、勳貴減，限於 [0,1]；總機率閘門不變', () => {
  const abil = { intellect: 50, virtue: 50 }; // 太傅才學 0.5
  assert.equal(tutorGoodChance({ faction: 'qingliu', abilities: abil }), 0.6);
  assert.equal(tutorGoodChance({ faction: 'xunggui', abilities: abil }), 0.4);
  assert.equal(tutorGoodChance({ faction: 'hanmen', abilities: abil }), 0.5);
  assert.equal(tutorGoodChance({ faction: 'qingliu', abilities: { intellect: 100, virtue: 100 } }), 1);
  assert.equal(tutorGoodChance({ faction: 'xunggui', abilities: { intellect: 0, virtue: 0 } }), 0);
  assert.equal(tutorGoodChance(null), 0);
});

test('史冊：companion_bond 與 companion_ascend 有正式文字，不輸出 undefined', () => {
  const b = chronicleLine({ kind: 'companion_bond', name: '皇子h1', sponsorName: '甲', year: 3, month: 6 });
  assert.match(b.text, /皇子皇子h1與伴讀甲相得/);
  assert.equal(b.tag, '伴讀');
  const a = chronicleLine({ kind: 'companion_ascend', name: '皇子h1', sponsorName: '甲', year: 9, month: 1 });
  assert.match(a.text, /甲隨皇子皇子h1登基/);
  assert.equal(a.tag, '伴讀');
  assert.doesNotMatch(b.text + a.text, /undefined/);
});

test('登基時課表刪除後，伴讀資料隨之消失（不殘留）', () => {
  const s = fresh();
  const h = addHeir(s, ADULT_AGE);
  recommendCompanion(s, h.id, sponsorOf(s).id);
  s.alive = false;
  s.dynasty.crownPrince = null;
  tryAccession(s);
  assert.equal(curriculumEntry(s, h.id), null);
});

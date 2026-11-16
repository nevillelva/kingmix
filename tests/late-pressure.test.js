import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import { runSimulation } from '../src/sim.js';
import { governorOf, applyPrefectureYield, AUTONOMY_REMIT, YIELD_TREASURY } from '../src/economy.js';
import { chronicleLine } from '../src/chronicle.js';
import { ensureCapture } from '../src/city-capture.js';
import {
  ensureLatePressure, tickAutonomy, tickMinister, tickDisasters, tickLatePressure, disasterChance,
  DEFIANT_LOYALTY, DEFIANT_MONTHS, AUTONOMY_MONTHS, AUTONOMY_SUBMIT_LOYALTY,
  MINISTER_FACTION, MINISTER_MONTHS, MINISTER_END, MINISTER_POWER_DRAIN, MINISTER_PEAK,
  DISASTER_BASE, DISASTER_MAX, DISASTER_WEAK_BONUS, DISASTER_UNREST_BONUS, DISASTER_CHAIN_GAIN, DISASTER_CHAIN_CAP, DISASTER_LOG_CAP,
} from '../src/late-pressure.js';

const seeded = (seed) => createInitialState(seed);

test('懶初始化：舊存檔無 latePressure 與割據欄位時補上預設值', () => {
  const s = seeded('lp-init');
  delete s.latePressure;
  ensureLatePressure(s);
  assert.deepEqual(s.latePressure, { minister: null, ministerMonths: 0, disasters: [] });
  for (const p of ensureCapture(s)) {
    assert.equal(p.defiantMonths, 0);
    assert.equal(p.autonomous, false);
  }
});

test('知府離心連續達 DEFIANT_MONTHS 月即割據，並寫入史冊', () => {
  const s = seeded('lp-auto-on');
  const pref = s.prefectures[0];
  governorOf(s, pref).loyalty = DEFIANT_LOYALTY - 1;
  for (let i = 0; i < DEFIANT_MONTHS - 1; i++) tickAutonomy(s);
  assert.equal(pref.autonomous, false, '未達月數前不割據');
  tickAutonomy(s);
  assert.equal(pref.autonomous, true);
  const entry = s.chronicle.find((c) => c.kind === 'autonomy');
  assert.ok(entry, '史冊應有割據紀錄');
  assert.equal(entry.prefecture, pref.id);
});

test('知府忠誠回升即重置離心計數，不致割據', () => {
  const s = seeded('lp-auto-reset');
  const pref = s.prefectures[1];
  const gov = governorOf(s, pref);
  gov.loyalty = DEFIANT_LOYALTY - 1;
  for (let i = 0; i < DEFIANT_MONTHS - 1; i++) tickAutonomy(s);
  gov.loyalty = 80;
  tickAutonomy(s);
  assert.equal(pref.defiantMonths, 0);
  gov.loyalty = DEFIANT_LOYALTY - 1;
  for (let i = 0; i < DEFIANT_MONTHS - 1; i++) tickAutonomy(s);
  assert.equal(pref.autonomous, false);
});

test('割據持續 AUTONOMY_MONTHS 月後歸順，知府忠誠至少回到 AUTONOMY_SUBMIT_LOYALTY', () => {
  const s = seeded('lp-auto-restore');
  const pref = s.prefectures[2];
  const gov = governorOf(s, pref);
  pref.autonomous = true;
  gov.loyalty = 10;
  for (let i = 0; i < AUTONOMY_MONTHS - 1; i++) tickAutonomy(s);
  assert.equal(pref.autonomous, true, '未滿月數前仍割據');
  assert.equal(gov.loyalty, 10, '割據期間忠誠不另外流失');
  tickAutonomy(s);
  assert.equal(pref.autonomous, false);
  assert.equal(gov.loyalty, AUTONOMY_SUBMIT_LOYALTY);
});

test('割據州府的稅入只解送 AUTONOMY_REMIT；叛亂府仍不減產（REBEL_YIELD_MULT=1）', () => {
  const base = seeded('lp-remit');
  const cut = seeded('lp-remit');
  const rebel = seeded('lp-remit');
  for (const s of [base, cut, rebel]) {
    s.stats.treasury = 500;
    s.canal = { enabled: false }; // 隔離漕運損耗，本測試只驗證割據解送與叛亂不減產
    for (const p of s.prefectures) p.yield = 2;
  }
  cut.prefectures[0].autonomous = true;
  rebel.prefectures[0].rebel = true;
  const t0 = base.stats.treasury; applyPrefectureYield(base);
  const t1 = cut.stats.treasury; applyPrefectureYield(cut);
  const t2 = rebel.stats.treasury; applyPrefectureYield(rebel);
  const full = 2 * YIELD_TREASURY;
  assert.ok(Math.abs((base.stats.treasury - t0) - 6 * full) < 1e-9);
  assert.ok(Math.abs((cut.stats.treasury - t1) - (5 * full + full * AUTONOMY_REMIT)) < 1e-9);
  assert.ok(Math.abs((rebel.stats.treasury - t2) - 6 * full) < 1e-9, '叛亂府不因叛亂減產');
});

test('缺位之府（無知府）不計離心、不割據', () => {
  const s = seeded('lp-vacant');
  const pref = s.prefectures[3];
  s.officials = s.officials.filter((o) => o.office !== `prefect:${pref.id}`);
  for (let i = 0; i < DEFIANT_MONTHS + 2; i++) tickAutonomy(s);
  assert.equal(pref.autonomous, false);
  assert.equal(pref.defiantMonths, 0);
});

function courtOfficial(id, faction, loyalty, ambition) {
  return { id, name: `臣${id}`, faction, loyalty, ambition, office: null, abilities: { intellect: 50, politics: 50, martial: 50, command: 50, virtue: 50 } };
}

test('權臣：某派勢力連續高於 MINISTER_FACTION 達 MINISTER_MONTHS 月，且有低忠誠高野心之朝臣則出現', () => {
  const s = seeded('lp-min-on');
  s.factions = { qingliu: 20, xunggui: 20, hanmen: MINISTER_FACTION + 5 };
  s.officials.push(courtOfficial('ministerA', 'hanmen', 20, 80));
  for (let i = 0; i < MINISTER_MONTHS - 1; i++) tickMinister(s);
  assert.equal(s.latePressure.minister, null);
  tickMinister(s);
  assert.equal(s.latePressure.minister.id, 'ministerA');
  assert.ok(s.chronicle.some((c) => c.kind === 'minister'));
});

test('權臣在朝：皇權每月流失，所屬派系增勢；派系跌破 MINISTER_END 即失勢', () => {
  const s = seeded('lp-min-life');
  ensureLatePressure(s);
  s.factions = { qingliu: 20, xunggui: 20, hanmen: 60 };
  s.officials.push(courtOfficial('ministerB', 'hanmen', 20, 80));
  s.latePressure.minister = { id: 'ministerB', name: '臣', faction: 'hanmen', year: 1, month: 1 };
  const p0 = s.stats.power;
  const f0 = s.factions.hanmen;
  tickMinister(s);
  assert.ok(Math.abs((p0 - s.stats.power) - MINISTER_POWER_DRAIN) < 1e-9);
  assert.ok(s.factions.hanmen > f0);
  s.factions.hanmen = MINISTER_END - 1;
  tickMinister(s);
  assert.equal(s.latePressure.minister, null);
});

test('權臣增勢至 MINISTER_PEAK 即止，不無限制坐大', () => {
  const s = seeded('lp-min-peak');
  ensureLatePressure(s);
  s.factions = { qingliu: 20, xunggui: 20, hanmen: 70 };
  s.officials.push(courtOfficial('ministerC', 'hanmen', 20, 80));
  s.latePressure.minister = { id: 'ministerC', name: '臣', faction: 'hanmen', year: 1, month: 1 };
  for (let i = 0; i < 400; i++) tickMinister(s);
  assert.ok(Math.abs(s.factions.hanmen - MINISTER_PEAK) < 1e-9, `faction ${s.factions.hanmen}`);
  assert.ok(s.latePressure.minister, '權臣仍在朝');
});

test('無合適人選（忠誠不夠低或野心不足）則不出現權臣', () => {
  const s = seeded('lp-min-none');
  s.factions = { qingliu: 20, xunggui: 20, hanmen: MINISTER_FACTION + 5 };
  s.officials.push(courtOfficial('loyalOne', 'hanmen', 90, 80));
  s.officials.push(courtOfficial('timid', 'hanmen', 20, 10));
  for (let i = 0; i < MINISTER_MONTHS + 5; i++) tickMinister(s);
  assert.equal(s.latePressure.minister, null);
});

test('天災機率：基礎值；城防或民心低落、叛亂、近期連鎖皆使機率上升，且不超過上限', () => {
  const s = seeded('lp-dis-chance');
  const pref = s.prefectures[0];
  pref.defense = 80; pref.morale = 80; pref.rebel = false; pref.autonomous = false;
  const base = disasterChance(s, pref, 0);
  assert.ok(Math.abs(base - DISASTER_BASE) < 1e-12);
  pref.defense = 10;
  assert.ok(disasterChance(s, pref, 0) > base);
  pref.defense = 80; pref.rebel = true;
  assert.ok(disasterChance(s, pref, 0) > base);
  pref.rebel = false;
  assert.ok(Math.abs(disasterChance(s, pref, 2) - DISASTER_BASE * (1 + DISASTER_CHAIN_GAIN * 2)) < 1e-12);
  assert.ok(Math.abs(disasterChance(s, pref, 9) - DISASTER_BASE * (1 + DISASTER_CHAIN_GAIN * DISASTER_CHAIN_CAP)) < 1e-12, '連鎖計數有上限');
  pref.defense = 0; pref.morale = 0; pref.rebel = true; pref.autonomous = true;
  const worst = (DISASTER_BASE + 2 * DISASTER_WEAK_BONUS + DISASTER_UNREST_BONUS) * (1 + DISASTER_CHAIN_GAIN * DISASTER_CHAIN_CAP);
  assert.ok(Math.abs(disasterChance(s, pref, 100) - worst) < 1e-12, '最壞情況之機率');
  assert.ok(disasterChance(s, pref, 100) <= DISASTER_MAX);
});

test('天災：損及所在府城防與民心，並記入紀錄與史冊；紀錄上限為 DISASTER_LOG_CAP', () => {
  const s = seeded('lp-dis-hit');
  // 將目標府城防與民心壓到底、置於叛亂與割據，使機率觸及上限，連續擲骰必有天災。
  const pref = s.prefectures.find((p) => p.character === 'trade');
  const agri0 = s.stats.agriculture;
  const comm0 = s.stats.commerce;
  const people0 = s.stats.people;
  let hits = 0;
  for (let i = 0; i < 2000; i++) {
    s.turn = i; s.year = 1 + Math.floor(i / 12); s.month = (i % 12) + 1;
    pref.defense = 0; pref.morale = 0; pref.rebel = true; pref.autonomous = true;
    const before = s.latePressure?.disasters?.length ?? 0;
    tickDisasters(s);
    if ((s.latePressure?.disasters?.length ?? 0) > before) hits++;
  }
  assert.ok(hits > 0);
  assert.ok(s.latePressure.disasters.length <= DISASTER_LOG_CAP);
  assert.ok(s.chronicle.some((c) => c.kind === 'disaster' && c.prefecture === pref.id));
  assert.equal(s.stats.agriculture, agri0, '天災不直接扣全國農業');
  assert.equal(s.stats.commerce, comm0, '天災不直接扣全國商業');
  assert.equal(s.stats.people, people0, '天災不直接扣全國民心');
  assert.ok(pref.defense < 100 && pref.morale < 100);
});

test('天災具決定性：同一種子與同一月，天災結果相同', () => {
  const run = () => {
    const s = seeded('lp-dis-det');
    for (let i = 0; i < 120; i++) { s.turn = i; s.year = 1 + Math.floor(i / 12); s.month = (i % 12) + 1; tickDisasters(s); }
    return JSON.stringify(s.latePressure.disasters);
  };
  assert.equal(run(), run());
});

test('tickLatePressure 整合：連續六十月呼叫穩定、數值仍有限且非負', () => {
  const s = seeded('lp-integ');
  for (let i = 0; i < 60; i++) tickLatePressure(s);
  assert.ok(Number.isFinite(s.stats.power));
  assert.ok(s.stats.agriculture >= 0 && s.stats.commerce >= 0);
});

test('史冊文字：autonomy / minister / disaster 皆有可讀輸出，不含 undefined', () => {
  const lines = [
    chronicleLine({ kind: 'autonomy', prefectureName: '京兆府', governor: '周文昭', year: 3, month: 4 }),
    chronicleLine({ kind: 'minister', name: '臣甲', year: 3, month: 4 }),
    chronicleLine({ kind: 'disaster', prefectureName: '江寧府', year: 3, month: 4 }),
  ];
  for (const l of lines) {
    assert.ok(!l.text.includes('undefined'));
    assert.ok(l.tag && l.tag !== '—');
  }
});

test('600 月模擬跨數種子皆完成，且壓力系統不致單局必然終結（至少一局存活或正常結束）', () => {
  const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
  const reasons = [];
  for (let i = 0; i < 4; i++) {
    const r = runSimulation({ seed: `late-pressure-${i}`, months: 600, events, mode: 'long' });
    reasons.push(r.endReason ?? (r.alive ? 'alive' : 'unknown'));
  }
  assert.ok(reasons.some((r) => r === 'alive' || r === 'abdicated'), `reasons: ${reasons}`);
});

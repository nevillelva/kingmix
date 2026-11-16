import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/state.js';
import {
  tickPartisan, respondPartisanDemand, autoRespondPartisan, partisanStatus, ensurePartisan,
  STANDOFF_MONTHS, DEMAND_INTERVAL, DEMAND_OPEN_LIMIT, BALANCE_POWER_COST, BALANCE_HOLD_MONTHS,
  PURGE_LOYALTY_DRAIN, BAN_QINGLIU_DROP,
} from '../src/partisan.js';
import { removeOfficial, monthlyTick } from '../src/turn.js';
import { ensureLatePressure, tickLatePressure, MINISTER_MONTHS } from '../src/late-pressure.js';
import {
  applyTyrannyDrift, openInvestigation, MAX_ACTIVE_CASES, TYRANNY_QINGLIU_THRESHOLD,
} from '../src/dongchang.js';
import { OFFICES, officeHolder, assignOffice } from '../src/offices.js';
import { autoAppoint } from '../src/selection.js';
import { BALANCE } from '../src/factions.js';

const ABILITIES = { intellect: 50, politics: 50, martial: 50, command: 50, virtue: 50 };
const court = (id, faction, loyalty = 60, ambition = 20) => ({
  id, name: `臣${id}`, faction, loyalty, ambition, office: null, abilities: { ...ABILITIES },
});

// 對峙局面：清流 55（進逼）、勳貴 42（對手）、寒門 3（第三派）。勳貴設四名朝臣供彈劾。
function standoffState(seed) {
  const s = createInitialState(seed);
  s.partisan = { enabled: true };
  s.factions = { qingliu: 55, xunggui: 42, hanmen: 3 };
  for (const id of ['x1', 'x2', 'x3', 'x4']) s.officials.push(court(id, 'xunggui'));
  return s;
}

const dismiss = (s) => (o) => removeOfficial(s, o, 'partisan_ban');

// 逐月推進（只跑黨爭本身，派系數值固定）。
function tick(s, n = 1) {
  for (let i = 0; i < n; i++) {
    s.turn += 1;
    tickPartisan(s, { dismiss: dismiss(s) });
  }
  return s;
}

const enterStandoff = (s) => tick(s, STANDOFF_MONTHS);

test('預設不參與：enabled 為 false 時黨爭完全不動 state（不建欄位、不擲骰）', () => {
  const s = standoffState('pt-off');
  s.partisan = { enabled: false };
  const factions = structuredClone(s.factions);
  const officials = structuredClone(s.officials);
  tick(s, STANDOFF_MONTHS + 3 * DEMAND_INTERVAL);
  assert.deepEqual(s.partisan, { enabled: false }, '不建立任何黨爭欄位');
  assert.deepEqual(s.factions, factions);
  assert.deepEqual(s.officials, officials);
  assert.equal(s.chronicle.length, 0);
});

test('對峙：一派 ≥50 且另一派 ≥40 持續 STANDOFF_MONTHS 月才進入 standoff，並寫入史冊', () => {
  const s = standoffState('pt-enter');
  tick(s, STANDOFF_MONTHS - 1);
  assert.equal(s.partisan.stage, 'calm');
  tick(s);
  assert.equal(s.partisan.stage, 'standoff');
  assert.equal(s.partisan.petitioner, 'qingliu');
  assert.equal(s.partisan.rival, 'xunggui');
  assert.ok(s.chronicle.some((c) => c.kind === 'standoff'));
});

test('對峙條件中斷時計數歸零，不累積', () => {
  const s = standoffState('pt-reset');
  tick(s, STANDOFF_MONTHS - 1);
  s.factions = { qingliu: 45, xunggui: 42, hanmen: 13 };
  tick(s);
  assert.equal(s.partisan.standoffMonths, 0);
  assert.equal(s.partisan.stage, 'calm');
});

test('聯名彈劾：進入對峙後每隔 DEMAND_INTERVAL 月提出一則，指名對手派系之朝臣', () => {
  const s = standoffState('pt-demand');
  enterStandoff(s);
  tick(s);
  const first = s.partisan.demands.find((d) => d.status === 'open');
  assert.ok(first, '進入對峙次月應有第一則訴求');
  assert.equal(first.rival, 'xunggui');
  assert.equal(s.officials.find((o) => o.id === first.official).faction, 'xunggui');
  tick(s, DEMAND_INTERVAL - 1);
  assert.equal(s.partisan.demands.length, 1, '未達間隔不另提');
  tick(s);
  assert.equal(s.partisan.demands.length, 2);
  assert.equal(s.partisan.demands[1].turn - s.partisan.demands[0].turn, DEMAND_INTERVAL);
});

test('同一局面、同一種子，彈劾對象確定性相同（所有擲骰以 partisan 流進行）', () => {
  const pick = (seed) => {
    const s = standoffState(seed);
    enterStandoff(s);
    tick(s);
    return s.partisan.demands[0].official;
  };
  assert.equal(pick('pt-det'), pick('pt-det'));
});

test('平衡各方：駁回、耗皇權，之後均衡期內勢力過高之派回落且對峙暫停', () => {
  const s = standoffState('pt-balance');
  enterStandoff(s);
  tick(s);
  const d = s.partisan.demands.find((x) => x.status === 'open');
  const power = s.stats.power;
  const r = respondPartisanDemand(s, d.id, 'balance');
  assert.deepEqual(r, { ok: true, outcome: 'balanced' });
  assert.equal(s.stats.power, power - BALANCE_POWER_COST);
  assert.equal(s.partisan.balanceMonths, BALANCE_HOLD_MONTHS);
  assert.equal(s.partisan.stage, 'calm');
  assert.equal(s.partisan.demands.find((x) => x.id === d.id).status, 'balanced');
  tick(s);
  assert.equal(s.factions.qingliu, 55 - 1, '均衡期間高於 BALANCE.max 之派每月回落');
  assert.ok(55 > BALANCE.max);
  assert.equal(s.partisan.balanceMonths, BALANCE_HOLD_MONTHS - 1);
  assert.equal(s.partisan.demands.filter((x) => x.status === 'open').length, 0, '均衡期間不提新訴求');
});

test('扶植單一派系：進逼之派拉攏（rallyFaction），無代價，但不直接設權臣', () => {
  const s = standoffState('pt-rally');
  enterStandoff(s);
  tick(s);
  const d = s.partisan.demands.find((x) => x.status === 'open');
  const power = s.stats.power;
  assert.deepEqual(respondPartisanDemand(s, d.id, 'rally'), { ok: true, outcome: 'rallied' });
  assert.equal(s.factions.qingliu, 65, '進逼之派 +10');
  assert.equal(s.factions.xunggui, 37, '其餘兩派各 -5');
  assert.equal(s.stats.power, power, '扶植不耗皇權');
  assert.equal(ensureLatePressure(s).minister, null, '扶植不直接設權臣');
});

test('扶植後勢力推向權臣門檻，權臣仍只能由 tickMinister 達成', () => {
  const s = standoffState('pt-rally-min');
  s.officials.push(court('m1', 'qingliu', 20, 80));
  enterStandoff(s);
  tick(s);
  respondPartisanDemand(s, s.partisan.demands.find((x) => x.status === 'open').id, 'rally');
  assert.ok(s.factions.qingliu > MINISTER_MONTHS && s.factions.qingliu > 55);
  assert.equal(ensureLatePressure(s).minister, null);
  for (let i = 0; i < MINISTER_MONTHS; i++) tickLatePressure(s);
  assert.equal(s.latePressure.minister.id, 'm1', '經既有月結累積後才出現權臣');
});

test('血腥清洗：走東廠 punish 路徑，官員除名，暴政上升，全體朝臣忠誠下滑', () => {
  const s = standoffState('pt-purge');
  enterStandoff(s);
  tick(s);
  const d = s.partisan.demands.find((x) => x.status === 'open');
  const target = d.official;
  const others = s.officials.filter((o) => o.id !== target).map((o) => [o.id, o.loyalty]);
  assert.deepEqual(respondPartisanDemand(s, d.id, 'purge'), { ok: true, outcome: 'purged' });
  assert.equal(s.officials.some((o) => o.id === target), false, '被彈劾者除名');
  assert.equal(s.dongchang.cases.find((c) => c.officialId === target).outcome, 'punished');
  assert.ok(s.tyranny > 0, '暴政上升');
  for (const [id, loyalty] of others) {
    const o = s.officials.find((x) => x.id === id);
    assert.ok(Math.abs(o.loyalty - Math.max(0, loyalty - PURGE_LOYALTY_DRAIN)) < 1e-9, `${id} 忠誠下滑`);
  }
});

test('對峙與暴政：清洗使暴政達門檻後，既有月結令清流好感每月下降', () => {
  const s = standoffState('pt-tyranny');
  s.tyranny = TYRANNY_QINGLIU_THRESHOLD;
  enterStandoff(s);
  tick(s);
  respondPartisanDemand(s, s.partisan.demands.find((x) => x.status === 'open').id, 'purge');
  const q = s.factions.qingliu;
  applyTyrannyDrift(s);
  assert.ok(s.factions.qingliu < q, '暴政達門檻，清流好感下降');
});

test('不回應：未了訴求達 DEMAND_OPEN_LIMIT 筆時，下一則到期即黨錮，被彈劾者除名、清流好感下滑', () => {
  const s = standoffState('pt-ban');
  enterStandoff(s);
  const named = [];
  for (let i = 0; i < 40 && s.partisan.bans === 0; i++) {
    tick(s);
    for (const d of s.partisan.demands) if (!named.includes(d.official)) named.push(d.official);
  }
  assert.equal(s.partisan.bans, 1, '黨錮應已觸發');
  assert.equal(s.partisan.demands.filter((d) => d.status === 'open').length, 0);
  const banned = s.partisan.demands.filter((d) => d.status === 'banned').map((d) => d.official);
  assert.equal(banned.length, DEMAND_OPEN_LIMIT);
  for (const id of banned) assert.equal(s.officials.some((o) => o.id === id), false);
  assert.equal(s.partisan.stage, 'calm');
  assert.ok(s.chronicle.some((c) => c.kind === 'partisan_ban'));
  assert.equal(s.factions.qingliu, 55 - BAN_QINGLIU_DROP);
});

test('黨錮後官職空缺：被彈劾者任官職者，該職即空缺，不留懸空引用，之後由既有吏部規則補任', () => {
  const s = standoffState('pt-vacancy');
  assignOffice(s, 'x1', 'war');
  enterStandoff(s);
  for (let i = 0; i < 40 && s.partisan.bans === 0; i++) tick(s);
  assert.equal(s.partisan.bans, 1);
  const holderGone = !s.officials.some((o) => o.id === 'x1');
  if (holderGone) assert.equal(officeHolder(s, 'war'), null, '被黨錮者之官職即時空缺');
  for (const key of Object.keys(OFFICES)) {
    const h = officeHolder(s, key);
    assert.ok(h === null || s.officials.includes(h), `${key} 不得指向已除名之官員`);
  }
  assert.doesNotThrow(() => autoAppoint(s));
  for (const key of Object.keys(OFFICES)) {
    const h = officeHolder(s, key);
    assert.ok(h === null || s.officials.includes(h), `吏部補任後 ${key} 仍不得懸空`);
  }
});

test('權臣在朝：對峙暫停，不提新訴求；既有訴求保留待裁決', () => {
  const s = standoffState('pt-minister');
  enterStandoff(s);
  tick(s);
  const open = s.partisan.demands.filter((d) => d.status === 'open').length;
  ensureLatePressure(s).minister = { id: 'm1', name: '權臣', faction: 'qingliu', year: 1, month: 1 };
  tick(s, 2 * DEMAND_INTERVAL);
  assert.equal(s.partisan.demands.filter((d) => d.status === 'open').length, open, '權臣在朝不增訴求');
  assert.equal(s.partisan.stage, 'standoff');
});

test('權臣在朝不阻礙裁決：可照常以清洗或扶植回應既有訴求', () => {
  const s = standoffState('pt-minister-resp');
  enterStandoff(s);
  tick(s);
  ensureLatePressure(s).minister = { id: 'm1', name: '權臣', faction: 'qingliu', year: 1, month: 1 };
  const d = s.partisan.demands.find((x) => x.status === 'open');
  assert.equal(respondPartisanDemand(s, d.id, 'rally').ok, true);
  assert.equal(s.latePressure.minister.id, 'm1', '裁決不改動既有權臣');
});

test('對峙解除：未了訴求以 lapsed 結束，階段回到 calm', () => {
  const s = standoffState('pt-lapse');
  enterStandoff(s);
  tick(s);
  s.factions = { qingliu: 50, xunggui: 30, hanmen: 20 };
  tick(s);
  assert.equal(s.partisan.stage, 'calm');
  assert.equal(s.partisan.demands[0].status, 'lapsed');
});

test('東廠案件已滿時，清洗無法執行，訴求保持 open 待下次裁決', () => {
  const s = standoffState('pt-dcbusy');
  enterStandoff(s);
  tick(s);
  const d = s.partisan.demands.find((x) => x.status === 'open');
  const holders = s.officials.filter((o) => o.id !== d.official && o.faction !== 'xunggui').slice(0, MAX_ACTIVE_CASES);
  for (const o of holders) openInvestigation(s, o.id);
  assert.equal(respondPartisanDemand(s, d.id, 'purge').reason, 'dc_busy');
  assert.equal(s.partisan.demands.find((x) => x.id === d.id).status, 'open');
  assert.ok(s.officials.some((o) => o.id === d.official), '被彈劾者仍在朝');
});

test('裁決驗證：未知回應丟錯；無此訴求或已裁決者回傳 no_demand', () => {
  const s = standoffState('pt-validate');
  enterStandoff(s);
  tick(s);
  const d = s.partisan.demands.find((x) => x.status === 'open');
  assert.throws(() => respondPartisanDemand(s, d.id, 'bribe'), /unknown partisan response/);
  assert.deepEqual(respondPartisanDemand(s, 9999, 'rally'), { ok: false, reason: 'no_demand' });
  respondPartisanDemand(s, d.id, 'rally');
  assert.equal(respondPartisanDemand(s, d.id, 'rally').reason, 'no_demand');
});

test('模擬策略：ignore 不裁決，其餘策略逐一裁決全部未了訴求', () => {
  const s = standoffState('pt-auto');
  enterStandoff(s);
  tick(s, 2 * DEMAND_INTERVAL);
  assert.equal(autoRespondPartisan(s, 'ignore'), 0);
  const n = s.partisan.demands.filter((d) => d.status === 'open').length;
  assert.ok(n >= 2);
  assert.equal(autoRespondPartisan(s, 'rally'), n);
  assert.equal(s.partisan.demands.filter((d) => d.status === 'open').length, 0);
});

test('月結接線：monthlyTick 會推進黨爭；預設關閉時 partisan 物件保持不變', () => {
  const on = standoffState('pt-monthly');
  for (let i = 0; i < STANDOFF_MONTHS + 1; i++) {
    on.turn += 1;
    monthlyTick(on);
  }
  assert.equal(on.partisan.stage, 'standoff');

  const off = standoffState('pt-monthly-off');
  off.partisan = { enabled: false };
  const before = structuredClone(off.partisan);
  for (let i = 0; i < STANDOFF_MONTHS + 1; i++) {
    off.turn += 1;
    monthlyTick(off);
  }
  assert.deepEqual(off.partisan, before);
});

test('讀取：partisanStatus 只回報狀況，不修改 state', () => {
  const s = standoffState('pt-status');
  enterStandoff(s);
  tick(s);
  const before = structuredClone(s);
  const st = partisanStatus(s);
  assert.equal(st.stage, 'standoff');
  assert.equal(st.openLimit, DEMAND_OPEN_LIMIT);
  assert.equal(st.openDemands.length, 1);
  assert.deepEqual(s, before);
  ensurePartisan(createInitialState('pt-status-init'));
});

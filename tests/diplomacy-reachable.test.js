import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { applyOption } from '../src/turn.js';
import { optionOpen } from '../src/events.js';
import { makeRng } from '../src/rng.js';
import { runSimulation } from '../src/sim.js';
import {
  diplomacyOf, canDiplomacy, scoutNeighbor, scoutedFresh, diplomacyAction, SCOUT_COST, SCOUT_TTL,
  MARRIAGE_COST, DECLARE_WAR_REWARD, DECLARE_WAR_LOSS, enemyStrengthOf,
} from '../src/diplomacy.js';
import { startCampaign, autoCampaignStep, pickTactic, MAX_ROUNDS } from '../src/campaign.js';
import { ourStrength } from '../src/war.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = new Map(events.map((e) => [e.id, e]));
const NEIGHBOR_EVENT_IDS = ['E416', 'E417', 'E418', 'E419'];
const ROUTE_KEYS = ['marriage', 'tribute', 'ally', 'scout', 'war'];

// ---- 前置條件：canDiplomacy 與各路線的實際結果一致 ----

test('tribute is gated by attitude, alliance by attitude and slot, and war by allied status', () => {
  const s = createInitialState('g');
  const d = diplomacyOf(s);
  d.north.attitude = 39;
  assert.equal(canDiplomacy(s, 'tribute', 'north'), false);
  d.north.attitude = 40;
  assert.equal(canDiplomacy(s, 'tribute', 'north'), true);

  d.west.attitude = 59;
  assert.equal(canDiplomacy(s, 'ally', 'west'), false);
  d.west.attitude = 60;
  assert.equal(canDiplomacy(s, 'ally', 'west'), true);

  d.west.allied = true;
  assert.equal(canDiplomacy(s, 'war', 'west'), false);
  assert.equal(canDiplomacy(s, 'ally', 'west'), false);
});

test('marriage and scouting need treasury; war is closed while a campaign is active', () => {
  const s = createInitialState('g');
  s.stats.treasury = MARRIAGE_COST - 1;
  assert.equal(canDiplomacy(s, 'marriage', 'east'), false);
  assert.equal(canDiplomacy(s, 'scout', 'east'), true); // 刺探只需 SCOUT_COST
  s.stats.treasury = SCOUT_COST - 1;
  assert.equal(canDiplomacy(s, 'scout', 'east'), false);
  s.stats.treasury = MARRIAGE_COST;
  assert.equal(canDiplomacy(s, 'marriage', 'east'), true);
  assert.equal(canDiplomacy(s, 'war', 'east'), true);
  startCampaign(s, { strength: 150, reward: {}, loss: {} }, { neighborId: 'east' });
  assert.equal(canDiplomacy(s, 'war', 'north'), false);
});

test('unknown neighbor or action is never selectable', () => {
  const s = createInitialState('g');
  assert.equal(canDiplomacy(s, 'tribute', 'mars'), false);
  assert.equal(canDiplomacy(s, 'bribe', 'north'), false);
});

// ---- 刺探：花費國庫、有效期內影響下一場戰役 ----

test('scouting costs treasury, lasts SCOUT_TTL months, and cannot be repeated while fresh', () => {
  const s = createInitialState('sc');
  const before = s.stats.treasury;
  assert.deepEqual(scoutNeighbor(s, 'south'), { ok: true });
  assert.equal(s.stats.treasury, before - SCOUT_COST);
  assert.equal(scoutedFresh(s, 'south'), true);
  assert.equal(scoutNeighbor(s, 'south').reason, 'already');
  s.turn += SCOUT_TTL;
  assert.equal(scoutedFresh(s, 'south'), false);
});

test('a fresh scouting gives the next campaign intel and consumes it', () => {
  const s = createInitialState('sc');
  scoutNeighbor(s, 'south');
  const { campaign } = startCampaign(s, { strength: 185, reward: {}, loss: {} }, { neighborId: 'south' });
  assert.equal(campaign.intel, 'scouted');
  assert.equal(campaign.estimate, Math.round(enemyStrengthOf(s, 'south')));
  assert.equal(scoutedFresh(s, 'south'), false);
});

test('without scouting, a neighbor campaign starts with no intel', () => {
  const s = createInitialState('sc');
  const { campaign } = startCampaign(s, { strength: 185, reward: {}, loss: {} }, { neighborId: 'south' });
  assert.equal(campaign.intel, 'none');
});

test('scouted campaigns win more often than unscouted ones at even strength (same seeds, same tactics)', () => {
  const even = Array.from({ length: 200 }, (_, i) => ourStrength(createInitialState(`e${i}`), makeRng(['e', i]))).reduce((a, b) => a + b, 0) / 200;
  const run = (scouted, i) => {
    const s = createInitialState(`sw${i}`);
    if (scouted) scoutNeighbor(s, 'west');
    startCampaign(s, { strength: even, reward: {}, loss: {} }, { neighborId: 'west' });
    const picks = ['assault', 'hold', 'ambush'];
    for (let k = 0; k < MAX_ROUNDS; k++) {
      const r = pickTactic(s, picks[(i + k) % 3]);
      if (r.finished) return r.finished.won;
    }
    throw new Error('campaign did not end');
  };
  let withScout = 0;
  let without = 0;
  for (let i = 0; i < 300; i++) {
    if (run(true, i)) withScout++;
    if (run(false, i)) without++;
  }
  assert.ok(withScout > without, `scouted ${withScout} vs unscouted ${without}`);
});

// ---- 事件入口：選項以 when.diplomacy 與 optionOpen 把關 ----

test('four neighbor diplomacy events exist and each offers the five routes plus an always-open option', () => {
  for (const id of NEIGHBOR_EVENT_IDS) {
    const e = byId.get(id);
    assert.ok(e, `${id} must exist`);
    const routes = e.options.filter((o) => o.when?.diplomacy).map((o) => o.effects.diplomacy.action);
    assert.deepEqual(routes.sort(), ['ally', 'marriage', 'scout', 'tribute', 'war']);
    const open = e.options.filter((o) => !o.when);
    assert.ok(open.length >= 1, `${id} needs an option that is always open`);
    for (const o of e.options) {
      if (o.effects.diplomacy) assert.equal(o.effects.diplomacy.neighbor, o.when.diplomacy.neighbor);
    }
  }
});

test('the neighbor event routes open only when the relation allows them', () => {
  const s = createInitialState('gate');
  const e = byId.get('E416');
  const shown = () => e.options.filter((o) => optionOpen(s, o)).map((o) => o.key).join('');
  diplomacyOf(s).north.attitude = 10;
  s.stats.treasury = 0;
  // 無國庫、好感低：聯姻（A）、朝貢（B）、結盟（C）、刺探（D）皆關閉；宣戰（E）與置之不理（F）開放。
  assert.equal(shown(), 'EF');
  s.stats.treasury = 100;
  assert.equal(shown(), 'ADEF');
  diplomacyOf(s).north.attitude = 45;
  assert.equal(shown(), 'ABDEF');
});

test('E013 gains a campaign option without changing its existing options', () => {
  const e = byId.get('E013');
  const d = e.options.find((o) => o.key === 'D');
  assert.ok(d && d.effects.campaign, 'E013 option D must start a campaign');
  assert.equal(d.effects.campaign.strength, 396);
  const a = e.options.find((o) => o.key === 'A');
  assert.equal(a.effects.war.strength, 396, 'original option A unchanged');
});

test('applying a campaign option starts a multi-round campaign with the given spec', () => {
  const s = createInitialState('e13');
  const d = byId.get('E013').options.find((o) => o.key === 'D');
  applyOption(s, d, makeRng(['r']));
  assert.equal(s.campaign.status, 'active');
  assert.equal(s.campaign.baseStrength, 396);
  assert.equal(s.campaign.neighborId, null);
});

test('applying a diplomacy war option starts a neighbor campaign with the standard rewards', () => {
  const s = createInitialState('dw');
  const opt = byId.get('E419').options.find((o) => o.key === 'E');
  applyOption(s, opt, makeRng(['r']));
  assert.equal(s.campaign.neighborId, 'east');
  assert.equal(s.campaign.baseStrength, 150);
  assert.deepEqual(s.campaign.reward, { ...DECLARE_WAR_REWARD });
  assert.deepEqual(s.campaign.loss, { ...DECLARE_WAR_LOSS });
  assert.equal(s.wars.length, 0, 'war is recorded only when the campaign ends');
});

test('diplomacy routes apply their effects through applyOption', () => {
  const s = createInitialState('route');
  const before = s.stats.treasury;
  applyOption(s, byId.get('E418').options.find((o) => o.key === 'A'), makeRng(['r']));
  assert.equal(s.stats.treasury, before - MARRIAGE_COST);
  assert.ok(diplomacyOf(s).south.kin > 0);
  assert.equal(s.diplomacyLog.at(-1).action, 'marriage');
  assert.equal(s.diplomacyLog.at(-1).ok, true);
});

test('alliance is reachable: a neighbor at 60 or more can be allied and adds reinforcement', () => {
  const s = createInitialState('ally');
  diplomacyOf(s).east.attitude = 65;
  assert.equal(diplomacyAction(s, 'ally', 'east').ok, true);
  assert.equal(diplomacyOf(s).east.allied, true);
  assert.equal(canDiplomacy(s, 'war', 'east'), false);
});

// ---- 自動出戰：每月一步，直到戰役結束 ----

test('autoCampaignStep scouts first, then fights, and records a campaign war', () => {
  const s = createInitialState('auto');
  startCampaign(s, { strength: 200, reward: { prestige: 1 }, loss: { prestige: -1 } });
  const steps = [];
  for (let m = 0; m < 6 && s.campaign; m++) {
    s.turn += 1;
    steps.push(autoCampaignStep(s).action);
  }
  assert.equal(steps[0], 'recon');
  assert.ok(steps.every((a) => a === 'recon' || a === 'tactic' || a === 'peace'));
  assert.equal(s.campaign, null);
  assert.equal(s.wars.at(-1).mode, 'campaign');
});

test('autoCampaignStep is deterministic for the same state', () => {
  const run = () => {
    const s = createInitialState('same-auto');
    startCampaign(s, { strength: 230, reward: {}, loss: {} });
    const out = [];
    for (let m = 0; m < 6 && s.campaign; m++) {
      s.turn += 1;
      const st = autoCampaignStep(s);
      out.push(st.action + (st.tactic || ''));
    }
    return out.join(',');
  };
  assert.equal(run(), run());
});

// ---- 可達性：無頭模擬中實際觸發（200 局的完整統計見 scratchpad，此處取 40 局做回歸） ----

test('headless sim reaches every route and the campaign autopilot over 40 seeds', () => {
  const tried = Object.fromEntries(ROUTE_KEYS.map((k) => [k, 0]));
  let steps = 0;
  let campaignWars = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = runSimulation({ seed: `big${seed}`, months: 600, events });
    for (const k of ROUTE_KEYS) tried[k] += r.diplomacy?.[k]?.ok ?? 0;
    steps += Object.values(r.campaignSteps).reduce((a, b) => a + b, 0);
    campaignWars += r.wars.filter((w) => w.mode === 'campaign').length;
  }
  for (const k of ['marriage', 'tribute', 'scout', 'war']) assert.ok(tried[k] > 0, `route ${k} never succeeded in 40 seeds`);
  assert.ok(steps > 0, 'autopilot never ran');
  assert.ok(campaignWars > 0, 'no campaign ever ended');
});

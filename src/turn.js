// 套用選項效果、每月結算、推進時間。

import { setStat, FACTION_BASE } from './state.js';
import { makeRng } from './rng.js';
import { officeHolder } from './offices.js';
import { generateOfficial, isCourtOfficial } from './officials.js';
import { attachPerson, applyTraitEffects, generateConsort } from './people.js';
import { openInvestigationOnLowest, tickDongchang, applyTyrannyDrift } from './dongchang.js';
import { activeMonthly } from './policy.js';
import { resolveWar } from './war.js';
import { startCampaign } from './campaign.js';
import { neighborById, diplomacyAction, recordDiplomacy, DECLARE_WAR_REWARD, DECLARE_WAR_LOSS } from './diplomacy.js';
import { createHeir, advanceHeirs, tickHeirs, tickCrownPrince } from './succession.js';
import { tickTutorTraits } from './education.js';
import { tickTitles } from './titles.js';
import { isLoyaltyFrozen, isBonded } from './bonds.js';
import { collectFromSet } from './collections.js';
import { tickEconomy, applyPrefectureYield } from './economy.js';
import { tickCity } from './city.js';
import { tickHarem, applyWaijiaCoupling, taihouPenalty } from './harem.js';
import { applyFactionPressure } from './factions.js';
import { scheduleChain } from './chains.js';
import { recordSharedEvent } from './bonds.js';
import { tickAssassination } from './assassination.js';
import { DEFAULT_MODE, modeMonths } from './mode.js';
import { applyFacilityMonthly } from './facilities.js';

// 官員名單上限：朝臣 12 人（開局 4 人加進士招募）＋ 六府知府 6 人。
export const MAX_OFFICIALS = 18;

// 月結與政策的自然變化：越界時靜默截斷
const drift = (state, key, value) => setStat(state, key, value, { silent: true });

// 由 afterOption 處理、不屬於數值效果的鍵；applyOption 會略過它們。
export const AFTER_OPTION_KEYS = Object.freeze(['chain', 'shared_event']);

export function lowestLoyaltyOfficial(officials) {
  let best = null;
  for (const o of officials) if (isCourtOfficial(o) && (!best || o.loyalty < best.loyalty)) best = o;
  return best;
}

// 移除官員：同時清除其官職、關閉其東廠案件、派系勢力微降。
export function removeOfficial(state, official) {
  const idx = state.officials.indexOf(official);
  if (idx === -1) return;
  state.officials.splice(idx, 1);
  official.office = null;
  state.factions[official.faction] = Math.max(0, state.factions[official.faction] - 2);
  for (const c of state.dongchang.cases) {
    if (c.officialId === official.id && c.status !== 'closed') {
      c.status = 'closed';
      c.outcome = 'removed';
    }
  }
}

export function applyOption(state, option, rng = makeRng(['option', state.turn])) {
  applyEffectsOnly(state, option.effects || {}, rng);
  return state;
}

// 選項套用後的後處理：chain（排定下一月連鎖事件）與 shared_event（君臣共歷，記在忠誠最低的官員上）。
// sim.js 與介面在 applyOption 之後都必須呼叫此函式。
export const CHAIN_CHANCE = 0.25;

export function afterOption(state, event, option) {
  const effects = option.effects || {};
  // 記錄先前選擇（供 prior_choice 條件）：每事件保留最近一次所選選項。
  state.choices = state.choices || {};
  state.choices[event.id] = { option: option.key };
  // 連鎖以機率觸發（種子決定）：每次選中皆必定排程會使後續事件過多，平衡會偏移。
  if (effects.chain && makeRng([state.seed, state.year, state.month, 'chain', event.id])() < CHAIN_CHANCE) {
    scheduleChain(state, effects.chain);
  }
  if (effects.shared_event) {
    const target = lowestLoyaltyOfficial(state.officials);
    if (target) recordSharedEvent(state, target.id, event.id);
  }
  return state;
}

function applyEffectsOnly(state, effects, rng) {
  for (const [key, val] of Object.entries(effects)) {
    if (AFTER_OPTION_KEYS.includes(key)) continue;
    if (key === 'removeOfficial') {
      if (val) {
        const target = lowestLoyaltyOfficial(state.officials);
        if (target) removeOfficial(state, target);
      }
    } else if (key === 'official_loyalty_add') {
      const target = lowestLoyaltyOfficial(state.officials);
      if (target) target.loyalty = Math.min(100, Math.max(0, target.loyalty + val));
    } else if (key === 'population_pct') {
      setStat(state, 'population', state.stats.population * (1 + val / 100));
    } else if (key === 'setFlag') {
      state.flags[val] = true;
    } else if (key === 'add_consort') {
      for (let i = 0; i < val && state.consorts.length < 8; i++) {
        state.dynasty.nextConsortId += 1;
        const id = `c${state.dynasty.nextConsortId}`;
        state.consorts.push({ id, ...generateConsort(state.seed, id) });
      }
    } else if (key === 'birth') {
      const mother = state.consorts[0]?.id ?? null;
      if (mother && val) attachPerson(state.seed, createHeir(state, rng, { gender: val, mother }), { withAge: false });
    } else if (key === 'tutor_teach') {
      for (const h of state.heirs) {
        for (const k of Object.keys(h.abilities)) h.abilities[k] = Math.min(100, h.abilities[k] + val);
      }
    } else if (key === 'remonstrance') {
      applyRemonstrance(state, val);
    } else if (key === 'war') {
      resolveWar(state, val, rng, (st, eff) => applyEffectsOnly(st, eff, rng));
    } else if (key === 'campaign') {
      // 事件型三回合戰役（無鄰國，敵強由 spec.strength 給定）；規格同 startCampaign。
      startCampaign(state, val);
    } else if (key === 'diplomacy') {
      applyDiplomacy(state, val);
    } else if (key === 'collect') {
      collectFromSet(state, val, rng); // 收藏（見 collections.js）：自該套未收得者抽件
    } else if (key === 'investigate_lowest') {
      if (val) openInvestigationOnLowest(state);
    } else if (key === 'recruit') {
      for (let i = 0; i < val && state.officials.length < MAX_OFFICIALS; i++) {
        // 同月可能有兩則奏摺都招募（早朝第 2 則），id 以後綴避免撞號。
        const rid = `r${state.turn}_${i}`;
        let id = rid;
        for (let n = 1; state.officials.some((o) => o.id === id); n++) id = `${rid}_${n}`;
        const base = 30 + Math.round(state.stats.literature / 10);
        state.officials.push(
          attachPerson(state.seed, generateOfficial(rng, id, { name: `進士${state.year}-${i + 1}`, base, span: 40 })),
        );
      }
    } else {
      setStat(state, key, state.stats[key] + val);
    }
  }
}

// 外交路線：{ action: marriage | tribute | ally | scout | war, neighbor }。
// war 開啟對該鄰國的三回合戰役（敵強取自外交狀態），其餘路線即時結算。
function applyDiplomacy(state, { action, neighbor }) {
  const n = neighborById(neighbor);
  if (!n) return;
  if (action === 'war') {
    const r = startCampaign(
      state,
      { strength: n.strength, reward: { ...DECLARE_WAR_REWARD }, loss: { ...DECLARE_WAR_LOSS } },
      { neighborId: neighbor },
    );
    recordDiplomacy(state, action, neighbor, r.ok);
    return;
  }
  const r = diplomacyAction(state, action, neighbor);
  recordDiplomacy(state, action, neighbor, r.ok);
}

// 死諫（E420）：君臣相得且忠誠最低的朝臣進諫。納諫則忠誠回升；駁回則殞命。結果皆寫入史記（state.chronicle）。
export const REMONSTRANCE_ACCEPT_LOYALTY = 15;
export function bondedRemonstrant(state) {
  let best = null;
  for (const o of state.officials) {
    if (!isCourtOfficial(o) || !isBonded(state, o.id)) continue;
    if (!best || o.loyalty < best.loyalty) best = o;
  }
  return best;
}

function applyRemonstrance(state, choice) {
  const target = bondedRemonstrant(state);
  if (!target) return;
  const base = { kind: 'remonstrance', name: target.personName ?? target.name, year: state.year, month: state.month };
  if (choice === 'accept') {
    target.loyalty = Math.min(100, target.loyalty + REMONSTRANCE_ACCEPT_LOYALTY);
    state.chronicle.push({ ...base, outcome: 'accepted' });
  } else if (choice === 'reject') {
    state.chronicle.push({ ...base, outcome: 'died' });
    removeOfficial(state, target);
  }
}

function applyPolicyEffects(state) {
  for (const [key, val] of Object.entries(activeMonthly(state))) {
    drift(state, key, state.stats[key] + val);
  }
}

function applyOfficeEffects(state) {
  const g = (k) => state.stats[k];
  const revenue = officeHolder(state, 'revenue');
  if (revenue) {
    drift(state, 'treasury', g('treasury') + revenue.abilities.politics / 40);
  } else {
    drift(state, 'treasury', g('treasury') - 3); // 戶部空缺：每月效率損失
  }
  const works = officeHolder(state, 'works');
  if (works) drift(state, 'armament', g('armament') + works.abilities.intellect / 200);
}

// 每月結算（Phase 2 暫定公式，待無頭模擬校準）
export function monthlyTick(state, rng) {
  const r = rng ?? makeRng(['tick', state.turn]);
  const g = (k) => state.stats[k];

  drift(state, 'treasury', g('treasury') + Math.round((g('agriculture') + g('commerce')) / 60) - 12);
  drift(state, 'people', g('people') + (g('benevolence') - 150) / 300);
  drift(state, 'agriculture', g('agriculture') + (g('people') > 50 ? 0.5 : -0.5));
  drift(state, 'population', g('population') * (1 + 0.001 * (g('people') / 60 - 1)));
  drift(state, 'health', g('health') - 0.1);
  drift(state, 'charm', g('charm') + (g('health') >= 50 ? 1.5 : 0)); // 後宮成長（暫定）
  if (state.facilities) applyFacilityMonthly(state); // 宮城設施每月加成（無設施時為 no-op）

  applyOfficeEffects(state);
  applyPolicyEffects(state);
  tickEconomy(state);
  applyPrefectureYield(state);
  tickCity(state);
  tickHarem(state);
  applyWaijiaCoupling(state);
  const tp = taihouPenalty(state);
  if (tp) drift(state, 'power', g('power') + tp);
  applyFactionPressure(state);

  // 派系勢力影響官員忠誠：勢力高於中性則忠誠微升，低於則微降
  // 野心越高，忠誠每月流失越快（野心/200）；派系勢力則加減忠誠
  for (const o of state.officials) {
    if (isLoyaltyFrozen(state, o)) continue; // 君臣相得：忠誠不再月月流失（見 bonds.js）
    const influence = state.factions[o.faction];
    const drift = (influence - FACTION_BASE) / 100 - o.ambition / 200;
    o.loyalty = Math.min(100, Math.max(0, o.loyalty + drift));
  }

  applyTraitEffects(state);

  applyTyrannyDrift(state);
  tickDongchang(state, r);
  tickHeirs(state);
  tickCrownPrince(state);
  tickTutorTraits(state);
  tickTitles(state);

  // 太傅到任後，皇子教育事件才會出現
  if (officeHolder(state, 'tutor')) state.flags.tutor_appointed = true;

  if (g('health') <= 0) {
    state.alive = false;
    state.endReason = 'death';
  }

  // 刺殺：在月末死亡判定之後結算，皇帝遇刺身亡時 endReason 為 'assassinated'。
  if (state.alive) {
    const attempt = tickAssassination(state);
    if (attempt?.official) removeOfficial(state, attempt.official);
  }
  return state;
}

export function advanceMonth(state) {
  state.turn += 1;
  state.month += 1;
  if (state.month > 12) {
    state.month = 1;
    state.year += 1;
    state.age += 1;
    advanceHeirs(state);
  }
  if (state.alive && state.age >= 62) {
    state.alive = false;
    state.endReason = 'abdicated';
  }
  // 短局：滿 144 月即終局（不經繼位），結局評價沿用 evaluateDynasty。長局不在此處限制。
  if (state.alive && (state.mode ?? DEFAULT_MODE) === 'short' && state.turn >= modeMonths('short')) {
    state.alive = false;
    state.endReason = 'short_end';
  }
  return state;
}

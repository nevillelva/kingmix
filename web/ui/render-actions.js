// web/ui/render-actions.js：朝政行動（主選單與各子面板）、冊立東宮、時段卡與其分派（Canvas 版）。
// agencyAct／slotAct 為原 onAgency／onSlot 的分派邏輯，去除 DOM 事件；所有數值變化仍經引擎函式完成。
import { MAX_ACTIVE_CASES, activeCaseCount, openInvestigation } from '../../src/dongchang.js';
import { rallyFaction, suppressFaction } from '../../src/factions.js';
import { respondPartisanDemand } from '../../src/partisan.js';
import { POLICIES, POLICY_CHANGE_PRESTIGE_COST, POLICY_KEYS, changePolicy, policyLockRemaining } from '../../src/policy.js';
import { EXAM_INTERVAL_TURNS, examRemaining, holdExam } from '../../src/exam.js';
import { ERA_CHANGE_COOLDOWN_MONTHS, ERA_CHANGE_PRESTIGE_COST, ERA_REASON_TEXT, PRESET_ERAS, changeEra, eraCooldownRemaining, eraName, eraYearText } from '../../src/era.js';
import { CHANGE_CROWN_PRINCE_PRESTIGE_COST, chooseCrownPrince, eligibleCrownHeirs, heirFaction } from '../../src/heirs-choice.js';
import { TAX_TIERS, ensureEconomy, setTaxTier } from '../../src/economy.js';
import { REPAIR_COST, cityOf, ensureCity, repairCity } from '../../src/city.js';
import { ALLIANCE_MIN_ATTITUDE, DECLARE_WAR_LOSS, DECLARE_WAR_REWARD, INVEST_ATTITUDE, INVEST_COST, MARRIAGE_COST, MAX_ALLIANCES, NEIGHBORS, PRINCESS_ATTITUDE_GAIN, PRINCESS_TRUCE_MONTHS, TRADE_OPEN_COST, TRIBUTE_GAIN, TRIBUTE_MIN_ATTITUDE, acceptTribute, arrangeMarriage, diplomacyOf, eligiblePrincesses, formAlliance, investNeighbor, marryPrincess, neighborById, openTrade } from '../../src/diplomacy.js';
import { assignOffice, dismissOffice, suggestCandidate } from '../../src/offices.js';
import { startCampaign } from '../../src/campaign.js';
import { remonstrate } from '../../src/bonds.js';
import { SLOTS, canTakeSlot, slotCost, ensureAgency, periodLeft } from '../../src/slots.js';
import { takeSlot } from '../../src/slot-effects.js';
import { attemptAlchemy } from '../../src/side-events.js';
import { U } from './store.js';
import { rng } from './util.js';
import { FAC, FACTION, REASON, heirPersonLabel, officeName } from './labels.js';
import { sfx } from './audio.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { campAct } from './game-flow.js';
import { markNewYearShown, openNianhao } from './overlays.js';
import { handleCardAct } from './render-cards.js';
import { alchemyAvailability, alchemyResultText } from './render-side.js';
import { companionAct, setCourseAct } from './render-curriculum.js';
import { txt, vstack, boxed, optionCard, btn, spacer, feedbackItem } from './canvas/court.js';
import { C } from './canvas/core.js';

// ── 主動決策（Phase 6）：每月兩次行動，不推進時間 ──
export const ACTION_LIMIT = 2;

// 本月行動桶由引擎（src/slots.js ensureAgency）維護，此處僅讀取。
export function agency() { return ensureAgency(U.state); }
export function actionsLeft() { return ACTION_LIMIT - agency().used; }

export function useAction(msg) {
  agency().used += 1;
  U.feedback = msg; U.panel = null; U.pick1 = null;
  save(); render();
}

const MENU = [
  ['appoint', '任免官員', '至校場任命、免職，或依吏部建議'],
  ['dc', '東廠開案', '對一位官員展開調查，之後可在東廠頁處置'],
  ['policy', '變更國策', '改變每月的施政修正'],
  ['era', '改元', '更改年號，耗威儀 2 點，每 12 個月一次'],
  ['heir', '立儲', '擇一成年皇子立為太子；已立者可改立，耗威儀'],
  ['exam', '開科取士', ''],
  ['faction', '拉攏派系', '提升一派影響力，其他兩派會下降（每月限一派）'],
  ['suppress', '打壓派系', '壓抑一派影響力，其他兩派會上升（每月限一派）'],
  ['tax', '調整稅制', '三級稅制：低稅養民，高稅裕庫'],
  ['city', '修繕城池', '工匠修繕州府城防，耗國庫，增民心'],
  ['alchemy', '煉丹', '耗國庫，每月至多一次，或得健康與聲色，或受健康之損'],
  ['diplo', '外交', '聯姻、朝貢、結盟，或宣戰'],
];

// 朝政行動卡（主選單或目前子面板）。
export function actionsItem(w) {
  const left = actionsLeft();
  const dis = left <= 0;
  const panel = U.panel;
  const head = [];
  let cards = [];

  if (!panel) {
    cards = MENU.map(([k, l, h]) => {
      if (k === 'appoint') return optionCard(w, { mark: '校', label: l, hint: h, onClick: () => agencyAct('open', 'appoint') });
      if (k === 'alchemy') {
        const av = alchemyAvailability(U.state);
        return optionCard(w, { mark: '丹', label: l, hint: av.text, off: dis || !av.ok, onClick: () => agencyAct('alchemy') });
      }
      if (k === 'exam') {
        const r = examRemaining(U.state);
        const hint = r > 0 ? `每 ${EXAM_INTERVAL_TURNS} 個月一次，尚餘 ${r} 月` : `每 ${EXAM_INTERVAL_TURNS} 個月一次，招募 1–2 名進士`;
        return optionCard(w, { mark: '科', label: l, hint, off: dis || r > 0, onClick: () => agencyAct('exam') });
      }
      const factionLocked = (k === 'faction' || k === 'suppress') && !!agency().faction;
      return optionCard(w, { mark: '＋', label: l, hint: factionLocked ? '本月已對一派施壓' : h, off: dis || factionLocked, onClick: () => agencyAct('open', k) });
    });
  } else if (panel === 'dc') {
    head.push(txt('選擇要調查的官員', w, 13));
    const busy = new Set(U.state.dongchang.cases.filter(c => c.status !== 'closed').map(c => c.officialId));
    const pool = U.state.officials.filter(o => !busy.has(o.id));
    cards = pool.length
      ? pool.map(o => optionCard(w, { mark: (o.personName || o.name).slice(0, 1), label: o.personName || o.name, onClick: () => agencyAct('dcopen', o.id), off: dis }))
      : [txt('所有官員都已在調查中。', w, 13)];
  } else if (panel === 'policy') {
    const lock = policyLockRemaining(U.state);
    const locked = lock > 0 || U.state.stats.prestige < POLICY_CHANGE_PRESTIGE_COST;
    const hint = lock > 0 ? `換策後一年內不可再換，尚餘 ${lock} 月。` : `換策需耗威儀 ${POLICY_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    head.push(txt(`目前國策：${POLICIES[U.state.policy]?.name || U.state.policy}　${hint}`, w, 13));
    cards = POLICY_KEYS.map(k => optionCard(w, {
      mark: POLICIES[k].name.slice(0, 1), label: `${POLICIES[k].name}${k === U.state.policy ? '（現行）' : ''}`,
      off: dis || locked || k === U.state.policy, onClick: () => agencyAct('policy', k),
    }));
  } else if (panel === 'era') {
    const cd = eraCooldownRemaining(U.state);
    const cur = eraName(U.state);
    const blocked = cd > 0 || U.state.stats.prestige < ERA_CHANGE_PRESTIGE_COST;
    const hint = cd > 0 ? `改元每 ${ERA_CHANGE_COOLDOWN_MONTHS} 個月一次，尚餘 ${cd} 月。` : `改元需耗威儀 ${ERA_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    head.push(txt(`現行年號：${cur}　${hint}`, w, 13));
    const off = dis || blocked;
    cards = PRESET_ERAS.filter(n => n !== cur).map(n => optionCard(w, { mark: n.slice(0, 1), label: n, off, onClick: () => agencyAct('eraset', n) }));
    cards.push(btn(w, '自訂年號（1–4 字）…', () => {
      const raw = typeof window !== 'undefined' && window.prompt ? window.prompt('請輸入自訂年號（1–4 字）') : null;
      if (raw != null) agencyAct('eraconfirm', raw);
    }, { off, h: 36 * C.U, lac: false }));
  } else if (panel === 'heir') {
    const cands = eligibleCrownHeirs(U.state);
    const cur = U.state.dynasty.crownPrince;
    const curHeir = cur ? U.state.heirs.find(h => h.id === cur) : null;
    const costLocked = !!cur && U.state.stats.prestige < CHANGE_CROWN_PRINCE_PRESTIGE_COST;
    const hint = cur ? `改立需耗威儀 ${CHANGE_CROWN_PRINCE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}），新舊太子所屬派系支持互換。` : '首次立儲不耗威儀。';
    head.push(txt(`${curHeir ? `目前太子：${curHeir.personName || curHeir.name}` : '尚未立儲'}　${hint}`, w, 13));
    cards = cands.length
      ? cands.map(h => optionCard(w, {
          mark: (h.personName || h.name).slice(0, 1), label: `${h.personName || h.name}${h.id === cur ? '（太子）' : ''}`,
          hint: `${heirPersonLabel(h)}　${FAC(heirFaction(U.state, h)).l}之子`,
          off: dis || h.id === cur || costLocked, onClick: () => agencyAct('heir', h.id),
        }))
      : [txt('朝中無成年皇子。', w, 13)];
  } else if (panel === 'faction' || panel === 'suppress') {
    head.push(txt(panel === 'faction' ? '選擇要拉攏的一派' : '選擇要打壓的一派', w, 13));
    cards = Object.keys(FACTION).map(k => optionCard(w, {
      mark: FACTION[k].l.slice(0, 1), label: `${FACTION[k].l}　目前 ${Math.round(U.state.factions[k])}`,
      off: dis, onClick: () => agencyAct(panel, k),
    }));
  } else if (panel === 'tax') {
    const cur = ensureEconomy(U.state).tax;
    head.push(txt(`目前稅制：${cur}稅`, w, 13));
    cards = TAX_TIERS.map(t => optionCard(w, { mark: String(t), label: `${t}稅${t === cur ? '（現行）' : ''}`, off: dis || t === cur, onClick: () => agencyAct('tax', t) }));
  } else if (panel === 'city') {
    head.push(txt(`工匠修繕城池，耗國庫 ${REPAIR_COST}，每府每年一次`, w, 13));
    cards = ensureCity(U.state).map(p => {
      const done = p.repairedYear === U.state.year;
      return optionCard(w, { mark: p.name.slice(0, 1), label: p.name, hint: `城防 ${Math.round(p.defense)}${done ? '　本年已修' : ''}`, off: dis || done, onClick: () => agencyAct('repair', p.id) });
    });
  } else if (panel === 'diplo') {
    const d = diplomacyOf(U.state);
    head.push(txt('選擇鄰國', w, 13));
    cards = NEIGHBORS.map(n => {
      const s = d[n.id];
      const tags = [s.allied ? '盟國' : '', s.kin > 0 ? '聯姻中' : ''].filter(Boolean).join('・');
      return optionCard(w, { mark: n.name.slice(0, 1), label: n.name, hint: `好感 ${s.attitude}${tags ? '　' + tags : ''}`, off: dis, onClick: () => agencyAct('dneigh', n.id) });
    });
  } else if (panel === 'diplo2') {
    const n = neighborById(U.pick1);
    const d = n ? diplomacyOf(U.state)[n.id] : null;
    if (n) {
      head.push(txt(`與${n.name}：好感 ${d.attitude}${d.allied ? '（盟國）' : ''}`, w, 13));
      const paths = [
        ['marry', '聯姻', `花費國庫 ${MARRIAGE_COST}，好感 +15，二年內不易開戰`, false],
        ['tribute', '朝貢', `好感達 ${TRIBUTE_MIN_ATTITUDE}，得國庫 ${TRIBUTE_GAIN}、威儀 +1`, false],
        ['invest', '冊封', `花費國庫 ${INVEST_COST}，好感 +${INVEST_ATTITUDE}；此後每年自動朝貢`, false],
        ['trade', '互市', `花費國庫 ${TRADE_OPEN_COST}，每月得國庫小幅增益，久之產良馬`, false],
        ['ally', '結盟', `好感達 ${ALLIANCE_MIN_ATTITUDE}，最多 ${MAX_ALLIANCES} 國；盟國不可宣戰`, false],
        ['war', '宣戰', '三回合親征，成敗決於戰局與議和', true],
      ];
      cards = paths.map(([k, l, hh, war]) => optionCard(w, { mark: war ? '征' : '和', label: l, hint: hh, zhu: war, off: dis, onClick: () => agencyAct('dpath', k) }));
      for (const h of eligiblePrincesses(U.state)) {
        cards.push(optionCard(w, { mark: '女', label: `和親：${h.name}`, hint: `皇女出嫁，花費國庫 ${MARRIAGE_COST}，停戰 ${PRINCESS_TRUCE_MONTHS} 月，好感 +${PRINCESS_ATTITUDE_GAIN}`, off: dis, onClick: () => agencyAct('dprincess', h.id) }));
      }
    } else {
      cards = [txt('無此鄰國。', w, 13)];
    }
  }

  const cancel = panel ? [btn(Math.min(w, 160 * C.U), '取消', () => agencyAct('close'), { lac: false, h: 34 * C.U })] : [];
  return boxed(w, (iw) => vstack([
    txt('朝政行動', iw, 18, { weight: 'bold' }),
    txt(`本月剩餘 ${left} / ${ACTION_LIMIT} 次`, iw, 12, { color: '#7a5a3a' }),
    feedbackItem(U.feedback, iw),
    ...head,
    vstack(cards, 8),
    ...cancel,
  ], 8), { pad: 12, r: 10 });
}

// 冊立東宮：E125 選項 A 設定 crown_choice_pending 後顯示。不耗行動，無取消鈕，未選定前不自動指定。
export function crownChoiceItem(w) {
  if (!U.state.flags?.crown_choice_pending || U.state.dynasty.crownPrince) return spacer(0);
  const cands = eligibleCrownHeirs(U.state);
  return boxed(w, (iw) => vstack([
    txt('冊立東宮', iw, 18, { weight: 'bold' }),
    txt('群臣請早定國本，請陛下親定東宮人選（不耗行動）。', iw, 12, { color: '#7a5a3a' }),
    feedbackItem(U.feedback, iw),
    ...(cands.length
      ? cands.map(h => optionCard(iw, { mark: (h.personName || h.name).slice(0, 1), label: h.personName || h.name, hint: `${heirPersonLabel(h)}　${FAC(heirFaction(U.state, h)).l}之子`, onClick: () => agencyAct('crownpick', h.id) }))
      : [txt('朝中尚無成年皇子，待有成年男嗣再行冊立。', iw, 13)]),
  ], 8), { pad: 12, r: 10 });
}

// 時段卡：午後三選一、夜間二選一（設定見 src/slots.js）。每個選項映射到既有分頁或朝政行動面板。
export function slotsItems(w) {
  const exhausted = actionsLeft() <= 0;
  return Object.entries(SLOTS).map(([k, s]) => boxed(w, (iw) => vstack([
    txt(s.name, iw, 18, { weight: 'bold' }),
    txt(`${s.name}時段　・　${s.pick || '擇一而行'}`, iw, 12, { color: '#7a5a3a' }),
    ...s.opts.map(([id, l, h]) => {
      const ok = !!U.state && canTakeSlot(U.state, k, agency().used);
      return optionCard(iw, { mark: l.slice(0, 1), label: l, hint: `${h}　耗 ${slotCost(k, id)} 行動`, off: !ok, onClick: () => slotAct(k, id) });
    }),
    slotNote(exhausted, k, s, iw),
    s.note ? txt(s.note, iw, 12, { color: '#5a4a3a' }) : spacer(0),
  ], 8), { pad: 12, r: 10 }));
}

function slotNote(exhausted, k, s, iw) {
  const msg = exhausted ? '本月行動已用盡，待下月再議。' : (U.state && periodLeft(U.state, k) <= 0 ? `本${s.name}配額已用，待下一時段或下月再議。` : '');
  return msg ? txt(msg, iw, 12, { color: '#8a1f22' }) : spacer(0);
}

// 時段點選（原 onSlot）：扣配額後依效果切換分頁或朝政面板。
export function slotAct(k, id) {
  const s = SLOTS[k];
  const o = s && s.opts.find(x => x[0] === id);
  if (!o || !U.state || !U.state.alive) return;
  if (!takeSlot(U.state, k, o[0]).ok) return;
  save();
  const t = o[3];
  U.panel = null; U.pick1 = null; U.feedback = t.feedback || '';
  if (t.tab) U.tab = t.tab;
  if (t.panel) { U.tab = 'court'; U.panel = t.panel; }
  render();
}

// 朝政行動分派（原 onAgency）。已由其他卡片處理者回傳 true 之外，皆於此完成。
export function agencyAct(a, v) {
  if (!U.state) return;
  if (a !== 'close' && a !== 'open' && handleCardAct(a, v)) return;
  if (a === 'course') return setCourseAct(v);
  if (a === 'companion') return companionAct(v);
  if (a.startsWith('camp-')) return campAct(a, v);
  if (a === 'close') { U.panel = null; U.pick1 = null; return render(); }
  if (a === 'open') {
    if (v === 'appoint') { U.tab = 'officials'; U.panel = null; U.pick1 = null; return render(); } // 任免官員至校場（朝臣頁）
    U.panel = v; U.pick1 = null; return render();
  }
  if (a === 'exam') {
    const r = holdExam(U.state, rng('exam', U.state.year, U.state.month));
    if (!r.ok) {
      U.feedback = r.reason === 'cooldown' ? `開科每 ${EXAM_INTERVAL_TURNS} 月一次，尚餘 ${r.remaining} 月。` : '朝中官員已滿，無法開科。';
      save(); return render();
    }
    const names = r.added.map(id => { const o = U.state.officials.find(x => x.id === id); return o ? (o.personName || o.name) : id; }).join('、');
    return useAction(`開科取士，新進士${names}入朝，可任官。`);
  }
  if (a === 'office') { U.pick1 = v; U.panel = 'appoint2'; return render(); }
  if (a === 'dismiss') {
    const prev = dismissOffice(U.state, v);
    if (!prev) { U.feedback = `${officeName(v)}本無人任職。`; return render(); }
    return useAction(`免去${prev.personName || prev.name}之${officeName(v)}，官職暫缺。`);
  }
  if (a === 'suggest') {
    const c = suggestCandidate(U.state, v);
    if (!c) { U.feedback = '朝中無閒置之臣可薦。'; return render(); }
    const gaps = assignOffice(U.state, c.id, v);
    return useAction(`依吏部建議，任命${c.personName || c.name}為${officeName(v)}${gaps.length ? '（未達標，效果打折）' : ''}。`);
  }
  if (a === 'assign') {
    const off = U.state.officials.find(o => o.id === v);
    const gaps = assignOffice(U.state, v, U.pick1);
    const label = officeName(U.pick1);
    return useAction(`任命${off ? (off.personName || off.name) : ''}為${label}${gaps.length ? '（能力未達標，效果打折）' : ''}。`);
  }
  if (a === 'dcopen') {
    const off = U.state.officials.find(o => o.id === v);
    const c = openInvestigation(U.state, v);
    if (!c) return useAction(activeCaseCount(U.state) >= MAX_ACTIVE_CASES ? `東廠同時最多 ${MAX_ACTIVE_CASES} 案。` : '此官已有案件。');
    return useAction(`東廠開案調查${off ? (off.personName || off.name) : ''}。`);
  }
  if (a === 'policy') {
    const r = changePolicy(U.state, v);
    if (!r.ok) {
      const why = r.reason === 'locked' ? `換策後一年內不可再換，尚餘 ${r.remaining} 月。` : r.reason === 'prestige' ? '威儀不足，無法換策。' : '無法換策。';
      U.feedback = why; U.panel = null; U.pick1 = null; save(); return render();
    }
    return useAction(`國策改為${POLICIES[v].name}，耗威儀 ${POLICY_CHANGE_PRESTIGE_COST} 點。`);
  }
  if (a === 'eraset' || a === 'eraconfirm') {
    const r = changeEra(U.state, v);
    if (!r.ok) {
      U.feedback = r.reason === 'cooldown' ? `改元每 ${ERA_CHANGE_COOLDOWN_MONTHS} 個月一次，尚餘 ${r.remaining} 月。`
        : r.reason === 'prestige' ? `威儀不足，改元需 ${ERA_CHANGE_PRESTIGE_COST} 點。` : ERA_REASON_TEXT[r.reason];
      if (r.reason === 'cooldown' || r.reason === 'prestige') U.panel = null;
      U.pick1 = null; save(); return render();
    }
    markNewYearShown();
    openNianhao(eraYearText(U.state), '改元詔下，萬象更新。');
    return useAction(`改元為「${r.name}」，耗威儀 ${ERA_CHANGE_PRESTIGE_COST} 點。`);
  }
  if (a === 'crownpick') {
    const h = U.state.heirs.find(x => x.id === v);
    const r = chooseCrownPrince(U.state, v);
    if (!r.ok) { U.feedback = '所選皇子不合資格。'; save(); return render(); }
    U.feedback = `冊立${h ? (h.personName || h.name) : '皇子'}為太子。`;
    save(); return render();
  }
  if (a === 'heir') {
    const h = U.state.heirs.find(x => x.id === v);
    const nm = h ? (h.personName || h.name) : '某皇子';
    const r = chooseCrownPrince(U.state, v);
    if (!r.ok) {
      const why = r.reason === 'same' ? '此人已是太子。' : r.reason === 'prestige' ? '威儀不足，無法改立。' : '所選皇子不合資格。';
      U.feedback = why; U.panel = null; U.pick1 = null; save(); return render();
    }
    return useAction(r.changed ? `改立${nm}為太子，耗威儀 ${CHANGE_CROWN_PRINCE_PRESTIGE_COST} 點。` : `立${nm}為太子。`);
  }
  // 派系施壓（拉攏／打壓）：每月限一派，以 agency().faction 記錄。
  if (a === 'faction' || a === 'suppress') {
    if (agency().faction) { U.feedback = '本月已對一派施壓，下月再議。'; U.panel = null; U.pick1 = null; save(); return render(); }
    if (a === 'faction') { rallyFaction(U.state, v); agency().faction = true; return useAction(`拉攏${FACTION[v].l}，其餘兩派下降。`); }
    suppressFaction(U.state, v); agency().faction = true;
    return useAction(`打壓${FACTION[v].l}，其餘兩派上升。`);
  }
  if (a === 'tax') {
    setTaxTier(U.state, v);
    return useAction(`稅制改為${v}稅。`);
  }
  // 煉丹（側線）：經 side-events 引擎裁決；耗一次行動，成敗皆於朝政行動卡回報。
  if (a === 'alchemy') {
    const r = attemptAlchemy(U.state);
    if (!r.ok) { U.feedback = alchemyResultText(r); return render(); }
    return useAction(alchemyResultText(r));
  }
  if (a === 'repair') {
    const nm = cityOf(U.state, v)?.name || '';
    const r = repairCity(U.state, v);
    if (!r.ok) { U.feedback = `此舉未成：${REASON[r.reason] || '條件未符'}。`; return render(); }
    return useAction(`工匠修繕${nm}城池，城防提升。`);
  }
  if (a === 'dneigh') { U.pick1 = v; U.panel = 'diplo2'; return render(); }
  // 皇女和親（diplomacy.js marryPrincess）：v 為皇女 id，鄰國取自 U.pick1。
  if (a === 'dprincess') {
    const n = neighborById(U.pick1);
    if (!n) return render();
    const r = marryPrincess(U.state, n.id, v);
    if (!r.ok) { U.feedback = `此舉未成：${REASON[r.reason] || '條件未符'}。`; return render(); }
    return useAction(`皇女${r.name}出嫁${n.name}，兩國停戰${PRINCESS_TRUCE_MONTHS}月。`);
  }
  if (a === 'dpath') {
    const n = neighborById(U.pick1);
    if (!n) return render();
    let r, msg;
    if (v === 'marry') { r = arrangeMarriage(U.state, n.id); msg = `與${n.name}聯姻，兩國停戰二年。`; }
    else if (v === 'tribute') { r = acceptTribute(U.state, n.id); msg = `${n.name}遣使朝貢，國庫增益。`; }
    else if (v === 'ally') { r = formAlliance(U.state, n.id); msg = `與${n.name}結盟。`; }
    else if (v === 'invest') { r = investNeighbor(U.state, n.id); msg = `冊封${n.name}，其君奉表稱臣。`; }
    else if (v === 'trade') { r = openTrade(U.state, n.id); msg = `與${n.name}開通互市。`; }
    else { r = startCampaign(U.state, { strength: n.strength, reward: { ...DECLARE_WAR_REWARD }, loss: { ...DECLARE_WAR_LOSS } }, { neighborId: n.id }); msg = `宣戰${n.name}，親征出兵。`; if (r.ok) { U.state.campaign.title = `征討${n.name}`; } }
    if (!r.ok) { U.feedback = `此舉未成：${REASON[r.reason] || '條件未符'}。`; return render(); }
    if (v === 'war') { sfx('pick'); }
    return useAction(msg);
  }
  if (a === 'remon') {
    if (actionsLeft() <= 0) return;
    const off = U.state.officials.find(o => o.id === v);
    const r = remonstrate(U.state, v, rng('remon', U.state.year, U.state.month, v));
    if (!r) return render();
    const nm = off ? (off.personName || off.name) : '某臣';
    return useAction(r.died ? `${nm}進諫忤旨，被貶除名。` : `${nm}進諫，陛下納諫，君臣更見相得。`);
  }
  // 黨爭裁決（見 partisan.js）：v 為「訴求 id:回應」。
  if (a === 'partisan') {
    if (actionsLeft() <= 0) return;
    const [id, response] = String(v).split(':');
    const r = respondPartisanDemand(U.state, Number(id), response);
    if (!r.ok) {
      U.feedback = r.reason === 'dc_busy' ? '東廠案件已滿，清洗暫緩，訴求仍待裁決。' : '此訴求已了。';
      return render();
    }
    const msg = {
      balanced: '駁回聯名彈劾，平衡各方，耗皇權。',
      rallied: '扶植進逼之派，其餘兩派下降。',
      purged: '血腥清洗敵對派系，暴政上升，朝臣忠誠下滑。',
      warned: '東廠案件已滿，清洗改為告誡。',
      lapsed: '被彈劾者已不在朝，訴求作廢。',
    }[r.outcome];
    return useAction(msg);
  }
}

export { MENU };

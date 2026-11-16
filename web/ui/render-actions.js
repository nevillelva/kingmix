// web/ui/render-actions.js：朝政行動卡、冊立東宮與時段卡（由 render-court.js 拆出，純搬移，行為不變）。
import { MAX_ACTIVE_CASES, activeCaseCount, openInvestigation } from '../../src/dongchang.js';
import { rallyFaction, suppressFaction } from '../../src/factions.js';
import { POLICIES, POLICY_CHANGE_PRESTIGE_COST, POLICY_KEYS, changePolicy, policyLockRemaining } from '../../src/policy.js';
import { EXAM_INTERVAL_TURNS, examRemaining, holdExam } from '../../src/exam.js';
import { ERA_CHANGE_COOLDOWN_MONTHS, ERA_CHANGE_PRESTIGE_COST, ERA_REASON_TEXT, PRESET_ERAS, changeEra, eraCooldownRemaining, eraName, eraYearText } from '../../src/era.js';
import { CHANGE_CROWN_PRINCE_PRESTIGE_COST, chooseCrownPrince, eligibleCrownHeirs, heirFaction } from '../../src/heirs-choice.js';
import { TAX_TIERS, ensureEconomy, setTaxTier } from '../../src/economy.js';
import { REPAIR_COST, cityOf, ensureCity, repairCity } from '../../src/city.js';
import { ALLIANCE_MIN_ATTITUDE, DECLARE_WAR_LOSS, DECLARE_WAR_REWARD, MARRIAGE_COST, MAX_ALLIANCES, NEIGHBORS, PRINCESS_ATTITUDE_GAIN, PRINCESS_TRUCE_MONTHS, TRIBUTE_GAIN, TRIBUTE_MIN_ATTITUDE, acceptTribute, arrangeMarriage, diplomacyOf, eligiblePrincesses, formAlliance, marryPrincess, neighborById } from '../../src/diplomacy.js';
import { assignOffice, dismissOffice, suggestCandidate } from '../../src/offices.js';
import { startCampaign } from '../../src/campaign.js';
import { remonstrate } from '../../src/bonds.js';
import { SLOTS, canTakeSlot, slotCost, ensureAgency, periodLeft, spendSlot } from '../../src/slots.js';
import { U } from './store.js';
import { esc, rng } from './util.js';
import { FAC, FACTION, REASON, heirPersonLabel, officeName } from './labels.js';
import { sfx } from './audio.js';
import { save } from './state-io.js';
import { render } from './render-bus.js';
import { campAct } from './game-flow.js';
import { markNewYearShown, openNianhao } from './overlays.js';
import { handleCardAct } from './render-cards.js';
import { alchemyAvailability, alchemyResultText } from './render-side.js';
import { attemptAlchemy } from '../../src/side-events.js';
import { companionAct, setCourseAct } from './render-curriculum.js';

// ── 主動決策（Phase 6）：每月兩次行動，不推進時間 ──
export const ACTION_LIMIT = 2;

// 本月行動桶由引擎（src/slots.js ensureAgency）維護，此處僅讀取。
export function agency(){ return ensureAgency(U.state); }

export function actionsLeft(){ return ACTION_LIMIT - agency().used; }

export function useAction(msg){
  agency().used += 1;
  U.feedback = msg; U.panel = null; U.pick1 = null;
  save(); render();
}

export function actionsCard(){
  const left = actionsLeft();
  const dis = left <= 0 ? 'disabled' : '';
  let body = '';
  if (!U.panel) {
    body = `<div class="opts">` + [
      ['appoint','任免官員','至校場任命、免職，或依吏部建議'],
      ['dc','東廠開案','對一位官員展開調查，之後可在東廠頁處置'],
      ['policy','變更國策','改變每月的施政修正'],
      ['era','改元','更改年號，耗威儀 2 點，每 12 個月一次'],
      ['heir','立儲','擇一成年皇子立為太子；已立者可改立，耗威儀'],
      ['exam','開科取士',''],
      ['faction','拉攏派系','提升一派影響力，其他兩派會下降（每月限一派）'],
      ['suppress','打壓派系','壓抑一派影響力，其他兩派會上升（每月限一派）'],
      ['tax','調整稅制','三級稅制：低稅養民，高稅裕庫'],
      ['city','修繕城池','工匠修繕州府城防，耗國庫，增民心'],
      ['alchemy','煉丹','耗國庫，每月至多一次，或得健康與聲色，或受健康之損'],
      ['diplo','外交','聯姻、朝貢、結盟，或宣戰'],
    ].map(([k,l,h]) => {
      if (k === 'appoint') return `<button class="opt" data-act="open" data-arg="appoint"><span class="mark">校</span><span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span></span></button>`;
      if (k === 'alchemy') {
        const av = alchemyAvailability(U.state);
        return `<button class="opt" data-act="alchemy" ${dis || (av.ok ? '' : 'disabled')}><span class="mark">丹</span><span class="otxt"><span class="label">${l}</span><span class="hint">${esc(av.text)}</span></span></button>`;
      }
      if (k === 'exam') {
        const r = examRemaining(U.state);
        const hint = r > 0 ? `每 ${EXAM_INTERVAL_TURNS} 個月一次，尚餘 ${r} 月` : `每 ${EXAM_INTERVAL_TURNS} 個月一次，招募 1–2 名進士`;
        return `<button class="opt" data-act="exam" ${dis || (r > 0 ? 'disabled' : '')}><span class="mark">科</span><span class="otxt"><span class="label">${l}</span><span class="hint">${hint}</span></span></button>`;
      }
      const factionLocked = (k === 'faction' || k === 'suppress') && agency().faction;
      return `<button class="opt" data-act="open" data-arg="${k}" ${dis || (factionLocked ? 'disabled' : '')}><span class="mark">＋</span><span class="otxt"><span class="label">${l}</span><span class="hint">${factionLocked ? '本月已對一派施壓' : h}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'dc') {
    const busy = new Set(U.state.dongchang.cases.filter(c => c.status !== 'closed').map(c => c.officialId));
    const pool = U.state.officials.filter(o => !busy.has(o.id));
    body = `<div class="sub">選擇要調查的官員</div><div class="opts">` + (pool.length
      ? pool.map(o => `<button class="opt" data-act="dcopen" data-arg="${o.id}" ${dis}><span class="mark">${esc((o.personName||o.name).slice(0,1))}</span><span class="label">${esc(o.personName||o.name)}</span></button>`).join('')
      : '<p class="empty">所有官員都已在調查中。</p>') + `</div>`;
  } else if (U.panel === 'policy') {
    const lock = policyLockRemaining(U.state);
    const locked = lock > 0 || U.state.stats.prestige < POLICY_CHANGE_PRESTIGE_COST;
    const hint = lock > 0 ? `換策後一年內不可再換，尚餘 ${lock} 月。` : `換策需耗威儀 ${POLICY_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    body = `<div class="sub">目前國策：${POLICIES[U.state.policy]?.name || U.state.policy}　<span class="hint">${hint}</span></div><div class="opts">` + POLICY_KEYS.map(k =>
      `<button class="opt" data-act="policy" data-arg="${k}" ${dis || ((locked || k===U.state.policy) ? 'disabled' : '')}><span class="mark">${POLICIES[k].name.slice(0,1)}</span><span class="label">${POLICIES[k].name}${k===U.state.policy?'（現行）':''}</span></button>`).join('') + `</div>`;
  } else if (U.panel === 'era') {
    const cd = eraCooldownRemaining(U.state);
    const cur = eraName(U.state);
    const blocked = cd > 0 || U.state.stats.prestige < ERA_CHANGE_PRESTIGE_COST;
    const hint = cd > 0 ? `改元每 ${ERA_CHANGE_COOLDOWN_MONTHS} 個月一次，尚餘 ${cd} 月。` : `改元需耗威儀 ${ERA_CHANGE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}）。`;
    const off = (dis || (blocked ? 'disabled' : ''));
    body = `<div class="sub">現行年號：${esc(cur)}　<span class="hint">${hint}</span></div><div class="opts">` + PRESET_ERAS.filter(n => n !== cur).map(n =>
      `<button class="opt" data-act="eraset" data-arg="${esc(n)}" ${off}><span class="mark">${esc(n.slice(0,1))}</span><span class="label">${esc(n)}</span></button>`).join('') + `</div>
      <label class="lbl" for="era-new">或自訂年號（1–4 字）</label>
      <input class="seed" id="era-new" placeholder="自訂年號">
      <button class="btn zhu" data-act="eraconfirm" ${off} style="margin-top:8px">以此改元</button>`;
  } else if (U.panel === 'heir') {
    const cands = eligibleCrownHeirs(U.state);
    const cur = U.state.dynasty.crownPrince;
    const curHeir = cur ? U.state.heirs.find(h => h.id === cur) : null;
    const costLocked = !!cur && U.state.stats.prestige < CHANGE_CROWN_PRINCE_PRESTIGE_COST;
    const hint = cur ? `改立需耗威儀 ${CHANGE_CROWN_PRINCE_PRESTIGE_COST} 點（目前 ${Math.round(U.state.stats.prestige)}），新舊太子所屬派系支持互換。` : '首次立儲不耗威儀。';
    body = `<div class="sub">${curHeir ? `目前太子：${esc(curHeir.personName || curHeir.name)}` : '尚未立儲'}　<span class="hint">${hint}</span></div><div class="opts">` + (cands.length
      ? cands.map(h => {
          const f = FAC(heirFaction(U.state, h)).l;
          const off = dis || (h.id === cur || costLocked ? 'disabled' : '');
          return `<button class="opt" data-act="heir" data-arg="${h.id}" ${off}><span class="mark">${esc((h.personName||h.name).slice(0,1))}</span><span class="otxt"><span class="label">${esc(h.personName||h.name)}${h.id===cur?'（太子）':''}</span><span class="hint">${heirPersonLabel(h)}　${f}之子</span></span></button>`;
        }).join('')
      : '<p class="empty">朝中無成年皇子。</p>') + `</div>`;
  } else if (U.panel === 'faction') {
    body = `<div class="sub">選擇要拉攏的一派</div><div class="opts">` + Object.keys(FACTION).map(k =>
      `<button class="opt" data-act="faction" data-arg="${k}" ${dis}><span class="mark" style="color:${FACTION[k].c};border-color:${FACTION[k].c}">${FACTION[k].l.slice(0,1)}</span><span class="label">${FACTION[k].l}　<span class="sub" style="margin:0">目前 ${Math.round(U.state.factions[k])}</span></span></button>`).join('') + `</div>`;
  } else if (U.panel === 'suppress') {
    body = `<div class="sub">選擇要打壓的一派</div><div class="opts">` + Object.keys(FACTION).map(k =>
      `<button class="opt" data-act="suppress" data-arg="${k}" ${dis}><span class="mark" style="color:${FACTION[k].c};border-color:${FACTION[k].c}">${FACTION[k].l.slice(0,1)}</span><span class="label">${FACTION[k].l}　<span class="sub" style="margin:0">目前 ${Math.round(U.state.factions[k])}</span></span></button>`).join('') + `</div>`;
  } else if (U.panel === 'tax') {
    const cur = ensureEconomy(U.state).tax;
    body = `<div class="sub">目前稅制：${cur}稅</div><div class="opts">` + TAX_TIERS.map(t =>
      `<button class="opt" data-act="tax" data-arg="${t}" ${dis || (t===cur?'disabled':'')}><span class="mark">${t}</span><span class="label">${t}稅${t===cur?'（現行）':''}</span></button>`).join('') + `</div>`;
  } else if (U.panel === 'city') {
    body = `<div class="sub">工匠修繕城池，耗國庫 ${REPAIR_COST}，每府每年一次</div><div class="opts">` + ensureCity(U.state).map(p => {
      const done = p.repairedYear === U.state.year;
      return `<button class="opt" data-act="repair" data-arg="${p.id}" ${dis || (done ? 'disabled' : '')}><span class="mark">${esc(p.name.slice(0,1))}</span>
        <span class="otxt"><span class="label">${esc(p.name)}</span><span class="hint">城防 ${Math.round(p.defense)}${done ? '　本年已修' : ''}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'diplo') {
    const d = diplomacyOf(U.state);
    body = `<div class="sub">選擇鄰國</div><div class="opts">` + NEIGHBORS.map(n => {
      const s = d[n.id];
      const tags = [s.allied ? '盟國' : '', s.kin > 0 ? '聯姻中' : ''].filter(Boolean).join('・');
      return `<button class="opt" data-act="dneigh" data-arg="${n.id}" ${dis}><span class="mark">${n.name.slice(0,1)}</span>
        <span class="otxt"><span class="label">${esc(n.name)}</span><span class="hint">好感 ${s.attitude}${tags ? '　' + tags : ''}</span></span></button>`;
    }).join('') + `</div>`;
  } else if (U.panel === 'diplo2') {
    const n = neighborById(U.pick1);
    const d = n ? diplomacyOf(U.state)[n.id] : null;
    body = n ? `<div class="sub">與${esc(n.name)}：好感 ${d.attitude}${d.allied ? '（盟國）' : ''}</div><div class="opts">` + [
      ['marry', '聯姻', `花費國庫 ${MARRIAGE_COST}，好感 +15，二年內不易開戰`, ''],
      ['tribute', '朝貢', `好感達 ${TRIBUTE_MIN_ATTITUDE}，得國庫 ${TRIBUTE_GAIN}、威儀 +1`, ''],
      ['ally', '結盟', `好感達 ${ALLIANCE_MIN_ATTITUDE}，最多 ${MAX_ALLIANCES} 國；盟國不可宣戰`, ''],
      ['war', '宣戰', '三回合親征，成敗決於戰局與議和', 'zhu'],
    ].map(([k, l, h, cls]) => `<button class="opt ${cls}" data-act="dpath" data-arg="${k}" ${dis}><span class="mark">${cls ? '征' : '和'}</span>
      <span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span></span></button>`).join('')
      + eligiblePrincesses(U.state).map(h => `<button class="opt" data-act="dprincess" data-arg="${esc(h.id)}" ${dis}><span class="mark">女</span>
      <span class="otxt"><span class="label">和親：${esc(h.name)}</span><span class="hint">皇女出嫁，花費國庫 ${MARRIAGE_COST}，停戰 ${PRINCESS_TRUCE_MONTHS} 月，好感 +${PRINCESS_ATTITUDE_GAIN}</span></span></button>`).join('')
      + `</div>`
      : '<p class="empty">無此鄰國。</p>';
  }
  const fb = U.feedback ? `<div class="sub" style="color:var(--green);margin:0 0 10px">${esc(U.feedback)}</div>` : '';
  return `<section class="card"><h2>朝政行動</h2>
    <div class="kicker">本月剩餘 ${left} / ${ACTION_LIMIT} 次</div>${fb}
    ${body}
    ${U.panel ? '<button class="btn ghost" data-act="close" style="margin-top:10px">取消</button>' : ''}
  </section>`;
}

// 冊立東宮：E125 選項 A 設定 crown_choice_pending 後，於朝堂顯示此卡。不耗行動，無取消鈕，未選定前不自動指定。
export function crownChoiceCard(){
  if (!U.state.flags?.crown_choice_pending || U.state.dynasty.crownPrince) return '';
  const cands = eligibleCrownHeirs(U.state);
  return `<section class="card"><h2>冊立東宮</h2>
    <div class="kicker">群臣請早定國本，請陛下親定東宮人選（不耗行動）。</div>
    ${U.feedback ? `<div class="sub" style="color:var(--green);margin:0 0 10px">${esc(U.feedback)}</div>` : ''}
    <div class="opts">` + (cands.length
      ? cands.map(h => `<button class="opt" data-act="crownpick" data-arg="${h.id}"><span class="mark">${esc((h.personName||h.name).slice(0,1))}</span><span class="otxt"><span class="label">${esc(h.personName||h.name)}</span><span class="hint">${heirPersonLabel(h)}　${FAC(heirFaction(U.state, h)).l}之子</span></span></button>`).join('')
      : '<p class="empty">朝中尚無成年皇子，待有成年男嗣再行冊立。</p>') + `</div></section>`;
}

export function onAgency(e){
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || !U.state) return;
  const a = b.dataset.act, v = b.dataset.arg;
  if (handleCardAct(a, v)) return;
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
    const raw = a === 'eraset' ? v : (document.getElementById('era-new')?.value ?? '');
    const r = changeEra(U.state, raw);
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
}

// ── 時段（gap-ui-slots）：早朝為奏摺卡；午後三選一、夜間二選一（設定見 src/slots.js）。
// 每個選項只映射到既有分頁或朝政行動面板，不消耗行動次數、不改引擎。
export function slotsCard(){
  const exhausted = actionsLeft() <= 0;
  return Object.entries(SLOTS).map(([k, s]) => `<section class="card" data-slot-card="${k}">
    <h2>${s.name}</h2><p class="slot-kicker">${s.name}時段　・　${s.pick || '擇一而行'}</p>
    <div class="opts">${s.opts.map(([id, l, h]) => {
      const ok = !!U.state && canTakeSlot(U.state, k, agency().used);
      return `<button class="opt" data-slot="${k}" data-arg="${id}" ${ok ? '' : 'disabled'}><span class="mark">${l.slice(0,1)}</span>
      <span class="otxt"><span class="label">${l}</span><span class="hint">${h}</span><span class="slot-cost">耗 ${slotCost(k, id)} 行動</span></span></button>`;
    }).join('')}</div>
    ${exhausted ? `<p class="slot-why">本月行動已用盡，待下月再議。</p>`
      : (U.state && periodLeft(U.state, k) <= 0 ? `<p class="slot-why">本${s.name}配額已用，待下一時段或下月再議。</p>` : '')}
    ${s.note ? `<p class="hint slot-note">${s.note}</p>` : ''}
  </section>`).join('');
}

export function onSlot(e){
  const b = e.target.closest('[data-slot]');
  if (!b || b.disabled || !U.state || !U.state.alive) return;
  const s = SLOTS[b.dataset.slot];
  const o = s && s.opts.find(x => x[0] === b.dataset.arg);
  if (!o) return;
  if (!spendSlot(U.state, b.dataset.slot, o[0]).ok) return;
  save();
  const t = o[3];
  U.panel = null; U.pick1 = null; U.feedback = t.feedback || '';
  if (t.tab) U.tab = t.tab;
  if (t.panel) { U.tab = 'court'; U.panel = t.panel; }
  render();
}

// web/ui/render-court.js：朝堂 Canvas 版彙整（東廠密報、早朝奏摺與次奏、朝政行動與時段、快進）與年終考評（史冊、邸報）。
// 畫面以 drawCourt(C)、drawReview(C) 登記於 core.js 的 registerScreen 使用；每幀重算，不寫入狀態。
import { pickSpeaker } from '../../src/speaker.js';
import { scenarioDef } from '../../src/scenarios.js';
import { DC_ACTIONS } from '../../src/dongchang.js';
import { buildGazette } from '../../src/gazette.js';
import { TACTICS } from '../../src/war.js';
import { MAX_ROUNDS, PEACE_TRIBUTE_COST, RECON_GRAIN_COST, WINS_NEEDED } from '../../src/campaign.js';
import { U } from './store.js';
import { DC_HINT, DC_LABEL } from './labels.js';
import { handleCardAct, has } from './render-cards.js';
import { C } from './canvas/core.js';
import { campaignActive, chooseDC, chooseOption, finishMonth, fastForward, morningPair, pendingCase, startEventCampaign, campAct } from './game-flow.js';
import { memorialItem, secondItem, chooseSecond, skipSecond, memo } from './render-memorial.js';
import { actionsItem, crownChoiceItem, slotsItems } from './render-actions.js';
import { txt, vstack, hrow, boxed, optionCard, btn, spacer, tag, screenInner, paintStack, setContentHeight, stampThen, installSwipe, drawTextEntry, guarded } from './canvas/court.js';

const GAP = () => 12 * C.U;

// 本紀結果橫幅（劇本達成或失敗時顯示於朝堂頂端）。
function scenarioItem(w) {
  const s = U.state.scenario;
  if (!s || s.status === 'ongoing') return spacer(0);
  const def = scenarioDef(s.id);
  if (!def) return spacer(0);
  return boxed(w, (iw) => vstack([
    txt('本紀結果', iw, 12, { color: '#7a5a3a' }),
    txt(`${def.name}・${s.status === 'won' ? '成功' : '失敗'}`, iw, 18, { weight: 'bold' }),
    txt(`${def.goalText}　國祚未盡，仍可續治。`, iw, 13),
  ], 4), { pad: 12, r: 10 });
}

// 東廠密報：把柄裁決三選一，另可稍後處理（走 render-cards 的 defer）。
function dcItem(w, dc) {
  const off = U.state.officials.find(o => o.id === dc.officialId);
  return boxed(w, (iw) => vstack([
    tag('東廠密報'),
    txt('密報・把柄', iw, 12, { color: '#7a5a3a' }),
    txt(`${off ? (off.personName || off.name) : '某官'} 查有把柄`, iw, 20, { weight: 'bold' }),
    txt(`把柄等級 ${dc.level}。請裁決如何處置：`, iw, 13),
    vstack(DC_ACTIONS.map((a, i) => optionCard(iw, {
      mark: String(i + 1), label: DC_LABEL[a], hint: DC_HINT[a], zhu: true, stampKey: `dc${i}`,
      onClick: guarded(() => stampThen(`dc${i}`, () => chooseDC(a))),
    })), 8),
    deferBtn(iw, dc),
  ], 8), { pad: 12, r: 10 });
}

// 稍後處理：與舊版相同，引擎未就緒（無 deferLeverage）時停用並註明。
function deferBtn(iw, dc) {
  const ok = has('deferLeverage');
  return btn(Math.min(iw, 220 * C.U), ok ? '稍後處理' : '稍後處理（引擎尚未就緒）', guarded(() => handleCardAct('defer', dc.id ?? dc.officialId)), { lac: false, h: 34 * C.U, off: !ok, why: '引擎尚未就緒' });
}

// 本月無奏摺。
function quietItem(w) {
  return boxed(w, (iw) => vstack([
    tag('本月'),
    txt('風平浪靜', iw, 20, { weight: 'bold' }),
    txt('此月無奏摺上呈。', iw, 13),
    btn(Math.min(iw, 160 * C.U), '進入下月', () => finishMonth(), { h: 38 * C.U }),
  ], 8), { pad: 12, r: 10 });
}

// 親征中的軍務卡（與舊 campaignCard 的主要功能相同：偵察、戰術、議和、歲幣求和）。
// 戰局條與細部提示由 render-campaign.js 的 Canvas 版接手後可改用其函式。
function campaignItem(w) {
  const c = U.state.campaign;
  const scouted = c.intel === 'scouted';
  const canRecon = c.round === 0 && !scouted;
  return boxed(w, (iw) => vstack([
    tag(`軍務・${c.title || '親征'}`),
    txt(`第 ${Math.min(c.round + 1, MAX_ROUNDS)} 回合　・　己勝 ${c.ourWins}　敵勝 ${c.enemyWins}`, iw, 14, { weight: 'bold' }),
    txt(`至多 ${MAX_ROUNDS} 回合，先勝 ${WINS_NEEDED} 回合者勝。粮草 ${Math.floor(c.grain)}。敵情：${scouted ? `約 ${c.estimate}（誤差約 ±8%）` : '未明'}`, iw, 12),
    vstack(Object.entries(TACTICS).map(([k, t]) => optionCard(iw, {
      mark: t.label.slice(0, 1), label: t.label, zhu: true,
      hint: `耗粮 ${t.grain}${c.grain < t.grain ? '（粮草不足，戰力減損）' : ''}${t.gambleChance ? '　（有賭運，成敗難料）' : ''}`,
      onClick: () => campAct('camp-tactic', k),
    })), 6),
    canRecon ? btn(iw, `遣探偵察（耗粮 ${RECON_GRAIN_COST}）`, () => campAct('camp-recon'), { lac: false, h: 34 * C.U }) : spacer(0),
    btn(iw, '遣使議和', () => campAct('camp-peace'), { lac: false, h: 34 * C.U }),
    btn(iw, `歲幣求和（國庫 ${PEACE_TRIBUTE_COST}）`, () => campAct('camp-tribute'), { lac: false, h: 34 * C.U }),
  ], 8), { pad: 12, r: 10 });
}

// 上次戰報（與舊 lastBattleCard 相同之內容：戰役名與逐回合紀錄）。
function lastBattleItem(w) {
  const b = U.lastBattle;
  if (!b) return spacer(0);
  return boxed(w, (iw) => vstack([
    txt('上次戰報', iw, 12, { color: '#7a5a3a' }),
    txt(b.title || '親征', iw, 16, { weight: 'bold' }),
    ...b.lines.map(l => txt(l, iw, 13)),
  ], 4), { pad: 12, r: 10 });
}

// 快進卡（太和殿）：遇停止條件即停，停下之說明於此顯示。
export function ffItem(w) {
  if (!U.state || !U.state.alive) return spacer(0);
  return boxed(w, (iw) => vstack([
    txt('快進', iw, 18, { weight: 'bold' }),
    txt('系統代為批閱奏摺；遇駕崩、親征、東廠把柄，或國庫、民心、皇權告急即停。', iw, 12),
    U.ffNote ? txt(U.ffNote, iw, 13, { color: '#8a1f22' }) : spacer(0),
    btn(Math.min(iw, 200 * C.U), '快進 12 個月', fastForward, { h: 38 * C.U }),
  ], 6), { pad: 12, r: 10 });
}

// 朝政行動區：冊立東宮、朝政行動、時段、上次戰報（僅無待決案件且存活時）。
function actionsSection(w) {
  if (pendingCase() || !U.state.alive) return [];
  return [crownChoiceItem(w), actionsItem(w), ...slotsItems(w), lastBattleItem(w)];
}

const secondHandlers = {
  onPick: (o, e, key) => stampThen(key, () => chooseSecond(o, e)),
  onSkip: skipSecond,
};

// 朝堂畫面的全部區塊（由上而下）。
export function courtItems(w) {
  memo.n = 0; // 首奏未顯示時，左右滑動不作用
  const items = [scenarioItem(w)];
  if (campaignActive()) { items.push(campaignItem(w), ...actionsSection(w)); return items; }
  const dc = pendingCase();
  if (dc) { items.push(dcItem(w, dc)); return items; }
  const { first: ev, second: ev2, secondDone } = morningPair();
  const showSecond = !!ev2 && !secondDone;
  const sp = ev ? pickSpeaker(U.state, ev) : null;
  if (!ev) {
    if (showSecond) items.push(secondItem(ev2, pickSpeaker(U.state, ev2), w, secondHandlers));
    else items.push(quietItem(w));
  } else {
    items.push(memorialItem(ev, sp, w, {
      onPick: (o, e, key) => stampThen(key, () => chooseOption(o, e)),
      onCamp: (o, e) => startEventCampaign(o, e),
    }));
    if (showSecond) items.push(secondItem(ev2, pickSpeaker(U.state, ev2), w, secondHandlers));
  }
  items.push(...actionsSection(w));
  items.push(ffItem(w));
  return items;
}

// 朝堂畫面（registerScreen 使用）。
export function drawCourt(Cx) {
  installSwipe(Cx.canvas);
  const L = screenInner(Cx);
  const bottom = paintStack(courtItems(L.w), L.x, L.top, L.w, GAP());
  setContentHeight(bottom);
  drawTextEntry();
}

// ── 年終考評（史冊）與邸報：歲末結算後展開，收卷即回宮城 ──
export function reviewPending() { return (U.state.annals || []).length > U.reviewedCount; }

function cellItem(a, p, label, k, w) {
  let delta;
  if (!p) delta = { t: '首年考評', color: '#5a4a3a' };
  else {
    const d = a[k] - p[k];
    delta = { t: d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '— 持平', color: d > 0 ? '#1f5a3a' : d < 0 ? '#8a1f22' : '#5a4a3a' };
  }
  return vstack([
    txt(label, w, 12, { color: '#7a5a3a', align: 'center' }),
    txt(String(a[k]), w, 20, { weight: 'bold', align: 'center' }),
    txt(delta.t, w, 12, { color: delta.color, align: 'center' }),
  ], 2);
}

// 四格横列：make(cw) 依格寬建構各格。
function ribbonItem(w, make) {
  const gap = 8 * C.U;
  const cw = (w - 3 * gap) / 4;
  return hrow(make(cw).map(c => ({ w: cw, item: c })), gap);
}

function scoreItems(w) {
  const list = U.state.annals, a = list[list.length - 1], p = list[list.length - 2];
  return [
    txt(`年終考評 · 第${a.generation}世`, w, 12, { align: 'center', color: '#7a5a3a' }),
    txt(`史冊・${a.year}年`, w, 22, { weight: 'bold', align: 'center' }),
    txt('歲末考評，陛下治國之績如下', w, 13, { align: 'center', color: '#5a4a3a' }),
    ribbonItem(w, cw => [cellItem(a, p, '國庫', 'treasury', cw), cellItem(a, p, '民心', 'people', cw), cellItem(a, p, '兵力', 'military', cw), cellItem(a, p, '農業', 'agriculture', cw)]),
    txt(`征戰　${a.wars} 次，勝 ${a.wins} 次`, w, 14),
    txt(`朝臣 ${a.officials} 人，嬪妃 ${a.consorts} 人，東廠未結案 ${a.dc} 件。史官記之，留待後世評說。`, w, 13),
    btn(Math.min(w, 160 * C.U), '續閱邸報', () => { U.reviewPage = 'gazette'; }, { h: 38 * C.U }),
  ];
}

function gazetteItems(w) {
  const list = U.state.annals, a = list[list.length - 1];
  const g = buildGazette(U.state, a.year);
  const cell = (label, k, cw) => {
    const v = g.deltas[k];
    let t = '首年';
    let color = '#5a4a3a';
    if (v !== null && v !== undefined) {
      t = v > 0 ? `▲ ${v}` : v < 0 ? `▼ ${-v}` : '— 持平';
      color = v > 0 ? '#1f5a3a' : v < 0 ? '#8a1f22' : '#5a4a3a';
    }
    return vstack([
      txt(label, cw, 12, { color: '#7a5a3a', align: 'center' }),
      txt(String(a[k]), cw, 20, { weight: 'bold', align: 'center' }),
      txt(t, cw, 12, { color, align: 'center' }),
    ], 2);
  };
  const lines = g.lines.map(l => {
    const lw = w * 0.7;
    return hrow([
      { w: lw, item: txt(l.text, lw, 13) },
      { w: w - lw - 8 * C.U, item: txt(l.tag, w - lw - 8 * C.U, 12, { color: '#7a5a3a', align: 'right' }) },
    ], 8 * C.U);
  });
  return [
    txt(`邸報 · 第${g.generation}世`, w, 12, { align: 'center', color: '#7a5a3a' }),
    txt(`邸報・${g.year}年`, w, 22, { weight: 'bold', align: 'center' }),
    txt('歲末邸報，述一年朝政大要', w, 13, { align: 'center', color: '#5a4a3a' }),
    ribbonItem(w, cw => [cell('國庫', 'treasury', cw), cell('民心', 'people', cw), cell('兵力', 'military', cw), cell('農業', 'agriculture', cw)]),
    txt(`征戰　${a.wars} 次，勝 ${a.wins} 次`, w, 14),
    txt('本年紀事', w, 15, { weight: 'bold' }),
    ...(lines.length ? lines : [txt('本年無大事記載。', w, 13)]),
    btn(Math.min(w, 180 * C.U), '收卷，回宮城', () => {
      U.reviewedCount = list.length; U.reviewPage = 'score'; U.tab = 'palace'; C.scroll = 0;
    }, { h: 38 * C.U, red: true }),
  ];
}

// 年終考評畫面（史冊或邸報）。
export function drawReview(Cx) {
  const L = screenInner(Cx);
  const items = U.reviewPage === 'gazette' ? gazetteItems(L.w) : scoreItems(L.w);
  const card = boxed(L.w, (iw) => vstack(items, 8 * C.U), { pad: 14, r: 12 });
  const bottom = paintStack([card], L.x, L.top, L.w, GAP());
  setContentHeight(bottom);
  drawTextEntry();
}

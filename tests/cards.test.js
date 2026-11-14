import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, BOUNDS } from '../src/state.js';
import { POLICY_CARDS, POLICY_CARD_IDS, SYNERGIES, CARD_TAGS, MAX_ACTIVE_CARDS, drawPolicyCards, choosePolicyCard, activeSynergies, activeCards } from '../src/cards.js';
import { activeMonthly, POLICIES } from '../src/policy.js';
import { monthlyTick, advanceMonth } from '../src/turn.js';
import { makeRng } from '../src/rng.js';

test('卡池至少 12 張，且每張卡的標籤皆為定義過的標籤、月修正鍵皆在 BOUNDS 內', () => {
  assert.ok(POLICY_CARD_IDS.length >= 12);
  for (const id of POLICY_CARD_IDS) {
    const c = POLICY_CARDS[id];
    assert.ok(c.name && c.tags.length >= 1, id);
    for (const t of c.tags) assert.ok(Object.keys(CARD_TAGS).includes(t), `${id} tag ${t}`);
    for (const k of Object.keys(c.monthly)) assert.ok(BOUNDS[k], `${id} stat ${k}`);
  }
});

test('協同至少 3 組，且標籤皆合法、各組兩標籤不同', () => {
  assert.ok(SYNERGIES.length >= 3);
  for (const syn of SYNERGIES) {
    assert.equal(syn.tags.length, 2);
    assert.notEqual(syn.tags[0], syn.tags[1]);
    for (const t of syn.tags) assert.ok(Object.keys(CARD_TAGS).includes(t), `${syn.id} ${t}`);
    for (const k of Object.keys(syn.monthly)) assert.ok(BOUNDS[k], `${syn.id} stat ${k}`);
  }
});

test('每年抽 3 張不重複、皆在卡池內，且同 rng 可重現', () => {
  const s = createInitialState('card-draw');
  const a = drawPolicyCards(s, makeRng(['cards', 1]));
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  for (const id of a) assert.ok(POLICY_CARD_IDS.includes(id));
  const b = drawPolicyCards(createInitialState('card-draw'), makeRng(['cards', 1]));
  assert.deepEqual(a, b);
});

test('擇卡：只能選本年抽出的卡，選後入槽並清空抽卡結果', () => {
  const s = createInitialState('card-choose');
  const offer = drawPolicyCards(s, makeRng(['c', 2]));
  const notOffered = POLICY_CARD_IDS.find((id) => !offer.includes(id));
  assert.throws(() => choosePolicyCard(s, notOffered), /not offered/);
  assert.equal(choosePolicyCard(s, offer[0]), s);
  assert.deepEqual(activeCards(s), [offer[0]]);
  assert.throws(() => choosePolicyCard(s, offer[1]), /not offered/, '擇後 offer 已清空');
});

test('卡槽上限：超過時最早收入的卡退出', () => {
  const s = createInitialState('card-cap');
  const picked = [];
  for (let y = 0; y < MAX_ACTIVE_CARDS + 2; y++) {
    const offer = drawPolicyCards(s, makeRng(['cap', y]));
    choosePolicyCard(s, offer[0]);
    picked.push(offer[0]);
  }
  assert.equal(activeCards(s).length, MAX_ACTIVE_CARDS);
  assert.deepEqual(activeCards(s), picked.slice(-MAX_ACTIVE_CARDS));
});

test('抽卡排除已在槽中的卡', () => {
  const s = createInitialState('card-excl');
  const first = drawPolicyCards(s, makeRng(['e', 1]));
  choosePolicyCard(s, first[0]);
  const next = drawPolicyCards(s, makeRng(['e', 2]));
  assert.ok(!next.includes(first[0]));
});

test('協同需兩張不同的卡：單張卡身兼兩標籤不觸發', () => {
  const s = createInitialState('syn-single');
  s.policyCards = { active: ['land_grant'], offer: null }; // 農+民 同一張卡
  assert.ok(!activeSynergies(s).some((x) => x.id === 'nong_min'));
  s.policyCards.active.push('light_tax'); // 民 來自另一張
  assert.ok(activeSynergies(s).some((x) => x.id === 'nong_min'));
});

test('協同：各組皆可由具體卡組合觸發', () => {
  const pairs = {
    nong_min: ['irrigation', 'light_tax'],
    shang_cai: ['sea_trade', 'salt_monopoly'],
    wen_wu: ['confucian_school', 'arms_drill'],
    quan_bing: ['strict_law', 'arms_drill'],
  };
  for (const [synId, cards] of Object.entries(pairs)) {
    const s = createInitialState(`syn-${synId}`);
    s.policyCards = { active: cards, offer: null };
    assert.ok(activeSynergies(s).some((x) => x.id === synId), synId);
  }
});

test('卡與協同的月修正併入 activeMonthly；無卡時與原本國策完全相同', () => {
  const s = createInitialState('card-monthly');
  assert.deepEqual(activeMonthly(s), { ...POLICIES.agrarian.monthly });
  s.policyCards = { active: ['irrigation', 'light_tax'], offer: null };
  const m = activeMonthly(s);
  assert.ok(Math.abs(m.agriculture - (POLICIES.agrarian.monthly.agriculture + 0.6 + 0.3)) < 1e-9, '含農協同');
  assert.ok(Math.abs(m.people - (POLICIES.agrarian.monthly.people + 0.2 + 0.2)) < 1e-9, '含民協同');
});

test('策卡生效 40 年：所有屬性與國庫維持在 BOUNDS 內（多 seed）', () => {
  for (const seed of ['b1', 'b2', 'b3']) {
    const s = createInitialState(seed);
    for (let y = 0; y < 40; y++) {
      const offer = drawPolicyCards(s, makeRng([seed, 'draw', y]));
      choosePolicyCard(s, offer[y % 3]);
      for (let m = 0; m < 12 && s.alive; m++) {
        monthlyTick(s, makeRng([seed, y, m]));
        advanceMonth(s);
      }
    }
    for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
      const v = s.stats[k];
      if (v !== undefined) assert.ok(v >= lo && v <= hi, `${seed} ${k}=${v}`);
    }
  }
});

// ── 策卡擇定回饋與生效策卡列（web/ui/render-cards.js）。模組依賴 DOM，此處以最小替身載入。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
}
const RC = await import('../web/ui/render-cards.js');
const { U } = await import('../web/ui/store.js');
await new Promise((r) => setTimeout(r, 50)); // 等待可選引擎非同步載入

test('擇定策卡後回饋列出卡名與效果，且生效策卡列同步顯示', () => {
  U.state = { alive: true, year: 2, month: 1, flags: {}, policyCards: { active: [], offer: ['sea_trade', 'irrigation', 'light_tax'] } };
  U.feedback = '';
  try { RC.handleCardAct('pickcard', 'sea_trade'); } catch (e) { /* 替身 DOM 無法完整重繪，僅驗證訊息 */ }
  assert.equal(U.feedback, '已定策卡：開海通商（商業 +0.6　國庫 +2），施行於本年。');
  assert.deepEqual(U.state.policyCards.active, ['sea_trade']);
  const line = RC.activeCardsLine();
  assert.match(line, /生效策卡：開海通商（商業 \+0\.6　國庫 \+2）/);
});

test('無生效策卡時不顯示生效策卡列', () => {
  U.state = { alive: true, year: 3, month: 5, flags: {}, policyCards: { active: [], offer: null } };
  assert.equal(RC.activeCardsLine(), '');
});

// 開局策卡：3–5 張本局卡池、驗證、同種子可重現、存檔相容、未選擇時行為不變。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { prepareMonth } from '../src/month-start.js';
import {
  POLICY_CARD_IDS, OPENING_DECK_MIN, OPENING_DECK_MAX, openingPoolIds, setOpeningDeck, drawPolicyCards, choosePolicyCard,
} from '../src/cards.js';
import { makeRng } from '../src/rng.js';

const { events } = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

test('開局策卡張數範圍為 3–5，卡池為全部定義過的策卡', () => {
  assert.equal(OPENING_DECK_MIN, 3);
  assert.equal(OPENING_DECK_MAX, 5);
  assert.deepEqual(openingPoolIds(null), POLICY_CARD_IDS);
  assert.deepEqual(openingPoolIds(createInitialState('pool')), POLICY_CARD_IDS);
});

test('setOpeningDeck 拒絕張數不足、超過、重複與不在卡池內的卡', () => {
  const s = createInitialState('deck-reject');
  assert.throws(() => setOpeningDeck(s, ['land_grant', 'irrigation']), /size/);
  assert.throws(() => setOpeningDeck(s, POLICY_CARD_IDS.slice(0, 6)), /size/);
  assert.throws(() => setOpeningDeck(s, ['land_grant', 'land_grant', 'irrigation']), /duplicates/);
  assert.throws(() => setOpeningDeck(s, ['land_grant', 'irrigation', 'no_such_card']), /not in pool/);
  assert.throws(() => setOpeningDeck(s, 'land_grant'), /array/);
  assert.equal(s.policyCards?.deck ?? null, null, '失敗時不應寫入狀態');
});

test('setOpeningDeck 依卡池順序正規化，與點選順序無關', () => {
  const a = createInitialState('deck-order');
  const b = createInitialState('deck-order');
  setOpeningDeck(a, ['sea_trade', 'land_grant', 'arms_drill']);
  setOpeningDeck(b, ['arms_drill', 'sea_trade', 'land_grant']);
  assert.deepEqual(a.policyCards.deck, b.policyCards.deck);
  assert.deepEqual(a.policyCards.deck, POLICY_CARD_IDS.filter((id) => ['land_grant', 'sea_trade', 'arms_drill'].includes(id)));
});

test('本局卡池設定後，抽卡只從卡池抽出，且同種子同結果', () => {
  const deck = ['land_grant', 'irrigation', 'sea_trade', 'arms_drill', 'civil_exam'];
  const run = () => {
    const s = createInitialState('deck-draw');
    setOpeningDeck(s, deck);
    return drawPolicyCards(s, makeRng(['deck-draw', 1, 'policycards']));
  };
  const first = run();
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  for (const id of first) assert.ok(deck.includes(id), id);
  assert.deepEqual(run(), first);
});

test('卡池為 3 張時，開局即全數抽出；已採用者不再進入後續抽卡', () => {
  const s = createInitialState('deck-three');
  setOpeningDeck(s, ['land_grant', 'irrigation', 'sea_trade']);
  const offer = drawPolicyCards(s, makeRng(['deck-three', 1, 'policycards']));
  assert.deepEqual([...offer].sort(), ['irrigation', 'land_grant', 'sea_trade']);
  choosePolicyCard(s, offer[0]);
  const next = drawPolicyCards(s, makeRng(['deck-three', 2, 'policycards']));
  assert.ok(!next.includes(offer[0]));
});

test('未設定本局卡池時，抽卡與原本全部卡池一致（既有行為不變）', () => {
  const s = createInitialState('deck-none');
  const got = drawPolicyCards(s, makeRng(['deck-none', 1, 'policycards']));
  const ref = createInitialState('deck-none');
  ref.policyCards = { active: [], offer: null };
  assert.deepEqual(drawPolicyCards(ref, makeRng(['deck-none', 1, 'policycards'])), got);
  assert.equal(s.policyCards.deck, undefined);
});

test('月初準備（首年正月）會依本局卡池抽卡，且同種子同選擇結果一致', () => {
  const deck = ['confucian_school', 'strict_law', 'garrison', 'mercy_relief'];
  const open = () => {
    const s = createInitialState('deck-month');
    setOpeningDeck(s, deck);
    s.month = 1;
    prepareMonth(s, events);
    return s;
  };
  const a = open();
  const b = open();
  assert.ok(a.policyCards.offer.length > 0);
  for (const id of a.policyCards.offer) assert.ok(deck.includes(id), id);
  assert.deepEqual(a.policyCards.offer, b.policyCards.offer);
  assert.deepEqual(a.policyCards.deck, b.policyCards.deck);
});

test('存檔往返保留本局卡池；舊存檔無 deck 欄位時沿用全部卡池', () => {
  const s = createInitialState('deck-save');
  setOpeningDeck(s, ['land_grant', 'irrigation', 'sea_trade']);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy.policyCards.deck, ['land_grant', 'irrigation', 'sea_trade']);
  const legacy = JSON.parse(JSON.stringify(createInitialState('deck-old')));
  legacy.policyCards = { active: [], offer: null };
  const offer = drawPolicyCards(legacy, makeRng(['deck-old', 1, 'policycards']));
  for (const id of offer) assert.ok(POLICY_CARD_IDS.includes(id), id);
});

test('傳承解鎖掛點：state.legacyUnlocks.policyCards 中未定義的卡忽略，卡池不變', () => {
  const s = createInitialState('deck-unlock');
  s.legacyUnlocks = { policyCards: ['no_such_card'] };
  assert.deepEqual(openingPoolIds(s), POLICY_CARD_IDS);
});

// 策卡國策：每年自卡池抽 3 張，玩家擇 1 張收入施政卡槽。卡槽內的卡每月提供修正；
// 卡牌帶有「標籤」，兩張不同卡各帶一個指定標籤時觸發協同加成（見 SYNERGIES）。
// 數值為暫定值：月修正皆在 BOUNDS 範圍內，且不動朝臣忠誠／派系，以免影響死諫與君臣相得。

export const CARD_TAGS = Object.freeze({
  agri: '農',
  commerce: '商',
  military: '軍',
  people: '民',
  fiscal: '財',
  culture: '文',
  heaven: '天',
  power: '權',
});

// 卡池：每張卡 { name, tags, monthly }。monthly 的鍵必須是 BOUNDS 內的國家或皇帝屬性。
export const POLICY_CARDS = Object.freeze({
  land_grant:   { name: '均田授地', tags: ['agri', 'people'], monthly: { agriculture: 0.4, people: 0.1 } },
  irrigation:   { name: '興修水利', tags: ['agri'], monthly: { agriculture: 0.6, treasury: -1 } },
  light_tax:    { name: '輕徭薄賦', tags: ['people'], monthly: { people: 0.2, treasury: -1.5 } },
  sea_trade:    { name: '開海通商', tags: ['commerce'], monthly: { commerce: 0.6, treasury: 2 } },
  market_office:{ name: '設市舶司', tags: ['commerce', 'fiscal'], monthly: { commerce: 0.2, treasury: 2.5 } },
  salt_monopoly:{ name: '鹽鐵專賣', tags: ['fiscal', 'power'], monthly: { treasury: 3, people: -0.1 } },
  arms_drill:   { name: '整飭武備', tags: ['military'], monthly: { armament: 1 } },
  garrison:     { name: '屯田戍邊', tags: ['military', 'agri'], monthly: { armament: 0.5, agriculture: 0.3 } },
  confucian_school: { name: '尊儒興學', tags: ['culture', 'heaven'], monthly: { benevolence: 0.8, heaven: 0.1 } },
  civil_exam:   { name: '開科取士', tags: ['culture', 'power'], monthly: { benevolence: 0.3, power: 0.1 } },
  sacrifice:    { name: '祭天祈福', tags: ['heaven'], monthly: { heaven: 0.3, benevolence: 0.1 } },
  strict_law:   { name: '重刑峻法', tags: ['power', 'military'], monthly: { power: 0.2, people: -0.2 } },
  mercy_relief: { name: '寬仁恤民', tags: ['people', 'culture'], monthly: { people: 0.3, benevolence: 0.4, treasury: -1 } },
});

export const POLICY_CARD_IDS = Object.freeze(Object.keys(POLICY_CARDS));

// 協同：tags 為兩個標籤，須由兩張「不同」的卡各自提供（單張卡身兼兩個標籤不觸發）。
export const SYNERGIES = Object.freeze([
  { id: 'nong_min', name: '農民同興', tags: ['agri', 'people'], monthly: { agriculture: 0.3, people: 0.2 } },
  { id: 'shang_cai', name: '商財互濟', tags: ['commerce', 'fiscal'], monthly: { commerce: 0.3, treasury: 2 } },
  { id: 'wen_wu', name: '文武並用', tags: ['culture', 'military'], monthly: { armament: 0.4, benevolence: 0.3 } },
  { id: 'quan_bing', name: '權柄合一', tags: ['power', 'military'], monthly: { power: 0.3, armament: 0.2 } },
]);

export const DRAW_SIZE = 3;
export const MAX_ACTIVE_CARDS = 4; // 卡槽上限；超過時最早收入的一張會退出

function ensureCardState(state) {
  if (!state.policyCards) state.policyCards = { active: [], offer: null };
  return state.policyCards;
}

// 每年抽卡：自卡池（排除已在卡槽中者）不重複抽出 3 張，結果寫入 offer 供玩家擇一。
// rng 須回傳 [0, 1)，確保同一 seed 可重現。回傳 id 陣列（副本）。
export function drawPolicyCards(state, rng) {
  const pc = ensureCardState(state);
  const pool = POLICY_CARD_IDS.filter((id) => !pc.active.includes(id));
  const ids = [];
  for (let i = 0; i < DRAW_SIZE && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    ids.push(pool.splice(idx, 1)[0]);
  }
  pc.offer = ids;
  return [...ids];
}

// 擇卡：cardId 須為本年 offer 內的卡，否則拋錯（與 applyDongchangAction 一致）。
// 卡槽已滿時，最早收入的卡退出。成功後清空 offer，回傳 state。
export function choosePolicyCard(state, cardId) {
  const pc = ensureCardState(state);
  if (!pc.offer || !pc.offer.includes(cardId)) throw new Error(`card not offered: ${cardId}`);
  pc.active.push(cardId);
  while (pc.active.length > MAX_ACTIVE_CARDS) pc.active.shift();
  pc.offer = null;
  return state;
}

// 目前卡槽中的卡 id。
export function activeCards(state) {
  return [...(state.policyCards?.active ?? [])];
}

// 協同清單：每個成立的組合回傳 { id, name, tags, monthly }。
export function activeSynergies(state) {
  const cards = activeCards(state);
  const out = [];
  for (const syn of SYNERGIES) {
    const tagOf = (tagKey) => cards.filter((id) => POLICY_CARDS[id].tags.includes(tagKey));
    const [t1, t2] = syn.tags;
    const hit = tagOf(t1).some((x) => tagOf(t2).some((y) => y !== x));
    if (hit) out.push({ id: syn.id, name: syn.name, tags: [...syn.tags], monthly: { ...syn.monthly } });
  }
  return out;
}

// 卡槽與協同的月修正合計（供 policy.js 的 activeMonthly 併入）。無卡時回傳空物件。
export function cardMonthlyEffects(state) {
  const out = {};
  const add = (monthly) => {
    for (const [k, v] of Object.entries(monthly)) out[k] = (out[k] || 0) + v;
  };
  for (const id of activeCards(state)) add(POLICY_CARDS[id].monthly);
  for (const syn of activeSynergies(state)) add(syn.monthly);
  return out;
}

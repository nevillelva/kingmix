// 人物系統：官員與皇子的姓名、年齡、特質；後妃的性格與家族派系。
// 全部由 (seed, id) 以 makeRng 決定性產生，同一組輸入永遠得到同一結果。
// 特質效果只使用既有的數值欄位：官員忠誠（loyalty）、貪腐（corruption，見 applyTraitEffects）、
// 國家屬性 people / treasury。數值為 Phase 7 暫定，見模擬校準。

import { makeRng } from './rng.js';
import { FACTIONS } from './officials.js';
import { isLoyaltyFrozen } from './bonds.js';

export const SURNAMES = [
  '趙', '錢', '孫', '李', '周', '吳', '鄭', '王', '馮', '陳',
  '褚', '衛', '蔣', '沈', '韓', '楊', '朱', '秦', '尤', '許',
  '何', '呂', '施', '張', '孔', '曹', '嚴', '華', '金', '魏',
  '陶', '姜', '戚', '謝', '鄒', '喻', '柏', '水', '竇', '章',
  '雲', '蘇', '潘', '葛', '奚', '范', '彭', '郎', '魯', '韋',
];

export const GIVEN_NAMES = [
  '伯安', '仲文', '季明', '子淵', '文遠', '武德', '延年', '元朗', '景行', '思齊',
  '道衡', '惟誠', '敬之', '承業', '守謙', '懷仁', '從善', '知遠', '明哲', '子昂',
  '允恭', '彥博', '慶長', '德昭', '培元', '顯達', '立言', '正卿', '維新', '克勤',
  '廷芳', '令儀', '叔平', '季和', '景琛', '文昭', '仲敬', '元禮', '士衡', '子謙',
  '中孚', '世安', '嘉謨', '國棟', '自牧', '長風', '鳴岐', '宏道', '致遠', '觀海',
  '如松', '鴻漸', '秉忠', '淑英', '含章', '清和', '靖遠', '抱真', '致中', '懋功',
];

// 派系中文名（與 officials.js 的 FACTIONS 對應，名稱為暫定）
export const FACTION_NAMES = {
  qingliu: '清流',
  xunggui: '勳貴',
  hanmen: '寒門',
};

// 後妃性格：八型
export const PERSONALITIES = [
  { id: 'dignified', name: '端莊', description: '儀態端方，重禮法，待人有分寸。' },
  { id: 'gentle', name: '溫婉', description: '性情柔和，善體人意，少與人爭。' },
  { id: 'lively', name: '活潑', description: '言笑爽朗，喜交遊，宮中因她添了生氣。' },
  { id: 'aloof', name: '清高', description: '不慕名利，獨守清靜，與人保持距離。' },
  { id: 'shrewd', name: '機敏', description: '心思縝密，善察言觀色，擅於周旋。' },
  { id: 'docile', name: '柔順', description: '謙恭順從，凡事以君意為先。' },
  { id: 'fierce', name: '剛烈', description: '性情直率，有烈女之風，不肯委屈。' },
  { id: 'reserved', name: '沉靜', description: '寡言少語，心事深藏，難以測度。' },
];

// 特質（16 個）。effects 皆為每月、每位持有者的增量：
//   loyalty：官員忠誠每月增減（0–100 截斷）
//   corruption：僅對持有官職者生效，修正基礎貪腐流失（BASE_LEAKAGE）；負值為清廉
//   people / treasury：國家屬性每月增減（皆為小幅值）
export const TRAITS = [
  { id: 'loyal', name: '忠貞', description: '一心為君，忠誠穩定上升。', effects: { loyalty: 0.10 } },
  { id: 'honest', name: '清廉', description: '不取非分之財，貪腐大幅減少。', effects: { loyalty: 0.03, corruption: -0.5 } },
  { id: 'greedy', name: '貪財', description: '見利忘義，經手錢糧時多有侵漁。', effects: { loyalty: -0.03, corruption: 0.5 } },
  { id: 'ambitious', name: '好權', description: '急於攀升，忠誠隨野心流失。', effects: { loyalty: -0.08 } },
  { id: 'humble', name: '謙退', description: '知進退，不居功，忠誠略增。', effects: { loyalty: 0.05 } },
  { id: 'proud', name: '驕傲', description: '自視甚高，難以久居人下。', effects: { loyalty: -0.05 } },
  { id: 'cautious', name: '謹慎', description: '凡事三思，少有差池。', effects: { corruption: -0.2 } },
  { id: 'bold', name: '果敢', description: '敢作敢為，對君命有求必應。', effects: { loyalty: 0.02 } },
  { id: 'scholarly', name: '博學', description: '通經史，文教之道由其推行。', effects: { people: 0.01 } },
  { id: 'benevolent', name: '仁厚', description: '體恤百姓，民心因之安定。', effects: { loyalty: 0.02, people: 0.02 } },
  { id: 'cruel', name: '酷烈', description: '苛待下屬與百姓，民怨漸生。', effects: { loyalty: -0.02, people: -0.02 } },
  { id: 'frugal', name: '節儉', description: '量入為出，府庫略有盈餘。', effects: { treasury: 0.1 } },
  { id: 'extravagant', name: '奢靡', description: '揮霍無度，每月耗費府庫。', effects: { treasury: -0.15 } },
  { id: 'devout', name: '篤信', description: '信奉天命，對上天之事格外敬畏。', effects: { loyalty: 0.02, people: 0.005 } },
  { id: 'cunning', name: '機巧', description: '善於鑽營，貪腐與權謀並行。', effects: { loyalty: -0.02, corruption: 0.2 } },
  { id: 'diligent', name: '勤勉', description: '夙夜在公，政務少有積壓。', effects: { loyalty: 0.04, corruption: -0.1 } },
];

const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
const PERSONALITY_BY_ID = Object.fromEntries(PERSONALITIES.map((p) => [p.id, p]));

// 官員／皇子基礎漏損：持有官職的官員每月自府庫流失的量（修正值為 corruption）。
export const BASE_LEAKAGE = 0.3;

export function generateName(seed, id) {
  const rng = makeRng([seed, 'name', id]);
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const given = GIVEN_NAMES[Math.floor(rng() * GIVEN_NAMES.length)];
  return `${surname}${given}`;
}

// 2–3 個互不相同的特質，依 (seed, id) 決定。
export function assignTraits(seed, id) {
  const rng = makeRng([seed, 'traits', id]);
  const count = 2 + Math.floor(rng() * 2);
  const pool = TRAITS.map((t) => t.id);
  const picked = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    picked.push(pool[i]);
  }
  return picked;
}

// 官員與皇子共用的人物欄位：姓名、年齡、特質。
export function generatePerson(seed, id, { minAge = 30, maxAge = 70 } = {}) {
  const rng = makeRng([seed, 'age', id]);
  return {
    personName: generateName(seed, id),
    age: minAge + Math.floor(rng() * (maxAge - minAge + 1)),
    traits: assignTraits(seed, id),
  };
}

// 將人物欄位寫入既有物件（官員、皇子）。withAge 為 false 時保留物件原有年齡（皇子出生時已為 0 歲）。
export function attachPerson(seed, obj, { withAge = true } = {}) {
  const p = generatePerson(seed, obj.id);
  obj.personName = p.personName;
  if (withAge) obj.age = p.age;
  obj.traits = p.traits;
  return obj;
}

// 後妃：性格（八型之一）與家族派系（三派之一），皆依 (seed, id) 決定。
export function generateConsort(seed, id) {
  const rng = makeRng([seed, 'consort', id]);
  const personality = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)].id;
  const family = FACTIONS[Math.floor(rng() * FACTIONS.length)];
  return { personName: generateName(seed, id), personality, family };
}

export function describeConsort(consort) {
  const p = PERSONALITY_BY_ID[consort.personality];
  const family = FACTION_NAMES[consort.family] ?? consort.family;
  const name = consort.personName ?? consort.id;
  return p ? `${name}：${p.name}之性（${p.description}），出身${family}` : `${name}：出身${family}`;
}

export function describeTraits(person) {
  return (person.traits ?? []).map((id) => TRAIT_BY_ID[id]?.name).filter(Boolean);
}

export function getTrait(id) {
  return TRAIT_BY_ID[id] ?? null;
}

// 某人特質對一項效果的加總（供事件選項文字等未來 UI 使用）。
export function traitSum(person, effectKey) {
  let sum = 0;
  for (const id of person.traits ?? []) sum += TRAIT_BY_ID[id]?.effects[effectKey] ?? 0;
  return sum;
}

// 月結特質效果：忠誠、貪腐（持有官職者）、國家屬性。沒有特質者不產生任何變化。
// 不使用 rng，因此不影響既有的隨機序列；國家屬性以上下限截斷（與 BOUNDS 一致）。
export function applyTraitEffects(state) {
  let peopleDelta = 0;
  let treasuryDelta = 0;
  for (const o of state.officials) {
    if (!o.traits || o.traits.length === 0) continue;
    const loyalty = isLoyaltyFrozen(state, o) ? 0 : traitSum(o, 'loyalty'); // 君臣相得者忠誠凍結
    if (loyalty) o.loyalty = Math.min(100, Math.max(0, o.loyalty + loyalty));
    if (o.office) {
      const leak = BASE_LEAKAGE * (1 + traitSum(o, 'corruption'));
      if (leak > 0) treasuryDelta -= leak;
    }
    peopleDelta += traitSum(o, 'people');
    treasuryDelta += traitSum(o, 'treasury');
  }
  if (peopleDelta) state.stats.people = Math.min(100, Math.max(0, state.stats.people + peopleDelta));
  if (treasuryDelta) state.stats.treasury = Math.max(0, state.stats.treasury + treasuryDelta);
  return state;
}

// 太傅教育：太傅在任時，年幼皇子每月有機會習得特質（抓周所得之外的後天特質）。
// 太傅才學（智、德）愈高，獲得機率愈高，且愈可能習得正面特質。數值為暫定值。

import { makeRng } from './rng.js';
import { officeHolder } from './offices.js';
import { ADULT_AGE } from './succession.js';

export const MAX_HEIR_TRAITS = 4;
export const EDUCATION_BASE = 0.01; // 每月基礎機率
export const EDUCATION_SKILL = 0.03; // 太傅才學（0–1）額外加成的機率上限

// 正面特質（無負面效果者）與負面特質，合計為 TRAITS 全部 16 項。
export const GOOD_TRAITS = [
  'loyal', 'honest', 'humble', 'scholarly', 'benevolent',
  'frugal', 'devout', 'diligent', 'cautious', 'bold',
];
export const BAD_TRAITS = ['greedy', 'ambitious', 'proud', 'cruel', 'extravagant', 'cunning'];

export function tutorQuality(tutor) {
  if (!tutor) return 0;
  return (tutor.abilities.intellect + tutor.abilities.virtue) / 200;
}

// 每月結算：太傅在任時，未成年皇子依才學機率習得一項特質。無太傅則不變。
export function tickTutorTraits(state) {
  const tutor = officeHolder(state, 'tutor');
  if (!tutor) return state;
  const q = tutorQuality(tutor);
  for (const h of state.heirs) {
    if (h.age >= ADULT_AGE) continue;
    if (!h.traits) h.traits = [];
    if (h.traits.length >= MAX_HEIR_TRAITS) continue;
    const rng = makeRng([state.seed, 'tutor', state.year, state.month, h.id]);
    if (rng() >= EDUCATION_BASE + EDUCATION_SKILL * q) continue;
    const pool = (rng() < q ? GOOD_TRAITS : BAD_TRAITS).filter((id) => !h.traits.includes(id));
    if (pool.length === 0) continue;
    h.traits.push(pool[Math.floor(rng() * pool.length)]);
  }
  return state;
}

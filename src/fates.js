// 人物命運線引擎：朝臣、妃嬪、皇嗣各有一條三段命運線（文本見 fate-data.js），
// 段落依月推進，寫入史冊（kind 'fate'）；除名、即位或終局時寫入結局（kind 'fate_end'）。
// 純紀錄：不消耗 rng、不改動任何數值，因此不影響平衡與既有種子的結果。
// state.fates 以 "角色:id" 為鍵，記錄 { arc, name, stage, last, ended }。

import { isCourtOfficial } from './officials.js';
import { defaultOf } from './schema.js';
import {
  FATE_ARCS,
  FATE_ROLE_TAG,
  OFFICIAL_VARIANT,
  CONSORT_VARIANT,
  HEIR_VARIANT,
} from './fate-data.js';

const monthIndex = (s) => (s.year - 1) * 12 + (s.month - 1);
const fill = (text, name) => text.replaceAll('{name}', name);

function ensureFates(state) {
  state.fates = state.fates || defaultOf('fates', state);
  return state.fates;
}

function ensureChronicle(state) {
  if (!Array.isArray(state.chronicle)) state.chronicle = [];
  return state.chronicle;
}

// 目前在世的人物：朝臣（不含知府）、妃嬪、皇嗣。每人帶有角色、命運線鍵、名稱、年齡與段落變體。
function livingPeople(state) {
  const out = [];
  for (const o of state.officials) {
    if (!isCourtOfficial(o)) continue;
    out.push({
      role: 'official', id: o.id, arcKey: o.faction, name: o.personName ?? o.name, age: null, tag: FATE_ROLE_TAG.official,
      variant: () => OFFICIAL_VARIANT(state.bonds?.unlocked?.[o.id] === true, o.loyalty),
    });
  }
  for (const c of state.consorts ?? []) {
    out.push({
      role: 'consort', id: c.id, arcKey: c.family, name: c.personName ?? c.id, age: null, tag: FATE_ROLE_TAG.consort,
      variant: () => CONSORT_VARIANT(c.favor ?? 50),
    });
  }
  for (const h of state.heirs ?? []) {
    const male = h.gender === 'male';
    out.push({
      role: 'heir', id: h.id, arcKey: male ? 'male' : 'female', name: h.name, age: h.age ?? 0,
      tag: male ? FATE_ROLE_TAG.heir_male : FATE_ROLE_TAG.heir_female,
      variant: () => HEIR_VARIANT(state.dynasty?.crownPrince === h.id),
    });
  }
  return out;
}

export function arcOf(role, arcKey) {
  const byRole = FATE_ARCS[role];
  return byRole ? byRole[arcKey] ?? null : null;
}

// 每月推進：各人依其目前段落判斷是否到期，到期則寫入一段史冊紀錄。
// 皇帝已駕崩（alive 為 false）時不推進，人物的結局只在除名、即位或終局時寫入。
export function tickFates(state) {
  if (!state.alive) return state;
  const fates = ensureFates(state);
  const chronicle = ensureChronicle(state);
  const now = monthIndex(state);
  for (const p of livingPeople(state)) {
    const key = `${p.role}:${p.id}`;
    const rec = fates[key];
    if (rec?.ended) continue;
    const stage = rec?.stage ?? 0;
    const beat = arcOf(p.role, p.arcKey)?.beats[stage];
    if (!beat) continue;
    if (rec && now - rec.last < beat.after) continue;
    if (p.age !== null && p.age < (beat.minAge ?? 0)) continue;
    const name = rec?.name ?? p.name;
    const body = beat.text[p.variant()] ?? beat.text.any;
    const line = fill(body, name);
    fates[key] = { arc: p.arcKey, name, stage: stage + 1, last: now, ended: false, lines: [...(rec?.lines ?? []), line] };
    chronicle.push({ kind: 'fate', name, text: line, tag: p.tag, year: state.year, month: state.month });
  }
  return state;
}

// 結局：人物除名、即位或終局時呼叫。同一人只寫一次；未曾進入命運線者不記。
// cause：remonstrance / dismissed / child_mortality / rivalry / ascended / survived；缺漏時退回 survived。
export function endFate(state, role, id, cause) {
  const fates = ensureFates(state);
  const rec = fates[`${role}:${id}`];
  if (!rec || rec.ended) return false;
  rec.ended = true;
  const endings = arcOf(role, rec.arc)?.endings ?? {};
  const effective = endings[cause] ? cause : 'survived';
  rec.endCause = effective; // 結局類別（供列傳篩選，見 biographies.js）
  rec.endLine = fill(endings[effective] ?? '', rec.name);
  ensureChronicle(state).push({
    kind: 'fate_end',
    name: rec.name,
    cause: effective,
    text: fill(endings[effective] ?? '', rec.name),
    year: state.year,
    month: state.month,
  });
  return true;
}

// 皇女出嫁和親（diplomacy.js marryPrincess）：寫入出嫁段落，並以 married 結局收束。
// 若命運線尚未進入（無紀錄），先建立紀錄再寫入，確保出嫁必留史冊。
export function marryOffFate(state, id, neighborName) {
  const fates = ensureFates(state);
  const key = `heir:${id}`;
  const heir = (state.heirs ?? []).find((h) => h.id === id);
  const rec = fates[key] ?? { arc: 'female', name: heir?.name ?? id, stage: 0, last: monthIndex(state), ended: false };
  if (rec.ended) return false;
  const name = rec.name;
  ensureChronicle(state).push({
    kind: 'fate',
    name,
    text: fill(`{name}出嫁${neighborName}，以和親安邊，宮中送嫁。`, name),
    tag: FATE_ROLE_TAG.heir_female,
    year: state.year,
    month: state.month,
  });
  fates[key] = { ...rec, stage: (rec.stage ?? 0) + 1, last: monthIndex(state) };
  return endFate(state, 'heir', id, 'married');
}

// 終局：仍在世且未結局者，一律以 survived 收束（國祚終結時呼叫）。
export function closeFatesAtEnd(state) {
  const fates = ensureFates(state);
  for (const key of Object.keys(fates)) {
    if (fates[key].ended) continue;
    const at = key.indexOf(':');
    endFate(state, key.slice(0, at), key.slice(at + 1), 'survived');
  }
}

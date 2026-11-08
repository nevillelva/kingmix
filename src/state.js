import { attachPerson } from './people.js';

// 遊戲狀態與數值邊界。所有數值寫入都必須經過 setStat，確保越界會被截斷並記錄。

export const BOUNDS = {
  // 皇帝屬性
  health: [0, 100],
  literature: [0, 500],
  military: [0, 500],
  power: [0, 500],
  benevolence: [0, 500],
  prestige: [0, 500],
  charm: [0, 500],
  // 國家屬性
  treasury: [0, Infinity],
  people: [0, 100],
  agriculture: [0, 1000],
  commerce: [0, 1000],
  armament: [0, 1000],
  heaven: [0, 100],
  population: [0, Infinity],
};

export const FACTION_BASE = 33; // 派系勢力中性值

const round2 = (n) => Math.round(n * 100) / 100;

export function createInitialState(seed, opts = {}) {
  const state = {
    seed,
    policy: opts.policy ?? 'agrarian',
    wars: [],
    year: 1,
    month: 1,
    age: 18,
    turn: 0,
    alive: true,
    endReason: null,
    stats: {
      health: 80,
      literature: 100,
      military: 80,
      power: 80,
      benevolence: 150,
      prestige: 60,
      charm: 150,
      treasury: 500,
      people: 60,
      agriculture: 330, // 先帝遺留的凋敝，使農業低迷事件有機會發生
      commerce: 400,
      armament: 300,
      heaven: 50,
      population: 1000000,
    },
    officials: [
      {
        id: 'o1', name: '丞相', loyalty: 85, ambition: 20, faction: 'qingliu', office: 'chancellor',
        abilities: { intellect: 80, politics: 80, martial: 40, command: 50, virtue: 70 },
      },
      {
        id: 'o2', name: '戶部尚書', loyalty: 70, ambition: 30, faction: 'xunggui', office: 'revenue',
        abilities: { intellect: 70, politics: 65, martial: 30, command: 40, virtue: 60 },
      },
      {
        id: 'o3', name: '知府', loyalty: 55, ambition: 45, faction: 'hanmen', office: null,
        abilities: { intellect: 60, politics: 55, martial: 35, command: 30, virtue: 40 },
      },
      {
        // 飽學老臣：太傅的初始人選，待吏部最適任建議任命
        id: 'o4', name: '翰林學士', loyalty: 80, ambition: 10, faction: 'qingliu', office: null,
        abilities: { intellect: 75, politics: 50, martial: 45, command: 30, virtue: 75 },
      },
    ],
    factions: { qingliu: 34, xunggui: 33, hanmen: 33 },
    consorts: [],
    heirs: [],
    emperor: { name: '皇帝', abilities: null },
    dynasty: { generation: 1, nextHeirId: 1, nextConsortId: 1, ended: false, rivalry: false },
    chronicle: [],
    dongchang: { cases: [], nextId: 1 },
    flags: {},
    warnings: [],
  };
  // 人物欄位（personName / age / traits）：決定性，不改動既有欄位
  for (const o of state.officials) attachPerson(seed, o);
  return state;
}

export function setStat(state, key, value, opts = {}) {
  const bounds = BOUNDS[key];
  if (!bounds) throw new Error(`unknown stat: ${key}`);
  if (!Number.isFinite(value) && value !== Infinity && value !== -Infinity) {
    throw new Error(`non-finite value for ${key}: ${value}`);
  }
  let v = value;
  // silent：月結的自然漂移撞到上下限屬正常狀態，不記錄警告；事件效果越界才是設計問題
  if (v < bounds[0]) {
    if (!opts.silent) state.warnings.push({ turn: state.turn, key, reason: 'floor', attempted: round2(v) });
    v = bounds[0];
  } else if (v > bounds[1]) {
    if (!opts.silent) state.warnings.push({ turn: state.turn, key, reason: 'ceiling', attempted: round2(v) });
    v = bounds[1];
  }
  state.stats[key] = round2(v);
  return state;
}

// 本紀劇本：開局條件與勝敗目標。全部為選用（opt-in）：未選劇本時 createInitialState 行為不變。
// 數值為暫定設計，待無頭模擬校準。

import { createInitialState, setStat } from './state.js';

// 條件格式：{ key, gte | lte | lt | gt | eq, value }；key 可為 state 頂層欄位（turn、age）或 stats 內的屬性。
// win：全部成立即勝；fail：任一「群組」全部成立即敗（群組內為 AND）。
// 每月由呼叫端執行 evaluateScenario；勝負一經判定即為終局（sticky）。
export const SCENARIOS = {
  youth_regency: {
    id: 'youth_regency',
    name: '幼主親政',
    summary: '皇帝年幼，太后攝政。十八歲前奪回大權（權勢達 60）即為親政成功。',
    start: {
      age: 9,
      stats: { power: 20, prestige: 40, benevolence: 120 },
      flags: { regency: true },
    },
    goal: {
      win: [
        { key: 'age', gte: 18 },
        { key: 'power', gte: 60 },
      ],
      fail: [
        [{ key: 'age', gte: 18 }, { key: 'power', lt: 60 }],
      ],
    },
    goalText: '十八歲時權勢達 60 即親政成功；十八歲仍不足則太后攝政到底，失敗。',
  },
  restoration: {
    id: 'restoration',
    name: '中興之主',
    summary: '先帝留下衰頹國勢。十年內使民心達 60、國庫達 500 即中興成功。',
    start: {
      stats: { people: 25, treasury: 150, agriculture: 200, commerce: 200, armament: 150 },
    },
    goal: {
      win: [
        { key: 'people', gte: 60 },
        { key: 'treasury', gte: 500 },
      ],
      fail: [
        [{ key: 'turn', gte: 120 }],
      ],
    },
    goalText: '十年（120 月）內民心達 60 且國庫達 500 即成功；期限內未達成則失敗。',
  },
  steady: {
    id: 'steady',
    name: '守成之君',
    summary: '國勢平穩，目標是在位十年以上而不失民心。',
    start: {},
    goal: {
      win: [
        { key: 'turn', gte: 120 },
      ],
      fail: [
        [{ key: 'minPeople', lt: 30 }],
      ],
    },
    goalText: '在位滿十年（120 月）且民心未曾跌破 30 即成功；民心跌破 30 即失敗。',
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS);

function readKey(state, key) {
  if (key === 'minPeople') return state.scenario?.minPeople ?? state.stats.people;
  if (key in state.stats) return state.stats[key];
  if (key === 'turn' || key === 'age' || key === 'year') return state[key];
  throw new Error(`unknown scenario condition key: ${key}`);
}

const OPS = ['gte', 'lte', 'lt', 'gt', 'eq'];
const targetOf = (cond) => cond[OPS.find((op) => op in cond)];

function holds(state, cond) {
  const v = readKey(state, cond.key);
  if ('gte' in cond) return v >= cond.gte;
  if ('lte' in cond) return v <= cond.lte;
  if ('lt' in cond) return v < cond.lt;
  if ('gt' in cond) return v > cond.gt;
  if ('eq' in cond) return v === cond.eq;
  throw new Error(`invalid scenario condition: ${JSON.stringify(cond)}`);
}

// 建立劇本開局狀態：先產生標準開局，再套用劇本的數值與旗標覆寫。
export function createScenarioState(seed, scenarioId, opts = {}) {
  const def = SCENARIOS[scenarioId];
  if (!def) throw new Error(`unknown scenario: ${scenarioId}`);
  const state = createInitialState(seed, opts);
  if (def.start.age !== undefined) state.age = def.start.age;
  for (const [key, val] of Object.entries(def.start.stats || {})) setStat(state, key, val, { silent: true });
  Object.assign(state.flags, def.start.flags || {});
  state.scenario = { id: scenarioId, status: 'ongoing', minPeople: state.stats.people, endedTurn: null };
  return state;
}

// 評估劇本進度。回傳目前狀態與各勝利條件的達成情況，供介面顯示。
export function evaluateScenario(state) {
  const sc = state.scenario;
  const def = sc && SCENARIOS[sc.id];
  if (!def) return null;

  if (sc.status === 'ongoing') {
    sc.minPeople = Math.min(sc.minPeople, state.stats.people);
    const won = def.goal.win.every((c) => holds(state, c));
    const failed = def.goal.fail.some((group) => group.every((c) => holds(state, c)));
    if (won) {
      sc.status = 'won';
    } else if (failed || !state.alive) {
      sc.status = 'failed';
    }
    if (sc.status !== 'ongoing') sc.endedTurn = state.turn;
  }

  return {
    id: sc.id,
    name: def.name,
    status: sc.status,
    endedTurn: sc.endedTurn,
    progress: def.goal.win.map((c) => ({ key: c.key, target: targetOf(c), met: holds(state, c) })),
  };
}

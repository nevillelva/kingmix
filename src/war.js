// 戰爭決策制：比較己方戰力與敵方強度，加上隨機浮動。不做操作性玩法。
// 公式為 Phase 3 暫定，待模擬校準。

import { officeHolder } from './offices.js';
import { POLICIES } from './policy.js';
import { warDefenseMultiplier } from './city.js';
import { BALANCE } from './balance.js';

// 己方戰力的名目值（不含擲骰）：軍備、武略、兵部/大將武力與國策修正。
export function nominalStrength(state) {
  const commander = officeHolder(state, 'war');
  const martial = commander ? commander.abilities.martial : 0;
  const policy = POLICIES[state.policy];
  const base = state.stats.armament / 4 + state.stats.military * 1.5 + martial * 2.5;
  return base * (policy ? policy.warStrength : 1);
}

export function ourStrength(state, rng) {
  const roll = 0.8 + rng() * 0.4; // 0.8 – 1.2
  return nominalStrength(state) * roll;
}

// 事件戰爭的敵方擲骰幅度：與戰役路徑（campaign.js 的 SPREAD_UNSCOUTED）同一模型，
// 敵方強度 = 名目強度 × (1 + (2u − 1) × spread)。上限 0.3。
export const EVENT_ENEMY_SPREAD = 0.3;

// 勢均力敵的戰前刺探加成：出兵前已探知敵情（兵部偵查），敵方有效強度 × (1 − EVEN_EDGE × w(ratio))。
// w 在 ratio 0.9–1.1 為 1，於 0.8–0.9 與 1.1–1.2 線性遞減至 0；1.2 以上（含強敵 ≥1.3）完全不受影響。
// 連續遞減可保證敵強度單調（強敵不會因跨過區間邊界而變得較弱）。
export const EVEN_EDGE = BALANCE.EVEN_EDGE;
export function evenWeight(ratio) {
  if (!(ratio > 0.8) || ratio >= 1.2) return 0;
  if (ratio < 0.9) return (ratio - 0.8) / 0.1;
  if (ratio <= 1.1) return 1;
  return (1.2 - ratio) / 0.1;
}

// spec: { strength, reward, loss }；reward/loss 為 effects 物件
// 事件戰爭同時擲己方與敵方戰力，敵強度愈高勝率愈低（單調）。
// 記錄的 ratio 為名目比（敵方名目強度 ÷ 己方名目戰力），供校準用。
// spec.prefecture（可省略）：戰事所在州府，其城防加成己方戰力（見 city.js warDefenseMultiplier）；省略則取全國平均。
export function resolveWar(state, spec, rng, applyEffects) {
  const nominal = nominalStrength(state);
  const defense = warDefenseMultiplier(state, spec.prefecture);
  const power = ourStrength(state, rng) * defense;
  const ratio = nominal > 0 ? spec.strength / nominal : null;
  const edge = 1 - EVEN_EDGE * (ratio === null ? 0 : evenWeight(ratio));
  const enemy = spec.strength * (1 + (rng() * 2 - 1) * EVENT_ENEMY_SPREAD) * edge;
  const won = power >= enemy;
  const effects = won ? spec.reward : spec.loss;
  applyEffects(state, effects || {});
  if (!won) applyEffects(state, { prestige: -3 });
  state.wars.push({
    turn: state.turn,
    strength: spec.strength,
    power: Math.round(power),
    won,
    ratio: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    defense: Math.round(defense * 1000) / 1000,
    ...(spec.prefecture ? { prefecture: spec.prefecture } : {}),
  });
  return won;
}

// ---- Phase 9：多回合戰役的戰術與單回合結算（單擲路徑維持不變）----

// 三種戰術：power 為己方戰力倍率，enemy 為敵方強度倍率，grain 為每回合粮草消耗。
// ambush 為賭博型：gambleChance 機率大勝（gambleHit），否則失手（gambleMiss）。
export const TACTICS = Object.freeze({
  assault: { label: '強攻', power: 1.1, enemy: 1.0, grain: 45 },
  hold: { label: '堅守', power: 0.95, enemy: 0.93, grain: 20 },
  ambush: { label: '奇襲', power: 1.0, enemy: 1.0, grain: 30, gambleChance: 0.4, gambleHit: 1.6, gambleMiss: 0.9 },
});

// 敵方強度的不確定幅度：未偵察 ±20%，偵察後 ±8%。
export const SPREAD_UNSCOUTED = 0.2;
export const SPREAD_SCOUTED = 0.08;

// 剋制表（克制倍率，作用於己方戰力）：COUNTER[我方戰術][敵方架勢] = 倍率。
// 模型沒有兵種，對應的是既有的三種戰術；敵方架勢於每回合以同一條 rng 序列擲出（ENEMY_STANCES 均等機率）。
// 三組循環剋制：強攻 剋 堅守（衝垮固守陣）、堅守 剋 奇襲（穩守不被偷襲）、奇襲 剋 強攻（以逸待勞、伏擊衝陣）。
// 被剋的一方乘以倒數（1/COUNTER_MULT），使剋制為零和，平均戰力不因此系統性偏移。
// 其餘配對（含同架勢）倍率為 1。
export const COUNTER_MULT = 1.06;
const COUNTERED = 1 / COUNTER_MULT;
export const COUNTER = Object.freeze({
  assault: Object.freeze({ hold: COUNTER_MULT, ambush: COUNTERED }),
  hold: Object.freeze({ ambush: COUNTER_MULT, assault: COUNTERED }),
  ambush: Object.freeze({ assault: COUNTER_MULT, hold: COUNTERED }),
});
export const ENEMY_STANCES = Object.freeze(['assault', 'hold', 'ambush']);
export function counterMultiplier(tactic, stance) {
  return COUNTER[tactic]?.[stance] ?? 1;
}

// 戰損比例：戰敗方損失自身戰力的 10%，戰勝方損失自身戰力的 5%（確定性，不擲骰）。
export const LOSS_RATE_LOSER = 0.1;
export const LOSS_RATE_WINNER = 0.05;

// 單一回合結算。ourPower 由呼叫端先以 ourStrength 取得；rng 須為同一條確定性序列。
// multiplier 用於糧草不足等外部修正。enemyStance 可省略，省略時於回合末由 rng 擲出（不影響前面的擲骰）。
// 回傳 { won, ours, enemy, stance, counter, lossOurs, lossEnemy, line }：
// ours / enemy 為四捨五入後的戰力，lossOurs / lossEnemy 為本回合戰損，line 為本回合的剋制關係（中文）。
export function resolveRound({ ourPower, enemyStrength, tactic, spread = SPREAD_UNSCOUTED, rng, multiplier = 1, enemyStance }) {
  const t = TACTICS[tactic];
  if (!t) throw new Error(`unknown tactic: ${tactic}`);
  const mod = t.gambleChance !== undefined ? (rng() < t.gambleChance ? t.gambleHit : t.gambleMiss) : t.power;
  const enemy = enemyStrength * t.enemy * (1 + (rng() * 2 - 1) * spread);
  const stance = enemyStance ?? ENEMY_STANCES[Math.floor(rng() * ENEMY_STANCES.length)];
  if (!ENEMY_STANCES.includes(stance)) throw new Error(`unknown stance: ${stance}`);
  const counter = counterMultiplier(tactic, stance);
  const ours = ourPower * mod * multiplier * counter;
  const won = ours >= enemy;
  const oursR = Math.round(ours);
  const enemyR = Math.round(enemy);
  const lossOurs = Math.round(oursR * (won ? LOSS_RATE_WINNER : LOSS_RATE_LOSER));
  const lossEnemy = Math.round(enemyR * (won ? LOSS_RATE_LOSER : LOSS_RATE_WINNER));
  const relation = counter > 1 ? `${t.label}剋敵${TACTICS[stance].label}` : counter < 1 ? `${t.label}遭敵${TACTICS[stance].label}剋制` : `${t.label}對敵${TACTICS[stance].label}`;
  const line = relation;
  return { won, ours: oursR, enemy: enemyR, stance, counter, lossOurs, lossEnemy, line };
}

// 將戰役結果（含 rounds 陣列，或 { campaign: { rounds } }）轉為中文逐回合戰報。純函式，不改動輸入。
export function formatBattleLog(result) {
  const rounds = result?.rounds ?? result?.campaign?.rounds ?? [];
  const lines = rounds.map((r) => {
    const head = `第${r.round}回合：${r.tactic ? TACTICS[r.tactic]?.label ?? r.tactic : ''}`;
    const body = `我方${r.ours} 對 敵方${r.enemy}`;
    const loss = r.lossOurs !== undefined ? `，我損${r.lossOurs}、敵損${r.lossEnemy}` : '';
    return `${head}（${body}${loss}）${r.won ? '勝' : '敗'}${r.line ? `：${r.line}` : ''}`;
  });
  const outcome = result?.outcome;
  if (outcome !== undefined && result?.won !== undefined) {
    lines.push(`結果：${result.won ? '勝' : '敗'}（${outcome}）`);
  }
  return lines;
}

// 寫入 state.wars，格式與單擲路徑相同（turn / strength / power / won），額外欄位可選。
export function recordWar(state, entry) {
  state.wars.push({ turn: state.turn, ...entry });
  return state.wars.at(-1);
}

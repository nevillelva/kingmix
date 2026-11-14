// 戰役自動戰鬥與加速的純函式（僅影響呈現與操作流程，不改動任何結算數值）。
// 偏好（auto、speed）只存於介面狀態 U.battlePrefs，不寫入 state，因此不進入存檔。

export const BATTLE_TICK_MS = 650;
export const BATTLE_SPEEDS = Object.freeze([1, 2]);

// 逐回合播放的間隔（毫秒）。速度非 1 或 2 時視為 1×。
export function battleTickMs(speed) {
  const s = BATTLE_SPEEDS.includes(speed) ? speed : 1;
  return BATTLE_TICK_MS / s;
}

// 1× ↔ 2× 循環切換。
export function nextBattleSpeed(speed) {
  return speed === 1 ? 2 : 1;
}

export function defaultBattlePrefs() {
  return { auto: false, speed: 1 };
}

// 將任意輸入正規化為合法偏好；無效欄位回退為預設值。回傳新物件。
export function normalizeBattlePrefs(p) {
  const d = defaultBattlePrefs();
  return {
    auto: typeof p?.auto === 'boolean' ? p.auto : d.auto,
    speed: BATTLE_SPEEDS.includes(p?.speed) ? p.speed : d.speed,
  };
}

// 由既有結算回合（rounds，與 pickTactic 寫入的欄位相同）推導逐回合畫面框。
// 純投影：不重新擲骰，won / ours / enemy 直接取自結算結果，故勝負與結算一致。
// 兵力條比例為該回合我方、敵方戰力占比（百分比，0–100）。
export function battleFrames(rounds = []) {
  return rounds.map((r, i) => {
    const ours = Number.isFinite(r.ours) ? r.ours : 0;
    const enemy = Number.isFinite(r.enemy) ? r.enemy : 0;
    const total = ours + enemy;
    const oursPct = total > 0 ? Math.round((ours / total) * 100) : 0;
    return {
      index: i,
      round: r.round ?? i + 1,
      won: Boolean(r.won),
      ours,
      enemy,
      oursPct,
      enemyPct: total > 0 ? 100 - oursPct : 0,
      lossOurs: r.lossOurs ?? 0,
      lossEnemy: r.lossEnemy ?? 0,
    };
  });
}

// 統計回合勝敗，供與 campaign.ourWins / enemyWins 比對。
export function battleTally(rounds = []) {
  let ourWins = 0;
  let enemyWins = 0;
  for (const r of rounds) {
    if (r.won) ourWins += 1;
    else enemyWins += 1;
  }
  return { ourWins, enemyWins };
}

// 自動戰鬥開啟時應顯示的回合數：直接顯示全部回合（不播放）。
export function visibleRoundCount({ auto }, total, shown) {
  return auto ? total : Math.min(shown, total);
}

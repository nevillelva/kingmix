// 御書房與結局頁「史記」的文字組裝。依 state.chronicle 各筆紀錄的寫入欄位分派，不依賴 undefined 欄位。
// 既有紀錄種類：
//   era          改元（era.js 的 eraChronicleEntry，含 text）
//   heir_illness 幼子染疾（succession.js 的 tickHeirs）
//   heir_death   皇子夭折／奪嫡失勢（succession.js 的 removeHeir）
//   assassination 刺殺（assassination.js）：來源、目標、結果
//   （無 kind）  駕崩或禪位後的世代紀錄（succession.js 的 tryAccession）

const END_WORD = { death: '駕崩', abdicated: '高年致仕', '禪位': '禪位', assassinated: '遇刺' };
const HEIR_DEATH_CAUSE = { child_mortality: '幼年夭折', rivalry: '奪嫡失勢' };
const ASSASSIN_SOURCE = { tyranny: '暴政', remnant: '前朝遺臣', court: '朝堂江湖' };
const ASSASSIN_OUTCOME = { blocked: '擋下', injured: '受傷', killed: '死亡' };

const orDash = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));

// 回傳 { text, tag }：text 為主文，tag 為右側標籤。任何欄位缺漏皆以「—」代替，絕不輸出 undefined。
export function chronicleLine(c) {
  if (!c || typeof c !== 'object') return { text: '—', tag: '' };
  if (c.kind === 'era') {
    return { text: orDash(c.text ?? `改元為${orDash(c.to)}，於 ${orDash(c.year)} 年 ${orDash(c.month)} 月`), tag: '改元' };
  }
  if (c.kind === 'assassination') {
    return {
      text: `${orDash(ASSASSIN_SOURCE[c.source])}行刺${orDash(c.targetName)} · ${orDash(c.year)}年${orDash(c.month)}月`,
      tag: ASSASSIN_OUTCOME[c.outcome] ?? '—',
    };
  }
  if (c.kind === 'heir_illness') {
    return { text: `皇子${orDash(c.name)}染疾 · ${orDash(c.year)}年${orDash(c.month)}月`, tag: '患病' };
  }
  if (c.kind === 'heir_death') {
    return {
      text: `皇子${orDash(c.name)} · ${orDash(c.year)}年${orDash(c.month)}月`,
      tag: HEIR_DEATH_CAUSE[c.cause] ?? '夭折',
    };
  }
  // 世代紀錄（無 kind）：第 N 世 · 於 Y 年駕崩／禪位 · Z 歲
  const word = END_WORD[c.endReason] || (c.endReason ? String(c.endReason) : '駕崩');
  const age = c.age === undefined || c.age === null ? '' : ` · ${c.age}歲`;
  return { text: `第${orDash(c.generation)}世 · ${orDash(c.endedInYear)}年${age}`, tag: word };
}

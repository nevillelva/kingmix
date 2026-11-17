// 煉丹丹毒與方士干政的常數與事件文字（見 alchemy.js）。
// 文字與效果置於此檔而非 data/events.json，避免觸發事件覆蓋率測試。

// 丹藥種類：每服一次上升的丹毒與方士影響力。目前僅一種，以表鍵擴充。
export const PILLS = Object.freeze({
  zhenyao: Object.freeze({ id: 'zhenyao', name: '金丹', toxicityGain: 5, fangshiGain: 3 }),
});
export const DEFAULT_PILL = 'zhenyao';

export const TOXICITY_MAX = 100;
export const TOXICITY_DECAY = 4; // 丹毒每月緩降（須小於每服增量 5，否則丹毒永不累積、段落與致死皆不可達）
export const TOXICITY_LETHAL = 90; // 丹毒達此值，月結直接駕崩（原決定：允許丹毒直接致死）
export const FANGSHI_DECAY = 3; // 方士影響力每月緩降

// 三段門檻（丹毒為甲、乙，方士為丙）
export const TOXICITY_HARM = 40; // 甲：丹毒中，每月健康流失
export const TOXICITY_PARANOID = 70; // 乙：丹毒高，設旗標 alchemy:paranoid（多疑）
export const FANGSHI_TIER = 50; // 丙：方士干政事件可能發生

export const TOXICITY_HEALTH_LOSS = 1.5; // 甲段：每月健康流失
export const PARANOID_FLAG = 'alchemy:paranoid';

// 方士干政
export const FANGSHI_EVENT_CHANCE = 0.25; // 丙段以上，每月擲中機率
export const FANGSHI_COUP_THRESHOLD = 85; // 方士影響力達此值，每月可能觸發政變（經 assassination.js）
export const FANGSHI_COUP_CHANCE = 0.02;

export const FANGSHI_EVENT = Object.freeze({
  id: 'fangshi_intrigue',
  title: '方士干政',
  text: '方士進言，言辭蠱惑，朝中傳言陛下聽信術士。清流諫臣紛紛上疏，皇權因之受損。',
  power: -12, // 皇權（stats.power）流失
  qingliuLoyalty: -3, // 清流朝臣忠誠下滑（每人）
});

// 丹毒致死的史冊死因文字（chronicle.js 讀取）
export const ALCHEMY_DEATH_CAUSE = Object.freeze({
  toxicity: '丹毒累積',
});

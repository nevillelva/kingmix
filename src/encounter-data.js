// 微服私訪奇遇的資料表（side-events.js 引用）。
//
// CHOICE_ENCOUNTERS：二選一奇遇（貪官、豪強、流民）。遭遇後存於 state.sideEvents.pending，待玩家於對話框裁決：
//   - punish（嚴懲）：所至府民心上升；知府忠誠下降（見 PUNISH_LOYALTY），並推進其離心月數（DEFIANT_PUSH），可能導致割據。
//   - soothe（安撫）：耗國庫（SOOTHE_COST），民心小升，知府忠誠不變。
// 效果皆寫入既有欄位（tour 的府民心、city-capture 的 defiantMonths、官員 loyalty、stats.treasury），不另立數值系統。
//
// ENCOUNTERS：舊版四種即得效果奇遇（無抉擇）。資料保留不改動；目前巡幸擲奇遇時改用 CHOICE_ENCOUNTERS。
// 數值為暫定值。

export const PUNISH_MORALE = 6; // 嚴懲：所至府民心增益
export const PUNISH_LOYALTY = -5; // 嚴懲：知府忠誠變動
export const DEFIANT_PUSH = 6; // 嚴懲：知府離心月數增加（離心滿 DEFIANT_MONTHS 即割據）
export const SOOTHE_MORALE = 3; // 安撫：所至府民心增益
export const SOOTHE_COST = 10; // 安撫：國庫耗費

export const CHOICE_ENCOUNTERS = Object.freeze([
  Object.freeze({
    id: 'corrupt',
    title: '貪官侵吞',
    narrative: '所至府衙賦稅帳目不清，胥吏私吞賑糧，百姓敢怒不敢言。',
    choices: Object.freeze({
      punish: Object.freeze({ label: '嚴懲貪官', text: '嚴懲貪官，府民稱快，然知府心懷不安。' }),
      soothe: Object.freeze({ label: '撥款安撫', text: '撥款安撫吏民，百姓感念，國庫稍耗。' }),
    }),
  }),
  Object.freeze({
    id: 'magnate',
    title: '豪強兼併',
    narrative: '地方豪強霸佔田畝，佃戶流離，知府多方迴護。',
    choices: Object.freeze({
      punish: Object.freeze({ label: '追奪田產', text: '追奪豪強田產，佃戶歡呼，知府面有慍色。' }),
      soothe: Object.freeze({ label: '撥款贖田', text: '出資贖還佃戶田地，民心稍安，國庫稍耗。' }),
    }),
  }),
  Object.freeze({
    id: 'refugee',
    title: '流民聚集',
    narrative: '邊境流民聚於城外，乞食無門，府吏欲驅之而後快。',
    choices: Object.freeze({
      punish: Object.freeze({ label: '驅散流民', text: '驅散流民以保市井安寧，知府卻以為過嚴。' }),
      soothe: Object.freeze({ label: '開倉賑濟', text: '開倉賑濟流民，民心稍振，國庫稍耗。' }),
    }),
  }),
]);

// 舊版奇遇表（即得效果，無抉擇）。內容不變。
export const ENCOUNTERS = Object.freeze([
  Object.freeze({ id: 'farmer', title: '田間問農', narrative: '微服至鄉野，老農據實相告，陛下聞之動容。', effects: Object.freeze({ benevolence: 3, morale: 4 }) }),
  Object.freeze({ id: 'scholar', title: '茶肆論經', narrative: '於茶肆偶遇落第士子，議論時政頗有見地。', effects: Object.freeze({ literature: 3, prestige: 1 }) }),
  Object.freeze({ id: 'bandit', title: '驛道遇匪', narrative: '途中耳聞匪患，地方胥吏推諉，百姓怨聲載道。', effects: Object.freeze({ military: 2, morale: -4 }) }),
  Object.freeze({ id: 'merchant', title: '商旅獻禮', narrative: '一商賈感念天恩，獻上薄禮以充國用。', effects: Object.freeze({ treasury: 8 }) }),
]);

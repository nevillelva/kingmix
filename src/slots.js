// 時段選項設定（僅介面，不改引擎）。
// 午後：三擇一，三項皆為既有分頁或朝政行動面板的入口。
// 夜間：二選一（後宮、東廠密報）。「休息」不是卡片選項：未選即為「本夜不採取行動」，
// 不耗行動、不產生效果，故不列為選項。

export const SLOTS = Object.freeze({
  afternoon: Object.freeze({ name: '午後', pick: '三擇一', opts: Object.freeze([
    Object.freeze(['audience', '召見大臣', '前往朝臣，面見在朝諸臣', { tab: 'officials' }]),
    Object.freeze(['review', '校閱軍務', '開啟朝政行動的外交面板（宣戰、結盟）', { panel: 'diplo' }]),
    Object.freeze(['garden', '幸御花園', '前往後宮，見諸嬪妃', { tab: 'harem' }]),
  ]) }),
  night: Object.freeze({ name: '夜間', pick: '二選一', note: '本夜不採取行動：不選即是休息，不耗行動，不產生效果。', opts: Object.freeze([
    Object.freeze(['harem', '後宮', '前往後宮，安排侍寢與嬪妃', { tab: 'harem' }]),
    Object.freeze(['dc', '東廠密報', '前往東廠，閱覽密報與案件', { tab: 'dc' }]),
  ]) }),
});

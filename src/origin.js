// 即位出身：四種即位出身，各自提供開局數值修正、優劣說明與專屬事件。
// 出身以 state.flags["origin:<id>"] 標記，專屬事件（data/events-origin.json）以 flag 條件觸發，事件引擎不需認得出身。
import { setStat } from './state.js';

export const ORIGIN_FLAG_PREFIX = 'origin:';

export const ORIGINS = Object.freeze([
  Object.freeze({
    id: 'dichangzi',
    name: '嫡長子',
    desc: '先帝正宮所出，自幼受冊立為儲，名分最正。',
    pros: ['聲望與仁德起步較高', '天命所歸，上天之心略為偏向'],
    cons: ['久居深宮，武備生疏', '諸王以嫡長為忌，常生非議'],
    statMods: Object.freeze({ prestige: 20, benevolence: 10, heaven: 10, military: -10 }),
  }),
  Object.freeze({
    id: 'shuchu',
    name: '庶出',
    desc: '生母位分卑微，少年即習文墨，以才學立身於宮闈。',
    pros: ['文采與魅力出眾，善於應對朝臣', '不受嫡統拘束，早習人情世故'],
    cons: ['名分不正，聲望起步偏低', '朝中少有根基，權柄難以立即服眾'],
    statMods: Object.freeze({ literature: 30, charm: 20, prestige: -20, power: -10 }),
  }),
  Object.freeze({
    id: 'waifan',
    name: '外藩入繼',
    desc: '自藩邸入承大統，攜藩中舊部與兵馬入京。',
    pros: ['藩中兵甲精銳，軍備與武備充足', '藩邸舊部忠心，可立即調用'],
    cons: ['入繼非由嫡統，天命之說頗有疑慮', '朝中舊臣疑其正統，聲望受損'],
    statMods: Object.freeze({ military: 20, armament: 50, prestige: -10, heaven: -10 }),
  }),
  Object.freeze({
    id: 'jungong',
    name: '軍功篡位',
    desc: '倚靠軍中擁戴與戰功奪取大位，權柄由兵而來。',
    pros: ['軍心所向，兵權與威勢立即在手', '武將效死，征伐之事較易成就'],
    cons: ['仁德有虧，天下以篡逆視之', '文臣多懷二心，上天亦似有所不許'],
    statMods: Object.freeze({ military: 40, power: 20, benevolence: -30, heaven: -20 }),
  }),
]);

// 各出身的專屬事件 id（與 data/events-origin.json 一致）。
const ORIGIN_EVENT_IDS = Object.freeze({
  dichangzi: Object.freeze(['E501', 'E502', 'E503', 'E504']),
  shuchu: Object.freeze(['E505', 'E506', 'E507', 'E508']),
  waifan: Object.freeze(['E509', 'E510', 'E511', 'E512']),
  jungong: Object.freeze(['E513', 'E514', 'E515', 'E516']),
});

const findOrigin = (originId) => {
  const o = ORIGINS.find((x) => x.id === originId);
  if (!o) throw new Error(`unknown origin: ${originId}`);
  return o;
};

// 套用出身：以 setStat 寫入數值修正（越界截斷，不記入警告），設定 state.origin 與出身旗標。回傳同一 state。
export function applyOrigin(state, originId) {
  const origin = findOrigin(originId);
  for (const [key, delta] of Object.entries(origin.statMods)) {
    setStat(state, key, state.stats[key] + delta, { silent: true });
  }
  state.origin = originId;
  state.flags[ORIGIN_FLAG_PREFIX + originId] = true;
  return state;
}

// 該出身的專屬事件 id 清單。
export function originEvents(originId) {
  findOrigin(originId);
  return [...ORIGIN_EVENT_IDS[originId]];
}

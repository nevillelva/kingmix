// 寒門崛起（hanmen）專屬事件的資料（純資料，格式同 data/events.json 的事件）。
//
// 不放入 data/events.json：這些事件只在寒門出身時觸發，預設模擬走不到，
// 若併入主事件庫會被事件覆蓋率測試（tests/sim.test.js，未觸發上限）計入而失敗。
// 每則事件的 when 皆含 flag: 'origin:hanmen'，故只在該出身的局中生效。
// 由 origin.js 的 originEventDefs 讀取，sim.js 於寒門出身時併入事件池。

const FLAG = 'origin:hanmen';

export const HANMEN_EVENTS = Object.freeze([
  Object.freeze({
    id: 'E601',
    name: '寒士舊友求薦',
    speaker: '吏部侍郎',
    narrative: '陛下早年在鄉里的舊友，多年寒窗未第，今隨鄉試榜來求見，言稱只盼一官半職。吏部以為其才可用，然恐朝中以陛下舊交為由非議。',
    when: Object.freeze({ flag: FLAG, chance: 0.05 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '破格擢用，留其在側',
        tone: '仁厚',
        effects: Object.freeze({ benevolence: 5, literature: 3, prestige: -3 }),
      }),
      Object.freeze({
        key: 'B',
        label: '依例銓選，不以私誼用人',
        tone: '穩妥',
        effects: Object.freeze({ prestige: 3, power: 2 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E602',
    name: '同年排擠',
    speaker: '翰林侍講',
    narrative: '朝中同年進士聚會，席間有人以寒族之出相譏，言語雖隱，眾人皆聽得分明。此事若不處置，恐寒士仕途從此更難。',
    when: Object.freeze({ flag: FLAG, chance: 0.05, prestige_lt: 45 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '召見當事者，明言不予寬貸',
        tone: '強硬',
        effects: Object.freeze({ power: 5, prestige: 3, benevolence: -3 }),
      }),
      Object.freeze({
        key: 'B',
        label: '置之不理，以寬大示人',
        tone: '仁厚',
        effects: Object.freeze({ benevolence: 4, prestige: -4 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E603',
    name: '寒門科場',
    speaker: '禮部尚書',
    narrative: '本科會試，寒門士子多有落第者，士林傳言主考偏於世家子弟。禮部請示是否重核落卷，此舉既可服眾，亦恐開科場翻案之例。',
    when: Object.freeze({ flag: FLAG, chance: 0.04, months: Object.freeze([3]) }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '准許重核落卷，遴選寒士入仕',
        tone: '仁厚',
        effects: Object.freeze({ literature: 5, people: 3, prestige: -2 }),
      }),
      Object.freeze({
        key: 'B',
        label: '維持原議，以免科場紛擾',
        tone: '穩妥',
        effects: Object.freeze({ prestige: 2, people: -2 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E604',
    name: '鄉里疾苦',
    speaker: '司農少卿',
    narrative: '陛下少時親歷鄉里疾苦，今有老農自鄉間遠道來京，訴說田賦之重與地方胥吏之苛。司農請示是否下詔寬減，以安民心。',
    when: Object.freeze({ flag: FLAG, chance: 0.05, people_lt: 60 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '下詔減免一年田賦',
        tone: '仁厚',
        effects: Object.freeze({ people: 6, agriculture: 5, treasury: -40 }),
      }),
      Object.freeze({
        key: 'B',
        label: '責成州縣自查，不輕減賦',
        tone: '穩妥',
        effects: Object.freeze({ treasury: 20, people: -3 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E605',
    name: '宗室請削寒權',
    speaker: '宗正寺卿',
    narrative: '宗室諸王聯名上疏，言寒族之主不諳宗法禮制，請陛下另擇世胄輔政。奏疏措辭恭謹，然其意明顯。',
    when: Object.freeze({ flag: FLAG, chance: 0.04, power_lt: 50 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '優禮宗室，暫緩輔政之議',
        tone: '穩妥',
        effects: Object.freeze({ power: 4, prestige: 2, treasury: -20 }),
      }),
      Object.freeze({
        key: 'B',
        label: '駁回奏疏，申明君權',
        tone: '強硬',
        effects: Object.freeze({ power: 6, prestige: -4 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E606',
    name: '舊師入京',
    speaker: '內侍省',
    narrative: '陛下少年時教授文墨的鄉塾老師，年已老邁，聞陛下登基，拄杖千里入京。內侍請示是否以禮接見，並授以官職。',
    when: Object.freeze({ flag: FLAG, chance: 0.04 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '延入內殿，親執弟子之禮',
        tone: '仁厚',
        effects: Object.freeze({ literature: 6, charm: 3, benevolence: 3 }),
      }),
      Object.freeze({
        key: 'B',
        label: '賜金遣歸，以免朝議紛紜',
        tone: '穩妥',
        effects: Object.freeze({ treasury: -15, prestige: 1 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E607',
    name: '寒門商賈',
    speaker: '戶部主事',
    narrative: '一批出身寒微的商賈上書，願獻資助邊糧，並求通商之便。戶部以為此利在國用，然豪族必以寒商奪利為由反對。',
    when: Object.freeze({ flag: FLAG, chance: 0.04, treasury_lt: 300 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '准其獻糧通商，以濟國用',
        tone: '穩妥',
        effects: Object.freeze({ treasury: 60, commerce: 5, prestige: -2 }),
      }),
      Object.freeze({
        key: 'B',
        label: '婉拒其請，以正商賈之道',
        tone: '強硬',
        effects: Object.freeze({ prestige: 3, commerce: -3 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'E608',
    name: '寒士懷才',
    speaker: '翰林院學士',
    narrative: '一名寒士獻上策論，文辭切中時弊，然其家世寒微，朝中有人以為不宜直入殿前。翰林院請示，可否召其面對。',
    when: Object.freeze({ flag: FLAG, chance: 0.05, literature_gt: 60 }),
    options: Object.freeze([
      Object.freeze({
        key: 'A',
        label: '召其殿前應對，親加垂問',
        tone: '仁厚',
        effects: Object.freeze({ literature: 4, charm: 2, prestige: 2 }),
      }),
      Object.freeze({
        key: 'B',
        label: '交由有司考核，不即召見',
        tone: '穩妥',
        effects: Object.freeze({ power: 2, literature: 1 }),
      }),
    ]),
  }),
]);

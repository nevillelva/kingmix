// web/ui/labels.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { PREFECTURE_DEFS } from '../../src/economy.js';
import { MODES } from '../../src/mode.js';

export const STAT = {
  health:{l:'健康',ref:100}, literature:{l:'文學',ref:200}, military:{l:'兵力',ref:200}, power:{l:'權勢',ref:200},
  benevolence:{l:'仁德',ref:200}, prestige:{l:'威儀',ref:100}, charm:{l:'聲色',ref:200}, treasury:{l:'國庫',ref:1000},
  people:{l:'民心',ref:100}, agriculture:{l:'農業',ref:500}, commerce:{l:'商業',ref:600}, armament:{l:'軍備',ref:500},
  heaven:{l:'天命',ref:100}
};

export const FACTION = { qingliu:{l:'清流',c:'#4E7D5B'}, xunggui:{l:'勳貴',c:'#B48A3C'}, hanmen:{l:'寒門',c:'#2E5E7E'} };

export const FAC = id => FACTION[id] || { l: id || '—', c: 'var(--ink-soft)' };

export const ABIL = { intellect:'智', politics:'政', martial:'武', command:'統', virtue:'德' };

export const DC_LABEL = { warn:'告誡', punish:'責罰', prison:'下獄' };

export const DC_HINT = { warn:'口頭告誡，收其野心，回其忠誠', punish:'降職罷黜，震懾同僚', prison:'下獄審訊，或可得其供詞' };

export const OFFICE = { chancellor:'丞相', revenue:'戶部', works:'工部', war:'兵部', prefect:'知府', tutor:'太傅' };

// 官職顯示名：六府知府以 prefect:<府 id> 記錄，顯示為「京兆府知府」等；未知鍵不外露原始字串。
export function officeName(k){
  if (OFFICE[k]) return OFFICE[k];
  if (typeof k === 'string' && k.startsWith('prefect:')) {
    const d = PREFECTURE_DEFS.find(p => p.id === k.slice('prefect:'.length));
    return d ? d.name + '知府' : '知府';
  }
  return '閒置';
}

export const DIPLO_LABEL = { marriage:'聯姻', tribute:'朝貢', ally:'結盟', war:'宣戰', scout:'刺探' };

export const EFFECT_EXTRA = { official_loyalty_add:'官員忠誠', removeOfficial:'罷官', investigate_lowest:'東廠查察', recruit:'徵辟', add_consort:'納妃', birth:'誕育', tutor_teach:'授教', war:'征戰', population_pct:'人口', setFlag:'朝局', collect:'收藏', campaign:'戰役進度', remonstrance:'死諫', diplomacy:'外交' };

export const EFFECT = { ...EFFECT_EXTRA, treasury:'國庫', agriculture:'農業', people:'民心', benevolence:'仁德', prestige:'威儀', charm:'聲色', literature:'文學', military:'兵力', power:'權勢', commerce:'商業', armament:'軍備', heaven:'天命', health:'健康' };

export const NEED_LABEL = { intellect:'智', politics:'政', martial:'武', command:'統', virtue:'德', loyalty:'忠誠' };

export const TOP_GAUGES = ['treasury','people','armament','heaven'];

export const SEASON = {1:'winter',2:'winter',3:'spring',4:'spring',5:'spring',6:'summer',7:'summer',8:'summer',9:'autumn',10:'autumn',11:'autumn',12:'winter'};

export const SCEN_LABEL = { age:'年歲', power:'權勢', people:'民心', treasury:'國庫', turn:'在位月數' };

export const END_WORD = { death:'駕崩', abdicated:'高年致仕', '禪位':'禪位' };

export const SCEN_STATUS = { ongoing:'進行中', won:'已成功', failed:'已失敗' };

export const REASON = { cooldown:'本府本年已修繕', busy:'已有戰事在進行', unknown:'無此鄰國', treasury:'國庫不足', attitude:'好感未達門檻', limit:'盟國已滿', already:'已是盟國', allied:'盟國不可宣戰', timing:'時機未到', inactive:'戰事未開', tactic:'戰術不明' };

export const MODE_TEXT = Object.fromEntries(Object.values(MODES).map(m => [m.key, m.label]));

export const LEGACY_END = { '禪位': '禪位', death: '駕崩', abdicated: '高年致仕', short_end: '短局終局' };

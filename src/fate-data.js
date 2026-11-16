// 人物命運線的文本資料（純資料，不含數值效果）。
//
// 每條命運線（arc）對應一種人物：朝臣依派系、妃嬪依家族、皇子依性別分流。
// 每條線三段 beats，之後以 endings 收束。beat 的 text 可依 variant 分歧，
// 找不到對應 variant 時退回 text.any。
//   after：距上一段至少經過的月數（第一段為 0）
//   minAge：皇嗣專用，年齡未達不觸發
// endings 的鍵為除名或終局的原因：
//   remonstrance（死諫）、dismissed（罷黜）、child_mortality（夭折）、rivalry（奪嫡失勢）、
//   ascended（即位）、survived（終局仍在世）。
// 文中 {name} 於寫入史冊時替換為人物名。

export const OFFICIAL_VARIANT = (bonded, loyalty) => (bonded ? 'bonded' : loyalty >= 50 ? 'loyal' : 'wary');
export const CONSORT_VARIANT = (favor) => (favor >= 50 ? 'favored' : 'cool');
export const HEIR_VARIANT = (isCrownPrince) => (isCrownPrince ? 'crown' : 'other');

export const FATE_ARCS = Object.freeze({
  official: {
    qingliu: {
      beats: [
        { after: 0, text: { any: '{name}以清議立身，初入朝堂便直言朝政得失，同列側目。' } },
        {
          after: 12,
          text: {
            bonded: '{name}屢進忠言，陛下每以正色待之，君臣相得，朝野稱其風骨。',
            loyal: '{name}持守清流本分，奏對有條，陛下漸以腹心視之。',
            wary: '{name}以清議自任，然言多刺上，陛下心生芥蒂，其位漸危。',
          },
        },
        {
          after: 12,
          text: {
            bonded: '{name}垂老不改其節，臨事必先問君心所在，人以為當世名臣。',
            loyal: '{name}勤勉如故，清名日盛，清流多推其為領袖。',
            wary: '{name}遭黨人攻訐，獨立朝堂，孤忠難支。',
          },
        },
      ],
      endings: {
        remonstrance: '{name}以死諫捍衛直道，殿前觸柱而殁，清流以之為心香。',
        slain: '{name}遭刺客所害，清流為之震動，訴案不了了之。',
        dismissed: '{name}以議論不合被貶出朝，清流自此少一名直臣。',
        survived: '{name}終其任，名列清流之首，史臣稱其持正不阿。',
      },
    },
    xunggui: {
      beats: [
        { after: 0, text: { any: '{name}承祖蔭入仕，家風尚武，朝中勳貴多與之交。' } },
        {
          after: 12,
          text: {
            bonded: '{name}以忠勇受陛下倚重，兵政之事多所諮詢，君臣相得。',
            loyal: '{name}恪守勳臣本分，調度有方，宮中頗有稱許。',
            wary: '{name}門第自恃，漸與陛下疏遠，朝中流言四起。',
          },
        },
        {
          after: 12,
          text: {
            bonded: '{name}晚年以勳舊之身善保名節，子弟亦入仕為朝廷效力。',
            loyal: '{name}再以軍功獲封，家聲益隆。',
            wary: '{name}因舊日瑣事為御史所劾，權勢一落千丈。',
          },
        },
      ],
      endings: {
        remonstrance: '{name}力諫不納，自刎於殿前，勳貴皆為之扼腕。',
        slain: '{name}於途中遇刺身亡，陛下下令徹查，案終無果。',
        dismissed: '{name}因故罷去兵權，閒居府中，不復與聞朝政。',
        survived: '{name}善保家業，子孫世襲其爵，史冊記其功過相當。',
      },
    },
    hanmen: {
      beats: [
        { after: 0, text: { any: '{name}出身寒微，憑科舉登第，入朝時孑然一身。' } },
        {
          after: 12,
          text: {
            bonded: '{name}感念陛下知遇，凡事盡心竭力，君臣相得。',
            loyal: '{name}謹守本分，漸得同僚敬重。',
            wary: '{name}寒門入仕，屢受排擠，心中已生去意。',
          },
        },
        {
          after: 12,
          text: {
            bonded: '{name}位至一品，仍不忘寒士出身，常為後進說情。',
            loyal: '{name}任事穩妥，終於得授要職。',
            wary: '{name}遭權貴構陷，被迫求去。',
          },
        },
      ],
      endings: {
        remonstrance: '{name}力諫不納，以死明志，寒門士子為之作誄。',
        slain: '{name}遇刺而亡，寒門同年為之收殮，無人敢言其故。',
        dismissed: '{name}含恨離朝，歸鄉教授鄉童。',
        survived: '{name}善終於家，史冊記其清貧一生。',
      },
    },
  },

  consort: {
    qingliu: {
      beats: [
        { after: 0, text: { any: '{name}入宮侍奉，清流之家遣人送來書卷相賀。' } },
        {
          after: 12,
          text: {
            favored: '{name}以文墨得寵，常伴陛下論書，家風傳入宮中。',
            cool: '{name}性情清冷，不求恩寵，獨居一隅讀書。',
          },
        },
        {
          after: 12,
          text: {
            favored: '{name}在宮闈中清名遠播，後宮女史多以之為模範。',
            cool: '{name}不爭不怨，以詩書自遣，後宮推其端方。',
          },
        },
      ],
      endings: {
        survived: '{name}安然終老宮中，清譽留於宮史。',
      },
    },
    xunggui: {
      beats: [
        { after: 0, text: { any: '{name}入宮侍奉，勳貴之家以兵器為禮，宮人側目。' } },
        {
          after: 12,
          text: {
            favored: '{name}得陛下垂青，兄長因之蒙恩入軍中。',
            cool: '{name}少承恩澤，家族漸有怨言。',
          },
        },
        {
          after: 12,
          text: {
            favored: '{name}家族權勢日盛，外戚之議漸起。',
            cool: '{name}家勢漸衰，宮中少有人問津。',
          },
        },
      ],
      endings: {
        survived: '{name}隨家族榮辱而終，史官記其名於外戚傳。',
      },
    },
    hanmen: {
      beats: [
        { after: 0, text: { any: '{name}入宮侍奉，寒門之女入選，只帶一隻舊箱。' } },
        {
          after: 12,
          text: {
            favored: '{name}自寒微中脫穎，寵愛日隆，人稱宮中新星。',
            cool: '{name}出身寒微，久不得見，只得默默守候。',
          },
        },
        {
          after: 12,
          text: {
            favored: '{name}得封位號，仍念故鄉親族，時常賑濟。',
            cool: '{name}晚年寂寥，常於窗下獨坐。',
          },
        },
      ],
      endings: {
        survived: '{name}終身不忘故里，葬於寒門舊墓之側。',
      },
    },
  },

  heir: {
    male: {
      beats: [
        { after: 0, minAge: 6, text: { any: '{name}年近六歲，開始入學讀書，師傅皆稱其聰慧。' } },
        {
          after: 0,
          minAge: 15,
          text: {
            crown: '{name}已立為太子，入住東宮，諸臣皆來拜見。',
            other: '{name}年至成童，身在諸皇子之列，宮中暗流漸湧。',
          },
        },
        {
          after: 0,
          minAge: 20,
          text: {
            crown: '{name}監國理政，儲位穩固，朝野寄望甚殷。',
            other: '{name}或於奪嫡之爭中嶄露頭角，或默默受封一方。',
          },
        },
      ],
      endings: {
        child_mortality: '{name}年幼染疾，夭折於宮中，陛下傷之久之。',
        rivalry: '{name}於奪嫡之爭中失勢，被黜出京，不知所終。',
        ascended: '{name}即位為帝，改元承統，史稱新君。',
        survived: '{name}守成一方，史冊有其一筆。',
      },
    },
    female: {
      beats: [
        { after: 0, minAge: 6, text: { any: '{name}年幼聰慧，開始由女師教導詩書禮儀。' } },
        { after: 0, minAge: 15, text: { any: '{name}及笄，陛下為其擇配，宮中議論紛紛。' } },
        { after: 0, minAge: 20, text: { any: '{name}下嫁名門，常以德行聞於朝野。' } },
      ],
      endings: {
        child_mortality: '{name}年幼夭折，宮中哀悼。',
        married: '{name}遠嫁異邦，以和親換得數年太平，史冊記其功。',
        survived: '{name}一生安順，終老於府邸，史冊記其賢德。',
      },
    },
  },
});

// 結局原因的標籤（史冊右側）。
export const FATE_END_TAG = Object.freeze({
  remonstrance: '死諫',
  slain: '遇刺',
  dismissed: '罷黜',
  child_mortality: '夭折',
  rivalry: '失勢',
  ascended: '即位',
  married: '和親',
  survived: '善終',
});

// 人物類別的標籤（史冊右側，段落紀錄用）。
export const FATE_ROLE_TAG = Object.freeze({
  official: '朝臣',
  consort: '妃嬪',
  heir_male: '皇子',
  heir_female: '皇女',
});

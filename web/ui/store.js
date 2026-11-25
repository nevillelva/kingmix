// web/ui/store.js：介面共用的可變狀態（單一物件，跨模組讀寫）。
export const U = {
  state: null,
  seed: '',
  tab: 'palace',
  events: [],
  panel: null,
  pick1: null,
  feedback: '',
  reviewedCount: 0,
  reviewPage: 'score',
  accPolicies: ['agrarian'],
  openingDeck: [], // 開局策卡（3–5 張）；空陣列表示沿用全部卡池
  cloud: { db: null, uid: null, snap: null, queue: Promise.resolve() },
  soundOn: true,
  audioCtx: null,
  masterGain: null,
  audioUnlocked: false,
  bgmTimer: null,
  bgmStep: 0,
  pendingAction: null, // 玩家操作進行中（'stamp'）；非 null 時其他玩家操作入口忽略
  lastScreen: null,
  guideArmed: false,
  lastBattle: null,
  battlePrefs: { auto: false, speed: 1 }, // 戰報偏好（UI 狀態，不寫入存檔）
  mapSel: null,
  quarterCard: null,
  milestoneSeed: null,
  milestoneId: null,
  slotPending: null,   // 等待確認覆寫的存檔欄位編號
  saveOpen: false,     // 存檔管理對話框是否開啟
  saveMsg: '',         // 最近一次存檔訊息（同時以提示顯示）
  saveFallback: null,  // 下載失敗時的備援存檔碼 { text, note }
  conflict: null,      // 雲端衝突對話框 { local, remote, winner, resolve }
  ffNote: null,        // 快進停下的說明（game-flow）
  bootError: null,     // 開機錯誤（事件資料載入失敗）
};

// Canvas 版無 DOM 容器；保留欄位以免既有模組於載入時因 undefined 出錯（DOM 不存在時為 null）。
export const app = (typeof document !== 'undefined' && document && typeof document.getElementById === 'function')
  ? document.getElementById('app')
  : null;

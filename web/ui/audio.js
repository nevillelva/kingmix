// web/ui/audio.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { U } from './store.js';

export const SOUND_KEY = 'kingmix-sound';

export function audioReady(){
  if (U.audioCtx) return U.audioCtx;
  try {
    U.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    U.masterGain = U.audioCtx.createGain(); U.masterGain.gain.value = 0.9; U.masterGain.connect(U.audioCtx.destination);
  } catch(e) { U.audioCtx = null; }
  return U.audioCtx;
}

// 單一音：基音頻率乘以泛音比例，指數衰減。
export function partial(freq, when, dur, vol, type, ratio){
  const ac = U.audioCtx; if (!ac || !U.masterGain) return;
  try {
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = freq * (ratio || 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(U.masterGain); o.start(t); o.stop(t + dur + 0.05);
  } catch(e) {}
}

// 古琴：撥弦音（三角波，短促起音、較長餘韻）
export const qin = (freq, when, vol) => { partial(freq, when, 2.4, vol || 0.04, 'triangle'); partial(freq, when, 1.2, (vol || 0.04) * 0.25, 'sine', 2); };

// 磬：清越的單擊，帶非整數泛音
export const qing = when => { partial(660, when, 3.4, 0.09, 'sine'); partial(660, when, 2.2, 0.03, 'sine', 2.76); partial(660, when, 1.4, 0.015, 'sine', 5.4); };

// 鐘：低沉長鳴，泛音錯落
export const zhong = when => { partial(196, when, 5.5, 0.14, 'sine'); partial(196, when, 4.2, 0.06, 'sine', 2.0); partial(196, when, 3.0, 0.05, 'sine', 2.4); partial(196, when, 2.2, 0.035, 'sine', 3.0); };

// 琴曲：D 宮五聲音階，旋律循環，偶爾低音
export const PENTA = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25];

export const PHRASE = [0,2,4,2,5,4,2,0, 3,1,4,6,4,2,1,0, 0,2,3,5,4,2,0,null];

export function bgmTick(){
  if (!U.soundOn || !U.audioCtx) return;
  const idx = PHRASE[U.bgmStep % PHRASE.length]; U.bgmStep++;
  if (idx !== null) qin(PENTA[idx], 0, 0.055);
  if (U.bgmStep % 8 === 1) qin(PENTA[0] / 2, 0, 0.047);
}

export function startBgm(){ if (!U.bgmTimer && U.soundOn) U.bgmTimer = setInterval(bgmTick, 900); }

export function stopBgm(){ if (U.bgmTimer) { clearInterval(U.bgmTimer); U.bgmTimer = null; } }

export function unlockAudio(){
  const ac = audioReady();
  if (!ac) return;
  U.audioUnlocked = true;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  startBgm();
}

export const SFX = {
  pick: () => qing(0),
  win: () => { qing(0); qing(0.22); },
  lose: () => { qin(196, 0, 0.06); qin(165, 0.18, 0.05); },
  end: () => zhong(0),
  bell: () => zhong(0),
};

export function sfx(name){ if (!U.soundOn || !U.audioUnlocked || !U.audioCtx) return; const f = SFX[name]; if (f) f(); }

export function paintSnd(){
  const b = document.getElementById('snd');
  b.textContent = U.soundOn ? '音效：開' : '音效：關';
  b.setAttribute('aria-pressed', String(U.soundOn));
}

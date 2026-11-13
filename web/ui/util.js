// web/ui/util.js：皇帝養成綜合版網頁介面（由 web/index.html 內嵌模組拆分，行為不變）。
import { makeRng } from '../../src/rng.js';
import { OFFICES } from '../../src/offices.js';
import { U } from './store.js';
import { NEED_LABEL, STAT } from './labels.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export const rng = (...parts) => makeRng([U.seed, ...parts]);

export const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ── 雲端存檔（Phase 6）：每位玩家的私有文件，跨裝置可用；無法連線時退回本機存檔 ──
export const useCap = n => (window.claude && window.claude.use) ? window.claude.use(n) : Promise.resolve(null);

// 戰役的月內操作不消耗朝政行動次數。

export function fmt(k, v){
  if (k === 'population') return v >= 10000 ? (v/10000).toFixed(0)+'萬' : Math.round(v);
  return Math.round(v);
}

export const pctOf = k => Math.max(0, Math.min(100, U.state.stats[k] / STAT[k].ref * 100));

export const levelWord = k => { const p = pctOf(k); return p < 25 ? '低' : p > 70 ? '高' : '中'; };

export function meter(k){
  const s = STAT[k], v = U.state.stats[k];
  const pct = pctOf(k);
  const cls = pct < 25 ? 'warn' : pct > 70 ? 'gold' : '';
  return `<div class="meter"><div class="row1"><span>${s.l}</span><b>${fmt(k,v)}</b></div>
    <div class="track"><div class="fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div></div>`;
}

export const hsh = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// 任免官職（校場）：每職列出現任、達標與否、吏部建議；可任命、依建議任命或免職。
export const reqText = k => Object.entries(OFFICES[k].requires).map(([kk, v]) => `${NEED_LABEL[kk]}${v}`).join('、');

export const gapText = gaps => gaps.map(g => `${NEED_LABEL[g.key]} ${Math.round(g.have)}／需${g.need}`).join('、');

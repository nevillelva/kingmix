// web/ui/render-ruler.js：帝王面板（角色卡、五維雷達圖、本質與加成後對照）。
// 入口由朝堂頁以一行加入：${rulerEntryHTML()}；點擊後以對話框開啟，不改動其他頁面的渲染流程。
import { COLLECTIONS } from '../../src/collections.js';
import { eraName } from '../../src/era.js';
import { U } from './store.js';
import { esc } from './util.js';

// 五維：文、武、魅、健康、威望。max 為雷達圖的正規化上限（取自 state.js 的 BOUNDS）。
export const RULER_DIMS = Object.freeze([
  { key: 'literature', label: '文', max: 500 },
  { key: 'military', label: '武', max: 500 },
  { key: 'charm', label: '魅', max: 500 },
  { key: 'health', label: '健康', max: 100 },
  { key: 'prestige', label: '威望', max: 500 },
]);

// 本質（base）＝目前數值扣除已集齊收藏套組的永久加成；加成後（final）＝目前數值。
// 收藏加成於集齊時一次性寫入 stats，故可由 state.collections.bonuses 反推本質值。
export function rulerProfile(state) {
  const bonuses = state.collections?.bonuses ?? [];
  const rows = RULER_DIMS.map((d) => {
    const final = Number(state.stats?.[d.key] ?? 0);
    const bonus = Object.values(COLLECTIONS)
      .filter((set) => bonuses.includes(set.id) && set.bonus.stat === d.key)
      .reduce((sum, set) => sum + set.bonus.amount, 0);
    return { ...d, base: final - bonus, final, bonus };
  });
  const emperor = state.emperor ?? {};
  return {
    name: emperor.name || '皇帝',
    title: [`第${state.dynasty?.generation ?? 1}世`, state.era ? eraName(state) : ''].filter(Boolean).join('・'),
    rows,
  };
}

// 雷達圖（inline SVG）：外框為加成後（實線填色），虛線為本質。顏色走 CSS 變數。
export function radarSVG(rows, size = 240) {
  const c = size / 2;
  const R = size / 2 - 44;
  const n = rows.length;
  const pt = (i, frac) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * R * frac, c + Math.sin(a) * R * frac];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, Math.max(0, Math.min(1, v))).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${rows.map((_, i) => pt(i, f).map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".18"/>`).join('');
  const axes = rows.map((_, i) => {
    const [x, y] = pt(i, 1);
    return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity=".18"/>`;
  }).join('');
  const baseVals = rows.map((r) => r.base / r.max);
  const finalVals = rows.map((r) => r.final / r.max);
  const labels = rows.map((r, i) => {
    const [x, y] = pt(i, 1.22);
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="13" fill="currentColor">${esc(r.label)}</text>`;
  }).join('');
  return `<svg class="ruler-radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="帝王五維雷達圖">
    ${rings}${axes}
    <polygon points="${poly(baseVals)}" fill="none" stroke="currentColor" stroke-dasharray="4 3" stroke-opacity=".6"/>
    <polygon points="${poly(finalVals)}" fill="var(--zhu, #b3261e)" fill-opacity=".22" stroke="var(--zhu, #b3261e)" stroke-width="2"/>
    ${labels}</svg>`;
}

// 面板內容（不含外框）。未開局時回傳提示文字。
export function renderRuler(u = U) {
  if (!u.state) return '<section class="card"><p class="sub">尚未開局，無帝王可觀。</p></section>';
  const p = rulerProfile(u.state);
  const table = p.rows.map((r) => `<tr>
      <th scope="row">${esc(r.label)}</th>
      <td class="num">${r.base}</td>
      <td class="num">${r.final}${r.bonus ? `<span class="hint"> （+${r.bonus}）</span>` : ''}</td></tr>`).join('');
  return `<section class="card ruler-panel" aria-label="帝王面板">
    <div class="ruler-head">
      <div class="ruler-seal" aria-hidden="true">帝</div>
      <div><h2>${esc(p.name)}</h2><div class="kicker">${esc(p.title)}</div></div>
    </div>
    <div class="ruler-body">
      <div class="ruler-radar-wrap">${radarSVG(p.rows)}</div>
      <div class="ruler-cols">
        <table class="ruler-table">
          <caption class="sub">本質 ／ 加成後</caption>
          <thead><tr><th scope="col">屬性</th><th scope="col">本質</th><th scope="col">加成後</th></tr></thead>
          <tbody>${table}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

// 朝堂頁入口（一行）。
export function rulerEntryHTML() {
  return '<button type="button" class="btn ghost mini" data-ruler="open">帝王面板</button>';
}

// 以對話框開啟帝王面板；Esc 或點擊背景即關閉。
export function openRulerDialog() {
  const ov = document.createElement('div');
  ov.className = 'dlg-ov';
  ov.innerHTML = `<div class="dlg ruler-dlg" role="dialog" aria-modal="true" aria-label="帝王面板">
      ${renderRuler(U)}
      <div class="dlg-btns"><button type="button" class="btn zhu mini" data-ruler="close">返回朝堂</button></div>
    </div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-ruler="close"]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  ov.querySelector('[data-ruler="close"]').focus();
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('[data-ruler="open"]')) openRulerDialog();
  });
}

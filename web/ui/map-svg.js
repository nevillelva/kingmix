// web/ui/map-svg.js：全國輿圖的水墨風格 SVG 素材（純 inline SVG，不載入任何外部圖片）。
// 只提供濾鏡、裝飾筆觸與府印徽章；版圖座標與互動仍由 render-map.js 掌握。

// 水墨暈染：以噪聲位移讓邊緣不規則，再以模糊疊一層淡墨，模擬宣紙渲染。
export const INK_DEFS = `<defs>
  <filter id="ink-edge" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="ink-wash" x="-5%" y="-5%" width="110%" height="110%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b"/>
    <feOffset in="b" dx="1" dy="1.5" result="o"/>
    <feComponentTransfer in="o" result="sh"><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

// 山脈與河流的淡墨裝飾（僅示意，不具地理比例）。
export const INK_BACKDROP = `<g class="ink-deco" aria-hidden="true" pointer-events="none" filter="url(#ink-edge)">
  <path d="M28 70 q6 -10 12 0 q6 -12 12 0 M34 66 q6 -8 12 0" fill="none" stroke="var(--ink-soft)" stroke-width="1" opacity=".45"/>
  <path d="M236 14 q6 -10 12 0 q6 -12 12 0" fill="none" stroke="var(--ink-soft)" stroke-width="1" opacity=".4"/>
  <path d="M316 120 q6 -10 12 0 q6 -12 12 0" fill="none" stroke="var(--ink-soft)" stroke-width="1" opacity=".4"/>
  <path d="M10 300 q6 -10 12 0 q6 -12 12 0" fill="none" stroke="var(--ink-soft)" stroke-width="1" opacity=".4"/>
  <path d="M20 40 C60 60 90 30 130 52 S200 74 240 44 S300 60 330 40" fill="none" stroke="var(--azure)" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>
</g>`;

// 府印徽章：圓形印記內放知府姓氏首字，代表該府主官。
export function governorBadge(x, y, char) {
  const c = (char || '—').slice(0, 1);
  return `<g class="gbadge" pointer-events="none" transform="translate(${x} ${y})">
    <circle r="11" fill="var(--ink)" stroke="var(--gold)" stroke-width="1.6"/>
    <text y="4.5" text-anchor="middle" style="fill:var(--seal-fg);font:700 12px/1 var(--serif)">${escapeText(c)}</text>
  </g>`;
}

// 城防色：低、中、高以朱、金、青綠三色淡染，取自現有 CSS 變數，深色模式亦可讀。
export function defenseFill(v) {
  if (v < 40) return 'color-mix(in srgb, var(--vermilion) 38%, var(--paper))';
  if (v < 70) return 'color-mix(in srgb, var(--gold) 38%, var(--paper))';
  return 'color-mix(in srgb, var(--green) 38%, var(--paper))';
}

// 民心色：全國單一數值，以同一組三色表示，供頂部徽記使用。
export function peopleFill(v) {
  if (v < 40) return 'var(--vermilion)';
  if (v < 70) return 'var(--gold)';
  return 'var(--green)';
}

// 地圖專用樣式，內嵌於輿圖區塊，寬螢幕時地圖與側欄並列，手機 390px 則上下排列。
export const MAP_CSS = `<style>
.map-wrap{display:grid;gap:12px}
.map-wrap .plan.map{position:relative}
.map-wrap .pdetail{border:1px solid var(--line);border-radius:4px;padding:12px;background:var(--silk)}
.map-wrap .pdetail .name{font:900 17px/1.3 var(--serif);letter-spacing:.06em}
.map-wrap .pdetail .row{font-size:13px;color:var(--ink-soft);margin:4px 0}
.map-wrap .pdetail .btn[disabled]{opacity:.5;cursor:not-allowed}
.map-wrap .legend{font-size:12px;color:var(--ink-soft);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.map-wrap .legend i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:4px;border:1px solid var(--line)}
@media (min-width:640px){.map-wrap{grid-template-columns:minmax(0,1.5fr) minmax(220px,1fr);align-items:start}}
</style>`;

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

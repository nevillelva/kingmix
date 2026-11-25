// web/ui/canvas/bfx.js：B 的薄包裝（宮城與后宮系列）。把以邏輯像素給定的字級換算為 C.U，並統一 A 的元件簽名。
// 不含任何規則；只影響繪製。
import { C } from './core.js';
import { text, button, panel } from './widgets.js';

// 文字：size 為邏輯像素（乘 C.U）。回傳高度（像素），供排版累加。
export function tx(str, x, y, size = 14, o = {}) {
  return text(String(str ?? ''), x, y, { ...o, size: size * C.U });
}

// 按鈕：ghost 為淺色底；disabled 不回應點擊（why 為提示）。
export function btn(x, y, w, h, label, onClick, o = {}) {
  button(x, y, w, h, label, onClick, {
    lac: o.ghost ? false : true,
    off: !!o.disabled,
    why: o.why,
    sub: o.sub,
    fs: o.fs,
  });
}

// 面板：紙本底（預設）；block 時吃掉面板內點擊（對話框用）。
export function pnl(x, y, w, h, o = {}) {
  panel(x, y, w, h, { fill: o.fill, block: !!o.block, lac: !!o.lac, dark: !!o.dark });
}

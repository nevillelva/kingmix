// web/ui/render-bus.js：渲染註冊點（葉節點，不 import 任何模組）。
// 各模組以 render() 請求重繪，實際的整頁渲染函式由 render-nav.js 於載入時以 setRenderer 註冊，
// 如此 render-nav 不再被其他 ui 模組反向 import，打破循環依賴。
let renderer = null;

export function setRenderer(fn) {
  renderer = fn;
}

export function render() {
  return renderer ? renderer() : undefined;
}

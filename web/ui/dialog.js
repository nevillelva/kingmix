// web/ui/dialog.js：統一覆蓋層。Esc 關閉、焦點設定、移除時清除 keydown 監聽（含外部已移除節點的情況）。

// openDialog({ html, className, attrs, initialFocus, onClose, onClick })
//   html         覆蓋層內部 HTML
//   className    外層 class（預設 'dlg-ov'）
//   attrs        外層額外屬性（例如 role、aria-modal）
//   initialFocus 焦點目標：選擇器字串，或函式 (overlay) => Element
//   onClose      關閉時呼叫一次
//   onClick      外層點擊回呼 (event, close)；未提供則點擊不關閉
// 回傳 close()；亦於其 .el 屬性掛上外層元素。重複呼叫 close 無副作用。
export function openDialog({ html, className = 'dlg-ov', attrs = {}, initialFocus, onClose, onClick } = {}) {
  const ov = document.createElement('div');
  ov.className = className;
  for (const [k, v] of Object.entries(attrs)) ov.setAttribute(k, v);
  ov.innerHTML = html;

  let closed = false;
  const onKey = (e) => {
    // 外部已將節點移除時，直接清理監聽，不再處理。
    if (!ov.isConnected) return cleanup();
    if (e.key === 'Escape') close();
  };
  const cleanup = () => { document.removeEventListener('keydown', onKey); };
  const close = () => {
    if (closed) return;
    closed = true;
    cleanup();
    ov.remove();
    if (onClose) onClose();
  };

  if (onClick) ov.addEventListener('click', (e) => onClick(e, close));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);

  if (initialFocus) {
    const target = typeof initialFocus === 'function' ? initialFocus(ov) : ov.querySelector(initialFocus);
    if (target && target.focus) target.focus();
  }

  close.el = ov;
  return close;
}

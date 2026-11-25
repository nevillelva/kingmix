// web/ui/legacy-store.js：歷代帝王（史冊）跨局紀錄的讀取鍵值。無渲染依賴，供 render-legacy 與 canvas/legacy-stats 共用（避免循環依賴）。
export const LEGACY_KEY = 'kingmix-legacy-v1';
export function loadLegacy(){ try { const r = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }

// web/ui/event-pool.js：網頁端局中事件池。基礎事件庫（U.events，來自 data/events.json）依 state.origin 併入出身專屬事件，
// 與模擬器（src/sim.js）採同一函式 withOriginEvents，避免兩套邏輯。合併結果只存在於呼叫端，不寫回 U.events 或存檔。
import { withOriginEvents } from '../../src/origin.js';
import { U } from './store.js';

// 純函式：無出身（舊存檔或尚未套用出身）時原樣回傳基礎事件庫，行為與合併前完全相同。
export function gameEventPool(events, state) {
  return state && state.origin ? withOriginEvents(events, state.origin) : events;
}

// 目前局的事件池（讀取當下的 U.state，故讀檔與開局後皆正確）。
export function currentEventPool() {
  return gameEventPool(U.events, U.state);
}

// 依 id 於目前局的事件池中查找（含出身專屬事件）；找不到回傳 undefined。
export function findPoolEvent(id) {
  return currentEventPool().find((x) => x.id === id);
}

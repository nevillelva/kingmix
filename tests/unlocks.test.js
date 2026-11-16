import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNLOCK_RULES, UNLOCK_RECORD_VERSION, emptyUnlockRecord, normalizeUnlockRecord,
  readUnlockRecord, writeUnlockRecord, recordEarnedTitles, isUnlocked, unlockedIds, unlockRequirementText,
} from '../src/unlocks.js';
import { createInitialState } from '../src/state.js';
import { ORIGINS, UNLOCKABLE_ORIGINS, applyOrigin, originEvents } from '../src/origin.js';
import { SCENARIO_IDS, UNLOCKABLE_SCENARIOS, createScenarioState, evaluateScenario, scenarioDef } from '../src/scenarios.js';
import {
  POLICY_CARD_IDS, UNLOCKABLE_POLICY_CARDS, policyCardDef, setUnlockedPolicyCards, drawPolicyCards, activeSynergies,
} from '../src/cards.js';
import { makeRng } from '../src/rng.js';

const KEY = 'kingmix-unlocks-v1';
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const throwingStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };

after(() => setUnlockedPolicyCards([]));

test('預設紀錄為空且版本為 1；基本內容恆為已解鎖', () => {
  assert.deepEqual(emptyUnlockRecord(), { version: UNLOCK_RECORD_VERSION, titles: [], biographies: [] });
  assert.equal(isUnlocked(emptyUnlockRecord(), 'origin', 'dichangzi'), true);
  assert.equal(isUnlocked(emptyUnlockRecord(), 'scenario', 'steady'), true);
});

test('每條解鎖規則指向的稱號皆存在於 titles.js', () => {
  for (const kind of Object.keys(UNLOCK_RULES)) {
    for (const title of Object.values(UNLOCK_RULES[kind])) {
      assert.match(title, /^[一-鿿]+$/, title);
    }
  }
  assert.equal(Object.keys(UNLOCK_RULES.origin).length, 1);
  assert.equal(Object.keys(UNLOCK_RULES.scenario).length, 1);
  assert.equal(Object.keys(UNLOCK_RULES.card).length, 1);
});

test('normalizeUnlockRecord: 遷移與容錯（缺版本號、非物件、未知稱號、重複）', () => {
  assert.deepEqual(normalizeUnlockRecord(null), emptyUnlockRecord());
  assert.deepEqual(normalizeUnlockRecord('x'), emptyUnlockRecord());
  assert.deepEqual(normalizeUnlockRecord({ titles: ['博士', '博士', '不存在', 3] }), { version: 2, titles: ['博士'], biographies: [] });
  assert.deepEqual(normalizeUnlockRecord({ titles: 'bad' }), { version: 2, titles: [], biographies: [] });
});

test('readUnlockRecord: 無資料、損毀 JSON、儲存拋錯皆回傳預設值，不拋錯', () => {
  const s = memStorage();
  assert.deepEqual(readUnlockRecord(s, KEY), { record: emptyUnlockRecord(), readOnly: false });
  s.setItem(KEY, '{壞掉');
  assert.deepEqual(readUnlockRecord(s, KEY).record, emptyUnlockRecord());
  assert.deepEqual(readUnlockRecord(throwingStorage, KEY), { record: emptyUnlockRecord(), readOnly: false });
});

test('readUnlockRecord: 較新版本的紀錄為唯讀，不被覆寫', () => {
  const s = memStorage();
  s.setItem(KEY, JSON.stringify({ version: 99, titles: ['博士'] }));
  const r = readUnlockRecord(s, KEY);
  assert.equal(r.readOnly, true);
  assert.deepEqual(r.record, emptyUnlockRecord());
});

test('writeUnlockRecord: 成功回傳 true 並可讀回；儲存失敗回傳 false 而不拋錯', () => {
  const s = memStorage();
  const rec = { version: 2, titles: ['博士'], biographies: [] };
  assert.equal(writeUnlockRecord(s, KEY, rec), true);
  assert.deepEqual(readUnlockRecord(s, KEY).record, rec);
  let ok = null;
  assert.doesNotThrow(() => { ok = writeUnlockRecord(throwingStorage, KEY, rec); });
  assert.equal(ok, false);
  assert.equal(writeUnlockRecord(undefined, KEY, rec), false);
});

test('recordEarnedTitles: 由 state.flags 的稱號併入紀錄，無新增時內容不變', () => {
  const state = createInitialState('unlock-1');
  state.flags['title.literature.100'] = '博士';
  const first = recordEarnedTitles(emptyUnlockRecord(), state);
  assert.deepEqual(first.titles, ['博士']);
  const again = recordEarnedTitles(first, state);
  assert.deepEqual(again.titles, ['博士']);
  // 跨局保留：另一局沒有稱號時，先前獲得的仍在
  const fresh = createInitialState('unlock-2');
  assert.deepEqual(recordEarnedTitles(first, fresh).titles, ['博士']);
});

test('isUnlocked / unlockedIds: 達成對應稱號後解鎖新出身、新劇本、新策卡', () => {
  const none = emptyUnlockRecord();
  assert.equal(isUnlocked(none, 'origin', 'hanmen'), false);
  assert.equal(isUnlocked(none, 'scenario', 'wenzhi'), false);
  assert.equal(isUnlocked(none, 'card', 'wu_drill'), false);
  assert.deepEqual(unlockedIds(none, 'card'), []);
  const won = { version: 1, titles: ['博士', '鴻儒', '名將'] };
  assert.equal(isUnlocked(won, 'origin', 'hanmen'), true);
  assert.equal(isUnlocked(won, 'scenario', 'wenzhi'), true);
  assert.deepEqual(unlockedIds(won, 'card'), ['wu_drill']);
});

test('unlockRequirementText: 說明稱號名與屬性門檻；未知項目回傳空字串', () => {
  assert.equal(unlockRequirementText('origin', 'hanmen'), '需達成稱號「博士」（文學達 100）');
  assert.equal(unlockRequirementText('card', 'wu_drill'), '需達成稱號「名將」（武略達 150）');
  assert.equal(unlockRequirementText('origin', 'nope'), '');
});

test('新出身：可套用、具正負數值修正，且不列入預設 ORIGINS', () => {
  assert.equal(ORIGINS.some((o) => o.id === 'hanmen'), false);
  assert.equal(ORIGINS.length, 4);
  const hanmen = UNLOCKABLE_ORIGINS.find((o) => o.id === 'hanmen');
  assert.ok(Object.values(hanmen.statMods).some((v) => v > 0));
  assert.ok(Object.values(hanmen.statMods).some((v) => v < 0));
  const s = applyOrigin(createInitialState('h-1'), 'hanmen');
  assert.equal(s.origin, 'hanmen');
  assert.equal(originEvents('hanmen').length, 8); // 寒門崛起專屬事件（src/origin-events-data.js）
});

test('新劇本：不列入 SCENARIO_IDS；可建立、可評估，20 個種子不崩潰', () => {
  assert.equal(SCENARIO_IDS.includes('wenzhi'), false);
  assert.equal(scenarioDef('wenzhi').name, UNLOCKABLE_SCENARIOS.wenzhi.name);
  for (let n = 0; n < 20; n++) {
    const s = createScenarioState(`wz-${n}`, 'wenzhi');
    assert.equal(s.scenario.id, 'wenzhi');
    assert.equal(s.stats.literature, 150);
    const p = evaluateScenario(s);
    assert.equal(p.status, 'ongoing');
  }
});

test('新策卡：預設抽卡池不含之；注入後可被抽出且月修正可計算', () => {
  assert.equal(POLICY_CARD_IDS.includes('wu_drill'), false);
  assert.equal(policyCardDef('wu_drill').name, UNLOCKABLE_POLICY_CARDS.wu_drill.name);

  const base = [];
  for (let n = 0; n < 30; n++) base.push(drawPolicyCards(createInitialState(`cd-${n}`), makeRng([`cd-${n}`, 1, 'cards'])));
  assert.ok(base.every((ids) => !ids.includes('wu_drill')));

  setUnlockedPolicyCards(['wu_drill', 'not_a_card']);
  let seen = false;
  for (let n = 0; n < 30 && !seen; n++) {
    const st = createInitialState(`cd-${n}`);
    seen = drawPolicyCards(st, makeRng([`cd-${n}`, 1, 'cards'])).includes('wu_drill');
  }
  assert.equal(seen, true);

  setUnlockedPolicyCards([]);
  const after1 = [];
  for (let n = 0; n < 30; n++) after1.push(drawPolicyCards(createInitialState(`cd-${n}`), makeRng([`cd-${n}`, 1, 'cards'])));
  assert.deepEqual(after1, base, '取消注入後抽卡結果與原本完全相同');
});

test('新策卡：可參與協同計算', () => {
  setUnlockedPolicyCards(['wu_drill']);
  const st = createInitialState('syn-1');
  st.policyCards = { active: ['wu_drill', 'confucian_school'], offer: null };
  const syn = activeSynergies(st);
  assert.ok(syn.some((x) => x.id === 'wen_wu'), '講武練兵（軍）與尊儒興學（文）應觸發文武並用');
  setUnlockedPolicyCards([]);
});

test('syncUnlocks（介面儲存層）: 併入稱號、寫入 localStorage、寫入失敗時回報 writeFailed 且本次仍解鎖', async () => {
  const store = memStorage();
  globalThis.localStorage = store;
  const mod = await import('../web/ui/unlock-store.js');
  const state = createInitialState('sync-1');
  state.flags['title.literature.100'] = '博士';
  const r = mod.syncUnlocks(state);
  assert.deepEqual(r.record.titles, ['博士']);
  assert.equal(r.writeFailed, false);
  assert.deepEqual(JSON.parse(store.getItem(mod.UNLOCK_KEY)).titles, ['博士']);

  // 寫入失敗：記憶體仍保留解鎖，並回報 writeFailed
  globalThis.localStorage = throwingStorage;
  const s2 = createInitialState('sync-2');
  s2.flags['title.military.150'] = '名將';
  const r2 = mod.syncUnlocks(s2);
  assert.equal(r2.writeFailed, true);
  assert.ok(r2.record.titles.includes('名將'));
  assert.deepEqual(mod.loadUnlocks().titles.sort(), ['博士', '名將']);
  setUnlockedPolicyCards([]);
});

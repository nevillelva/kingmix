import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { ASSASSIN_LOW_LOYALTY } from '../src/assassination.js';
import { GENERAL_MARTIAL_MIN, isGeneral, buildGeneralCard } from '../src/general-cards.js';
import { generateOfficial } from '../src/officials.js';
import { makeRng } from '../src/rng.js';

const uiSource = readFileSync(new URL('../web/ui/render-officials.js', import.meta.url), 'utf8');

// 忠誠門檻統一：UI 一律引用 ASSASSIN_LOW_LOYALTY，不再寫死 40。
test('忠誠門檻統一：render-officials 自 assassination.js 匯入常數，且不再以 40 為門檻', () => {
  assert.match(uiSource, /import \{ ASSASSIN_LOW_LOYALTY \} from '\.\.\/\.\.\/src\/assassination\.js'/);
  assert.equal(/loy\s*[<>]=?\s*40\b|loyalty\s*<\s*40\b/.test(uiSource), false, '不得出現忠誠 40 門檻');
  assert.equal(ASSASSIN_LOW_LOYALTY, 50);
});

test('態度分級：效忠 60、觀望 50–60、離心低於 50（以常數作下限）', () => {
  assert.match(uiSource, /loy >= 60 \? '效忠' : loy >= ASSASSIN_LOW_LOYALTY \? '觀望' : '離心'/);
  assert.match(uiSource, /fill\$\{loy < ASSASSIN_LOW_LOYALTY \? ' warn' : ''\}/);
});

test('武將標記確定性：相同官員物件結果相同，且判定只讀取武略', () => {
  const o = { id: 'x', abilities: { martial: 60 } };
  assert.equal(isGeneral(o), isGeneral({ ...o }));
  assert.equal(isGeneral({ abilities: { martial: GENERAL_MARTIAL_MIN } }), true);
  assert.equal(isGeneral({ abilities: { martial: GENERAL_MARTIAL_MIN - 1 } }), false);
  assert.equal(isGeneral({ abilities: {} }), false);
  assert.equal(isGeneral({}), false);
  assert.equal(isGeneral(null), false);
});

test('武將標記確定性：相同 seed 產生的官員標記完全相同', () => {
  const mark = (seed) => createInitialState(seed).officials.map(isGeneral);
  assert.deepEqual(mark('seed-a'), mark('seed-a'));
  const rngA = makeRng(['gen-mark']);
  const rngB = makeRng(['gen-mark']);
  const a = Array.from({ length: 20 }, (_, i) => isGeneral(generateOfficial(rngA, 'g' + i)));
  const b = Array.from({ length: 20 }, (_, i) => isGeneral(generateOfficial(rngB, 'g' + i)));
  assert.deepEqual(a, b);
});

test('武將標記不改動官員物件（不新增欄位，存檔格式不變）', () => {
  const s = createInitialState('marker-test');
  const before = JSON.stringify(s.officials);
  s.officials.forEach(isGeneral);
  assert.equal(JSON.stringify(s.officials), before);
  assert.equal(s.officials.every((o) => !('general' in o) && !('isGeneral' in o)), true);
});

test('只有武將才走將領卡：render-officials 以 isGeneral 分流，非武將使用小卡', () => {
  assert.match(uiSource, /isGeneral\(o\) \? generalCard\(o\) : officialCard\(o\)/);
});

test('開局即有武將與朝臣並存（測試基準）', () => {
  const s = createInitialState('mix-check');
  const gens = s.officials.filter(isGeneral);
  assert.ok(gens.length > 0, '開局應至少有一位武將');
  assert.ok(gens.length < s.officials.length, '開局應至少有一位非武將朝臣');
  for (const o of gens) assert.equal(buildGeneralCard(o).name !== '', true);
});

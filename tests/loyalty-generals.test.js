import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/state.js';
import { ASSASSIN_LOW_LOYALTY } from '../src/assassination.js';
import { MILITARY_OFFICES, isGeneral, buildGeneralCard } from '../src/general-cards.js';
import { generateOfficial, isCourtOfficial } from '../src/officials.js';
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

test('武將判定確定性：相同官員物件結果相同，且判定只讀取所任職位', () => {
  const o = { id: 'x', office: 'war', abilities: { martial: 60 } };
  assert.equal(isGeneral(o), isGeneral({ ...o }));
  assert.equal(isGeneral(o), true);
  assert.equal(isGeneral({ ...o, abilities: { martial: 0 } }), true, '武略不影響判定');
});

test('武將判定確定性：相同 seed 指派相同職位後，武將標記完全相同', () => {
  const mark = (seed) => {
    const s = createInitialState(seed);
    s.officials[0].office = 'war';
    return s.officials.map(isGeneral);
  };
  assert.deepEqual(mark('seed-a'), mark('seed-a'));
  const rngA = makeRng(['gen-mark']);
  const rngB = makeRng(['gen-mark']);
  const a = Array.from({ length: 20 }, (_, i) => isGeneral({ ...generateOfficial(rngA, 'g' + i), office: 'war' }));
  const b = Array.from({ length: 20 }, (_, i) => isGeneral({ ...generateOfficial(rngB, 'g' + i), office: 'war' }));
  assert.deepEqual(a, b);
  assert.ok(a.every(Boolean));
});

test('武職判定：職位在武職清單者為武將（目前為兵部尚書 war）', () => {
  assert.deepEqual(MILITARY_OFFICES, ['war']);
  assert.equal(isGeneral({ office: 'war' }), true);
});

test('非武職判定：文官職位與知府職位皆非武將，即使武略很高', () => {
  for (const office of ['chancellor', 'revenue', 'works', 'tutor', 'prefect:jizhou']) {
    assert.equal(isGeneral({ office, abilities: { martial: 100 } }), false, office);
  }
});

test('無職位防呆：office 為 null、缺欄位或輸入無效時皆視為非武將，且不拋例外', () => {
  assert.equal(isGeneral({ office: null, abilities: { martial: 100 } }), false);
  assert.equal(isGeneral({ abilities: { martial: 100 } }), false);
  assert.equal(isGeneral({}), false);
  assert.equal(isGeneral({ office: 123 }), false);
  assert.equal(isGeneral(null), false);
  assert.equal(isGeneral(undefined), false);
  assert.doesNotThrow(() => isGeneral('war'));
});

test('武將判定不改動官員物件（不新增欄位，存檔格式不變）', () => {
  const s = createInitialState('marker-test');
  s.officials[0].office = 'war';
  const before = JSON.stringify(s.officials);
  s.officials.forEach(isGeneral);
  assert.equal(JSON.stringify(s.officials), before);
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

test('開局朝堂四位官員皆無武職，故無將領卡（依職位判定的結果）', () => {
  const s = createInitialState('mix-check');
  const court = s.officials.filter(isCourtOfficial);
  assert.equal(court.length, 4, '朝臣為四位（知府另計，不在朝堂分組）');
  assert.equal(court.filter(isGeneral).length, 0);
});

test('兵部尚書任命後，該官員判為武將並可產生將領卡資料，其餘朝臣維持非武將', () => {
  const s = createInitialState('mix-check');
  const target = s.officials.find((o) => o.id === 'o3');
  target.office = 'war';
  const gens = s.officials.filter(isGeneral);
  assert.deepEqual(gens.map((o) => o.id), ['o3']);
  assert.equal(buildGeneralCard(gens[0]).office, 'war');
  assert.equal(buildGeneralCard(gens[0]).name !== '', true);
});

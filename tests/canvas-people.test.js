// 人物頭像（web/ui/canvas/people.js）煙霧測試：以替身 canvas 上下文繪製各種類，不得拋錯。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const people = await import('../web/ui/canvas/people.js');
const { KINDS, kindOf, personStyle, personFromRecord, drawPerson, drawPlate, lacquerCard, shade } = people;

// 替身 canvas：所有方法皆為空操作，記錄呼叫次數以確認有實際繪製。
function stubCtx() {
  const calls = { total: 0 };
  const grad = () => ({ addColorStop() {} });
  const target = {
    createLinearGradient: grad,
    createRadialGradient: grad,
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === '__calls') return calls;
      if (prop in obj) return obj[prop];
      return () => { calls.total++; return undefined; };
    },
    set(obj, prop, value) { obj[prop] = value; return true; },
    has() { return true; },
  });
}

test('kindOf：皇帝、女子、武將、年長、一般朝臣與未知', () => {
  assert.equal(kindOf({ emperor: true }), 'emp');
  assert.equal(kindOf({ female: true, age: 70 }), 'f');
  assert.equal(kindOf({ general: true, age: 30 }), 'gen');
  assert.equal(kindOf({ age: 60 }), 'old');
  assert.equal(kindOf({ age: 59 }), 'min');
  assert.equal(kindOf({ unknown: true }), '?');
  assert.equal(kindOf({}), 'min');
});

test('personStyle：未知種類退為 min，robe 等色彩原樣保留', () => {
  assert.equal(personStyle('bogus').k, 'min');
  assert.equal(personStyle('gen', { robe: '#123456' }).robe, '#123456');
});

test('personFromRecord：只讀欄位，不改傳入物件', () => {
  const rec = Object.freeze({ age: 41, gender: 'f' });
  const p = personFromRecord(rec, { general: false });
  assert.equal(p.k, 'f');
  assert.equal(personFromRecord({ age: 66 }).k, 'old');
  assert.equal(personFromRecord({}, { emperor: true }).k, 'emp');
  assert.equal(personFromRecord({}, { robe: '#abcdef' }).robe, '#abcdef');
});

test('drawPerson：每一種類與未知皆可繪製，且確實呼叫繪圖指令', () => {
  for (const k of KINDS) {
    const ctx = stubCtx();
    assert.doesNotThrow(() => drawPerson(ctx, 10, 20, 80, 100, personStyle(k), { u: 1, t: 0.5 }), k);
    assert.ok(ctx.__calls.total > 0, `kind ${k} 應有繪製呼叫`);
  }
});

test('drawPerson：缺省參數（無 env、無 p）亦不拋錯', () => {
  assert.doesNotThrow(() => drawPerson(stubCtx(), 0, 0, 40, 50));
});

test('drawPlate／lacquerCard：紅漆金邊與名牌可繪製', () => {
  assert.doesNotThrow(() => drawPlate(stubCtx(), 0, 0, 60, 18, '朕'));
  assert.doesNotThrow(() => lacquerCard(stubCtx(), 0, 0, 120, 60, { dark: true }));
});

test('shade：與 v2 同式，正值調亮、負值調暗', () => {
  assert.equal(shade('#000000', 0.5), 'rgb(128,128,128)');
  assert.equal(shade('#ffffff', -0.5), 'rgb(128,128,128)');
});

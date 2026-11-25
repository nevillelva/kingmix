// 任期（officeSince）測試：任命時寫入起始年月，免職或被換任時清除；舊存檔無此欄位時不拋錯。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createInitialState } = await import('../src/state.js');
const { assignOffice, dismissOffice, officeHolder } = await import('../src/offices.js');

function fresh(seed) {
  const s = createInitialState(seed);
  s.year = 7;
  s.month = 4;
  for (const o of s.officials) o.office = null;
  return s;
}

test('任命時寫入當前年月為任期起點', () => {
  const s = fresh('tenure-assign');
  const [a] = s.officials;
  assignOffice(s, a.id, 'chancellor');
  assert.deepEqual(a.officeSince, { year: 7, month: 4 });
});

test('同一官職換人：舊任者清除任期，新任者記錄自己的起點', () => {
  const s = fresh('tenure-replace');
  const [a, b] = s.officials;
  assignOffice(s, a.id, 'revenue');
  s.year = 9; s.month = 11;
  assignOffice(s, b.id, 'revenue');
  assert.equal(a.office, null);
  assert.equal(a.officeSince, null);
  assert.deepEqual(b.officeSince, { year: 9, month: 11 });
  assert.equal(officeHolder(s, 'revenue'), b);
});

test('免職後任期清除', () => {
  const s = fresh('tenure-dismiss');
  const [a] = s.officials;
  assignOffice(s, a.id, 'works');
  dismissOffice(s, 'works');
  assert.equal(a.office, null);
  assert.equal(a.officeSince, null);
});

test('舊存檔（無 officeSince 欄位）的在任大臣：讀取端視為無紀錄，不拋錯', async () => {
  const { ministerTenureText } = await import('../web/ui/canvas/ministers.js');
  assert.equal(ministerTenureText({ office: 'chancellor' }), '任期　尚無紀錄');
  assert.equal(ministerTenureText({ office: 'chancellor', officeSince: null }), '任期　尚無紀錄');
  assert.equal(ministerTenureText({ office: 'chancellor', officeSince: { year: 3 } }), '任期　尚無紀錄');
  assert.equal(ministerTenureText({ office: 'chancellor', officeSince: { year: 7, month: 4 } }), '任期　自第7年4月起');
});

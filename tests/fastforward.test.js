import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastForwardPause, FF_THRESHOLDS } from '../src/fastforward.js';

const base = () => ({ alive: true, stats: { treasury: 200, people: 80, power: 100 }, campaign: null, dongchang: { cases: [] } });

test('無事發生時可以快進', () => {
  assert.equal(fastForwardPause(base()), null);
});

test('駕崩、親征、東廠把柄會停下，一般奏摺不停', () => {
  assert.equal(fastForwardPause({ ...base(), alive: false }), 'death');
  assert.equal(fastForwardPause({ ...base(), campaign: { status: 'active' } }), 'campaign');
  assert.equal(fastForwardPause({ ...base(), dongchang: { cases: [{ status: 'leverage' }] } }), 'leverage');
  assert.equal(fastForwardPause(base()), null);
});

test('國庫、民心、皇權低於門檻時停下', () => {
  const s = (k, v) => { const st = base(); st.stats[k] = v; return st; };
  assert.equal(fastForwardPause(s('treasury', FF_THRESHOLDS.treasury - 1)), 'treasury');
  assert.equal(fastForwardPause(s('people', FF_THRESHOLDS.people - 1)), 'people');
  assert.equal(fastForwardPause(s('power', FF_THRESHOLDS.power - 1)), 'power');
});

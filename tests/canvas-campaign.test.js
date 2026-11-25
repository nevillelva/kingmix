import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── 替身 DOM：web/ui/fx.js 經由 store.js、render-bus.js 於載入時讀取 document／window（與 ui-split-busy.test.js 相同做法）。
{
  const stub = () => new Proxy(function () {}, {
    get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub(), set: () => true,
  });
  globalThis.document ??= { getElementById: () => null, createElement: () => stub(), body: stub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window ??= globalThis;
}

const { TACTICS } = await import('../src/war.js');
const {
  UNIT_CHAIN, unitBeats, counterPairs, reduceBattlePrefs, advanceShown, skipShown,
  battleLines, tacticOptions, campaignHeader, campaignActions, forceBarModel, campaignLayout, drawCampaign, drawCampaignScreen, LAYOUT,
} = await import('../web/ui/canvas/campaign.js');
const core = await import('../web/ui/canvas/core.js');
const { createParticles } = await import('../web/ui/fx.js');
const FAKE_C = () => ({ U: 1, W: 640, H: 480, T: 0, contentH: 0, content: { x: 0, y: 0, w: 640, h: 480 } });

const ROUND = (n, won, extra = {}) => ({ round: n, tactic: 'assault', won, ours: 120, enemy: 100, lossOurs: 5, lossEnemy: 12, line: '剋敵', ...extra });
const campaign = (over = {}) => ({
  status: 'active', title: '北伐', round: 1, ourWins: 1, enemyWins: 0, grain: 30,
  intel: 'unscouted', estimate: 0, neighborId: 'n1', rounds: [ROUND(1, true)], ...over,
});

// 替身繪製 API：記錄所有按鈕與文字呼叫，不需真實畫布。ctx 為 no-op Proxy，供粒子系統使用。
function stubApi() {
  const calls = { buttons: [], texts: [], panels: 0, bars: 0 };
  const noop = () => {};
  const api = {
    panel: () => { calls.panels += 1; },
    text: (s, x, y) => { calls.texts.push({ s, x, y }); },
    bar: () => { calls.bars += 1; },
    button: (x, y, w, h, label, onClick, opts) => { calls.buttons.push({ x, y, w, h, label, onClick, opts }); },
    hit: noop, toast: noop, modal: noop,
  };
  return { api, calls };
}
// 替身 2D 上下文：方法皆為 no-op；measureText、漸層回傳最小可用物件。
const stubCtx = () => {
  const noop = () => {};
  const known = {
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  return new Proxy({}, {
    get: (t, k) => (k in known ? known[k] : noop),
    set: () => true,
  });
};

test('兵種相剋：四種兵種循環，counterPairs 與 unitBeats 一致', () => {
  assert.deepEqual([...UNIT_CHAIN], ['騎', '盾', '弓', '槍']);
  assert.equal(unitBeats('騎'), '盾');
  assert.equal(unitBeats('槍'), '騎');
  for (const p of counterPairs()) assert.equal(p.b, unitBeats(p.a));
});

test('戰報偏好：加速 1×↔2× 循環、自動戰鬥切換，未知動作不改變偏好', () => {
  const p0 = { auto: false, speed: 1 };
  const p1 = reduceBattlePrefs(p0, 'speed');
  assert.equal(p1.speed, 2);
  assert.equal(reduceBattlePrefs(p1, 'speed').speed, 1);
  assert.equal(reduceBattlePrefs(p0, 'auto').auto, true);
  assert.equal(reduceBattlePrefs(p0, 'bogus'), p0);
  assert.deepEqual(p0, { auto: false, speed: 1 }, '不改動原物件');
});

test('播放與跳過：advanceShown 不超過總數；skipShown 全數顯示', () => {
  assert.equal(advanceShown(0, 2), 1);
  assert.equal(advanceShown(2, 2), 2);
  assert.equal(skipShown(3), 3);
});

test('戰報列：未播放之列為 hidden；自動戰鬥開啟時全數可見', () => {
  const rounds = [ROUND(1, true), ROUND(2, false, { line: '遭敵' }), ROUND(3, true)];
  const manual = battleLines(rounds, { auto: false, speed: 1 }, 1);
  assert.deepEqual(manual.map((l) => l.hidden), [false, true, true]);
  assert.equal(manual[1].mark, '▼');
  assert.equal(manual[1].tone, 'lose');
  const auto = battleLines(rounds, { auto: true, speed: 1 }, 0);
  assert.deepEqual(auto.map((l) => l.hidden), [false, false, false]);
});

test('戰術按鈕：三種戰術皆產生 camp-tactic；粮草不足時提示減損', () => {
  const opts = tacticOptions(campaign({ grain: 0 }));
  assert.equal(opts.length, Object.keys(TACTICS).length);
  assert.ok(opts.every((o) => o.act === 'camp-tactic' && o.arg));
  assert.ok(opts.some((o) => o.hint.includes('粮草不足')));
});

test('戰況文字與可用行動：偵察僅於第 0 回合且敵情未明；議和於第 1 回合起；歲幣需鄰國', () => {
  const h = campaignHeader(campaign({ round: 0, rounds: [], intel: 'scouted', estimate: 88 }));
  assert.match(h.sub, /約 88（誤差約 ±8%）/);
  assert.deepEqual(campaignActions(campaign({ round: 0, rounds: [], intel: 'unscouted', neighborId: null })).map((a) => a.act), ['camp-recon']);
  assert.deepEqual(campaignActions(campaign({ round: 1, neighborId: null })).map((a) => a.act), ['camp-peace']);
  assert.deepEqual(campaignActions(campaign({ round: 2, neighborId: 'n2' })).map((a) => a.act), ['camp-peace', 'camp-tribute']);
});

test('兵力對比：取最近一回合，我方、敵方占比合計為 100；無數據時顯示未明', () => {
  const m = forceBarModel(campaign(), null);
  assert.equal(m.ours, 120);
  assert.equal(m.enemy, 100);
  assert.equal(m.oursPct + m.enemyPct, 100);
  const none = forceBarModel(campaign({ rounds: [], intel: 'unscouted' }), null);
  assert.equal(none.enemy, null);
  assert.equal(none.enemyPct, 0);
});

test('版面：所有可點區域落在面板之內，且高度為正', () => {
  const lay = campaignLayout(campaign({ rounds: [ROUND(1, true), ROUND(2, false)] }), { x: 0, y: 0, w: 640 });
  assert.ok(lay.h > 0);
  const { x, y, w, h } = lay.panel;
  const rects = [...lay.tactics.map((t) => t.rect), ...lay.actions.map((a) => a.rect), lay.ctl.auto, lay.ctl.skip, lay.ctl.speed];
  for (const r of rects) {
    assert.ok(r.x >= x && r.x + r.w <= x + w + 1, `x 超出面板：${JSON.stringify(r)}`);
    assert.ok(r.y >= y && r.y + r.h <= y + h, `y 超出面板：${JSON.stringify(r)}`);
  }
  assert.equal(lay.tactics.length, 3);
  assert.ok(LAYOUT.maxLogRows >= 1);
});

test('煙霧測試：drawCampaign 繪製後點遍所有按鈕，不拋錯且回呼正確的行動', () => {
  const { api, calls } = stubApi();
  const acts = [];
  const prefs = [];
  let skipped = 0;
  const c = campaign({ rounds: [ROUND(1, true), ROUND(2, false)] });
  drawCampaign(api, FAKE_C(), {
    c,
    state: null,
    prefs: { auto: false, speed: 1 },
    shown: 2,
    w: 640,
    onAct: (a, v) => acts.push([a, v]),
    onPref: (p) => prefs.push(p),
    onSkip: () => { skipped += 1; },
  });
  assert.ok(calls.buttons.length >= 6, '至少含 3 戰術、2 其他行動與 3 戰報控制（部分）');
  for (const b of calls.buttons) assert.doesNotThrow(() => b.onClick());
  assert.deepEqual(acts.filter(([a]) => a === 'camp-tactic').map(([, v]) => v).sort(), Object.keys(TACTICS).sort());
  assert.ok(acts.some(([a]) => a === 'camp-peace'));
  assert.ok(acts.some(([a]) => a === 'camp-tribute'));
  assert.deepEqual(prefs, ['auto', 'speed']);
  assert.equal(skipped, 1);
});

test('煙霧測試：第 0 回合無戰報、無鄰國時仍可繪製，偵察按鈕可點', () => {
  const { api, calls } = stubApi();
  const acts = [];
  drawCampaign(api, FAKE_C(), {
    c: campaign({ round: 0, rounds: [], intel: 'unscouted', neighborId: null }),
    state: null,
    onAct: (a) => acts.push(a),
  });
  const recon = calls.buttons.find((b) => b.label.includes('遣探偵察'));
  assert.ok(recon, '第 0 回合應有偵察鈕');
  recon.onClick();
  assert.deepEqual(acts, ['camp-recon']);
  assert.ok(calls.texts.some((t) => t.s === '尚無回合。'));
});

test('粒子系統：burst 產生金點與光環；step 依壽命移除；draw 以替身 ctx 繪製不拋錯', () => {
  let seed = 0.5;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280 / 233280; return seed; };
  const fx = createParticles({ random: rnd, W: 640, H: 480 });
  fx.burst(100, 100, 6);
  assert.equal(fx.list.length, 7, '6 顆金點 + 1 圈光環');
  fx.floatDelta(100, 100, -3);
  const ctx = stubCtx();
  assert.doesNotThrow(() => fx.draw(ctx, { T: 1 }));
  fx.step(5, { ambient: false, T: 0 });
  assert.equal(fx.list.length, 0, '超過壽命者全數移除');
});

test('粒子系統：ambient 為真時於上方補充花瓣', () => {
  const fx = createParticles({ random: () => 0.1, W: 640, H: 480 });
  fx.step(0.016, { ambient: true, T: 0 });
  assert.ok(fx.list.some((p) => p.k === 'petal'));
});

test('真實 widgets 組合：drawCampaignScreen 以替身上下文繪製，並設定 C.contentH 供捲動', () => {
  const ctx = stubCtx();
  core.C.ctx = ctx;
  core.C.W = 640; core.C.H = 480; core.C.U = 1; core.C.contentH = 0;
  const acts = [];
  drawCampaignScreen(core.C, {
    c: campaign({ rounds: [ROUND(1, true), ROUND(2, false)] }),
    state: null,
    prefs: { auto: true, speed: 2 },
    shown: 0,
    onAct: (a) => acts.push(a),
  });
  assert.ok(core.C.contentH > 300, `contentH=${core.C.contentH}`);
});

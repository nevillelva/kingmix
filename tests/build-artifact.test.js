import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifact, checkEvents, findResidue, rewriteImports } from '../scripts/build-artifact.js';

test('rewriteImports（artifact）：把 ../../src/ 與 ../../data/ 改寫為單層上溯', () => {
  const src = "import { a } from '../../src/rng.js';\nconst d = await import(\"../../data/events.json\");";
  const out = rewriteImports(src, 'artifact');
  assert.equal(out, "import { a } from '../src/rng.js';\nconst d = await import(\"../data/events.json\");");
});

test('rewriteImports（artifact）：其他相對路徑與一般字串不動', () => {
  const src = "import { esc } from './util.js';\nimport x from '../store.js';\nconst s = 'src/rng.js';";
  assert.equal(rewriteImports(src, 'artifact'), src);
});

test('rewriteImports（repo）原樣回傳；未知模式與非字串輸入會拋錯', () => {
  const src = "import '../../src/rng.js';";
  assert.equal(rewriteImports(src, 'repo'), src);
  assert.throws(() => rewriteImports(src, 'bogus'), RangeError);
  assert.throws(() => rewriteImports(42, 'artifact'), TypeError);
});

test('findResidue：改寫後的文字找不到殘留，未改寫的會列出行號', () => {
  const clean = rewriteImports("a\nimport '../../src/x.js';\nb", 'artifact');
  assert.deepEqual(findResidue(clean), []);
  assert.deepEqual(findResidue("ok\nimport '../../data/e.json';"), [2]);
});

test('checkEvents：可解析且事件數 > 0 才通過，否則拋錯', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kingmix-ev-'));
  try {
    const good = join(dir, 'good.json');
    writeFileSync(good, JSON.stringify({ events: [{ id: 'E001' }] }));
    assert.equal(checkEvents(good), 1);

    const empty = join(dir, 'empty.json');
    writeFileSync(empty, JSON.stringify({ events: [] }));
    assert.throws(() => checkEvents(empty), /事件數為 0/);

    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ not json');
    assert.throws(() => checkEvents(broken), /無法解析/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildArtifact：複製網頁、ui/ 無殘留路徑，且不修改原始 web/ui', () => {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const out = mkdtempSync(join(tmpdir(), 'kingmix-artifact-'));
  try {
    const { events, files } = buildArtifact(out, { root });
    assert.ok(events > 0);
    assert.ok(existsSync(join(out, 'index.html')));
    assert.ok(existsSync(join(out, 'src', 'rng.js')));
    assert.ok(existsSync(join(out, 'data', 'events.json')));
    assert.ok(files.some(f => f.path === 'ui/main.js'));

    for (const f of readdirSync(join(out, 'ui'))) {
      assert.deepEqual(findResidue(readFileSync(join(out, 'ui', f), 'utf8')), [], f);
      assert.doesNotMatch(readFileSync(join(out, 'ui', f), 'utf8'), /\.\.\/\.\.\/(src|data)\b/);
    }
    // 原始檔仍保留 repo 的路徑
    assert.match(readFileSync(join(root, 'web', 'ui', 'util.js'), 'utf8'), /\.\.\/\.\.\/src\//);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('buildArtifact：拒絕以專案根目錄或其上層作為輸出目錄', () => {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  assert.throws(() => buildArtifact(root, { root }), /不可為專案根目錄/);
});

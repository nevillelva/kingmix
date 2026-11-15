// scripts/build-artifact.js：把網頁介面複製成可獨立發布（Artifact）的目錄。
// 用法：node scripts/build-artifact.js <outDir>
//
// 複製 web/index.html、web/ui/*.js、src/、data/ 到 outDir，目錄結構與 repo 相同（ui/ 與 src/、data/ 同層）。
// 只在複本的 ui/ 內改寫模組路徑：'../../src/' → '../src/'、'../../data/' → '../data/'。
// 原始 web/ui/ 不會被修改。發布前會檢查 data/events.json 可解析且事件數 > 0，並掃描確認 ui/ 無殘留路徑。
import { cpSync, copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 改寫規則：只處理指向 src/、data/ 的上溯路徑（repo 的 web/ui/ 到根目錄需要兩層 ../）。
const REWRITE_RULES = [
  [/\.\.\/\.\.\/(src|data)(?=\/)/g, '../$1'],
];
// 殘留偵測：改寫後 ui/ 內不應再出現 '../../src' 或 '../../data'。
const RESIDUE = /\.\.\/\.\.\/(src|data)\b/;

// 純函式：改寫模組路徑。mode 為 'artifact' 時改寫；'repo' 原樣回傳；其他模式拋錯。
export function rewriteImports(text, mode = 'artifact') {
  if (typeof text !== 'string') throw new TypeError('rewriteImports：text 必須是字串');
  if (mode === 'repo') return text;
  if (mode !== 'artifact') throw new RangeError(`rewriteImports：未知模式 ${mode}`);
  let out = text;
  for (const [re, rep] of REWRITE_RULES) out = out.replace(re, rep);
  return out;
}

// 回傳含殘留路徑的行號清單（空陣列表示已乾淨）。
export function findResidue(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => { if (RESIDUE.test(line)) hits.push(i + 1); });
  return hits;
}

// 檢查事件資料：可解析且事件數 > 0，回傳事件數；否則拋錯。
export function checkEvents(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} 無法解析：${e.message}`);
  }
  const events = Array.isArray(data) ? data : data?.events;
  if (!Array.isArray(events) || events.length === 0) throw new Error(`${file} 事件數為 0 或結構不符`);
  return events.length;
}

function walk(dir, base = dir) {
  const rows = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) rows.push(...walk(full, base));
    else rows.push({ path: full.slice(base.length + 1).split(sep).join('/'), bytes: statSync(full).size });
  }
  return rows;
}

// 建立發布目錄；回傳 { events, files }。任何檢查失敗都拋錯，呼叫端決定結束碼。
export function buildArtifact(outDir, { root = ROOT, log = () => {} } = {}) {
  const out = resolve(outDir);
  if (out === root || root.startsWith(out + sep)) throw new Error('輸出目錄不可為專案根目錄或其上層');

  const events = checkEvents(join(root, 'data', 'events.json'));

  // 只清除本腳本會產生的項目，不清空整個輸出目錄。
  for (const name of ['index.html', 'ui', 'src', 'data']) rmSync(join(out, name), { recursive: true, force: true });
  mkdirSync(join(out, 'ui'), { recursive: true });
  copyFileSync(join(root, 'web', 'index.html'), join(out, 'index.html'));

  const uiDir = join(root, 'web', 'ui');
  // 事件資料內嵌為 ES 模組（ui/events-data.js），避免發布殼層無法以相對路徑 fetch data/events.json。
  const eventsJson = readFileSync(join(root, 'data', 'events.json'), 'utf8');
  writeFileSync(join(out, 'ui', 'events-data.js'), `export default ${JSON.stringify(JSON.parse(eventsJson))};\n`);
  const EVENT_FETCH = "(await (await fetch('../data/events.json')).json()).events";
  for (const f of readdirSync(uiDir).filter(f => f.endsWith('.js')).sort()) {
    let text = readFileSync(join(uiDir, f), 'utf8');
    if (f === 'main.js') {
      if (!text.includes(EVENT_FETCH)) throw new Error('main.js 找不到事件 fetch 片段，無法內嵌');
      text = text.replace(EVENT_FETCH, "(await import('./events-data.js')).default.events");
    }
    writeFileSync(join(out, 'ui', f), rewriteImports(text, 'artifact'));
  }
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });
  cpSync(join(root, 'data'), join(out, 'data'), { recursive: true });

  for (const f of readdirSync(join(out, 'ui'))) {
    const hits = findResidue(readFileSync(join(out, 'ui', f), 'utf8'));
    if (hits.length) throw new Error(`ui/${f} 改寫後仍有殘留路徑，行 ${hits.join(', ')}`);
  }

  const files = walk(out);
  for (const { path, bytes } of files) log(`${String(bytes).padStart(9)}  ${path}`);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  log(`共 ${files.length} 個檔案，合計 ${total} bytes；事件 ${events} 筆`);
  return { events, files };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('用法：node scripts/build-artifact.js <outDir>');
    process.exit(1);
  }
  try {
    buildArtifact(outDir, { log: console.log });
  } catch (e) {
    console.error(`建置失敗：${e.message}`);
    process.exit(1);
  }
}

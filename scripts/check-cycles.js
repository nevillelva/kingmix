// scripts/check-cycles.js：靜態解析 web/ui 與 src 的相對 import，偵測模組循環依賴。
// 用法：node scripts/check-cycles.js
// 規則：以強連通分量（SCC）計數；只要 web/ui 內有任一循環（SCC 大小 > 1 或自我匯入），結束碼為 1。
// 僅含 src 的循環只列為資訊，不影響結束碼。解析範圍：static import / export ... from / import 'x' / 動態 import('x')。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['web/ui', 'src'];

// 匹配相對路徑的 import 形式（無注釋的行）。
const IMPORT_RES = [
  /\bimport\s+(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkJs(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

// 去除整行或行尾的 // 注釋與 /* */ 區塊，避免注釋中的範例被當成 import。
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
}

export function importsOf(file, root = ROOT) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const targets = new Set();
  for (const re of IMPORT_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue; // 只看相對路徑
      const abs = resolve(dirname(file), spec);
      if (!abs.startsWith(root + sep)) continue;
      if (existsSync(abs)) targets.add(abs);
    }
  }
  return [...targets];
}

// Tarjan 強連通分量（迭代版，避免深遞迴）。回傳 SCC 陣列（每個為節點路徑陣列）。
export function stronglyConnected(graph) {
  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  for (const start of graph.keys()) {
    if (idx.has(start)) continue;
    const work = [[start, 0]];
    idx.set(start, index); low.set(start, index); index++;
    stack.push(start); onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      const edges = graph.get(v) ?? [];
      if (i < edges.length) {
        frame[1]++;
        const w = edges[i];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++;
          stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1][0];
          low.set(parent, Math.min(low.get(parent), low.get(v)));
        }
        if (low.get(v) === idx.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          sccs.push(comp);
        }
      }
    }
  }
  return sccs;
}

// 分析整個範圍，回傳 { cycles: [{ files, uiFiles }], uiCycles, srcCycles }。
export function analyze(root = ROOT) {
  const files = SCAN_DIRS.flatMap((d) => (existsSync(join(root, d)) ? walkJs(join(root, d)) : []));
  const graph = new Map(files.map((f) => [f, importsOf(f, root)]));
  const uiPrefix = join(root, 'web', 'ui') + sep;
  const cycles = [];
  for (const comp of stronglyConnected(graph)) {
    const selfLoop = comp.length === 1 && (graph.get(comp[0]) ?? []).includes(comp[0]);
    if (comp.length > 1 || selfLoop) {
      const sorted = comp.map((f) => relative(root, f).split(sep).join('/')).sort();
      cycles.push({ files: sorted, inUi: comp.some((f) => f.startsWith(uiPrefix)) });
    }
  }
  return {
    cycles,
    uiCycles: cycles.filter((c) => c.inUi),
    srcCycles: cycles.filter((c) => !c.inUi),
    fileCount: files.length,
  };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const result = analyze();
  console.log(`掃描 ${result.fileCount} 個檔案（web/ui、src）`);
  console.log(`循環 SCC 總數：${result.cycles.length}（web/ui 相關：${result.uiCycles.length}；僅 src：${result.srcCycles.length}）`);
  for (const c of result.cycles) {
    console.log(`${c.inUi ? '[web/ui]' : '[src]   '} ${c.files.join(' <-> ')}`);
  }
  if (result.uiCycles.length) {
    console.error(`失敗：web/ui 內有 ${result.uiCycles.length} 組循環依賴`);
    process.exit(1);
  }
  console.log('通過：web/ui 內無循環依賴');
}

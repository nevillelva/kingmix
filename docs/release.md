# 發布為 Artifact

## 建置

```bash
npm run build:artifact              # 輸出到 dist/artifact
node scripts/build-artifact.js <outDir>   # 也可指定其他輸出目錄
```

腳本會：

1. 檢查 `data/events.json` 可解析且事件數 > 0，否則結束碼 1。
2. 複製 `web/index.html`、`web/ui/*.js`（23 個）、`src/`、`data/` 到輸出目錄，目錄結構與 repo 相同。
3. 只在複本的 `ui/` 內改寫模組路徑：`../../src/` → `../src/`、`../../data/` → `../data/`。repo 內的 `web/ui/` 原始檔不會被修改。
4. 掃描 `ui/`，若仍有 `../../src` 或 `../../data` 殘留則結束碼 1。
5. 印出檔案清單、每個檔案的大小與事件筆數。

輸出目錄不可為專案根目錄或其上層；腳本只清除自己會產生的 `index.html`、`ui/`、`src/`、`data/`，不會清空整個輸出目錄。

## 發布時要上傳的內容

輸出目錄內的整棵樹，保留相對路徑：

- `index.html`
- `ui/*.js`（與 `index.html` 內 `<script type="module" src="ui/main.js">` 對應）
- `src/`
- `data/`

## 注意事項

- `dist/` 目前未列入 `.gitignore`，建置產物請勿 `git add`。
- `test:fast` 依賴 POSIX shell（`grep`、`$(...)`），在 Windows 的 cmd 下不會正常運作；其他指令不受影響。
- 測試分層：檔案頂部標註 `// @slow` 的測試檔會被 `npm run test:fast` 略過，完整測試仍以 `npm test` 執行。新增耗時測試時請加上此標註；不要因此刪除或弱化既有斷言。

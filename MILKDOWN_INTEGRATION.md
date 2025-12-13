# Milkdown 整合任務清單

## 📋 總覽

將白板卡片從 `<textarea>` 升級為 Milkdown WYSIWYG 編輯器，實現即時渲染的 Markdown 編輯體驗。

**預估時間：** 2-3 小時  
**複雜度：** 中高

---

## Phase 1: 設置打包環境 ⚙️ ✅

### 1.1 安裝 esbuild 打包工具 ✅
```bash
npm install --save-dev esbuild
```

### 1.2 創建 webview 打包配置 ✅
- 創建 `scripts/build-webview.js`
- 配置入口點和輸出

### 1.3 更新 package.json scripts ✅
- 新增 `build:webview` 腳本
- 修改 `compile` 腳本同時編譯 extension 和 webview

---

## Phase 2: 安裝 Milkdown 依賴 📦 ✅

### 2.1 安裝核心套件 ✅
```bash
npm install @milkdown/kit @milkdown/theme-nord
```

---

## Phase 3: 創建 Webview Bundle 架構 🏗️ ✅

### 3.1 重構 webview 腳本結構 ✅
- 創建 `src/webview/index.ts` 作為入口
- 創建 `src/webview/milkdown-editor.ts` Milkdown 封裝

### 3.2 修改 WhiteboardPanel.ts ✅
- 添加 `dist` 到 `localResourceRoots`
- 修改 `_getHtmlContent` 載入 webview bundle

### 3.3 測試打包流程 ✅
- 確認 `npm run compile` 能正常產出 bundle
- 確認 extension 能正常載入

---

## Phase 4: 創建 Milkdown 編輯器元件 ✏️ ✅

### 4.1 創建 `src/webview/milkdown-editor.ts` ✅
- 封裝 Milkdown 初始化邏輯
- 支持創建和銷毀編輯器實例
- 支持設定初始內容

### 4.2 實作 Markdown 雙向同步 ✅
- 監聽編輯器變更 → 轉換為 Markdown → 儲存
- 接收外部更新 → 轉換 Markdown → 更新編輯器

### 4.3 處理多實例管理 ✅
- 每張卡片獨立的編輯器實例
- 正確處理卡片刪除時的清理

---

## Phase 5: 整合到卡片 🃏 ✅

### 5.1 修改 `createCardElement` 函數 ✅
- 添加 Milkdown 容器 `<div>` (alongside textarea for fallback)
- 保留 textarea 作為備用

### 5.2 修改內容載入邏輯 ✅
- `cardContent` 訊息處理
- 設定編輯器初始內容
- 如果 Milkdown 載入失敗，自動回退到 textarea

### 5.3 修改儲存邏輯 ✅
- 監聽 Milkdown 變更事件
- 轉換為 Markdown 後發送儲存訊息

### 5.4 修改外部檔案變更處理 ✅
- `fileChanged` 訊息處理支持 Milkdown

### 5.5 卡片刪除清理 ✅
- 刪除卡片時正確銷毀 Milkdown 編輯器實例

---

## Phase 6: 樣式調整 🎨 ✅

### 6.1 整合 Milkdown 主題 ✅
- 在 `styles.ts` 添加自訂 Milkdown 樣式
- 確保與白板現有深色風格協調

---

## Phase 7: 測試和優化 🧪

### 7.1 功能測試
- [ ] 創建新卡片 → Milkdown 正常載入
- [ ] 編輯內容 → 自動儲存到 .md 檔案
- [ ] 外部修改 .md 檔案 → 卡片內容更新
- [ ] 刪除卡片 → 編輯器正確清理
- [ ] 多張卡片同時編輯

### 7.2 效能測試
- [ ] 10+ 張卡片不卡頓
- [ ] 打字延遲 < 50ms
- [ ] 白板縮放流暢

### 7.3 邊界情況
- [ ] 空檔案處理
- [ ] 大檔案處理 (> 10KB)
- [ ] 特殊 Markdown 語法 (表格、程式碼區塊)

---

## Phase 8: 打包和發布 📦 ✅

### 8.1 更新 .vscodeignore ✅
- 確保 webview.bundle.js 被包含在打包中
- 排除不需要的 TypeScript 原始碼

### 8.2 測試打包 ✅
```bash
npm run package
```
- VSIX 已成功生成，包含 webview.bundle.js (530.75 KB)

### 8.3 安裝測試
- [ ] 在新的 VS Code 環境安裝 .vsix
- [ ] 驗證所有功能正常

---

## ⚠️ 注意事項

1. **逐步測試** - 每完成一個 Phase 就測試，不要一次做太多
2. **Git 備份** - 開始前先 commit 現有程式碼
3. **CSP 問題** - VS Code webview 有嚴格的安全政策
4. **回退方案** - 保留原本的 textarea 邏輯，如果 Milkdown 載入失敗會自動回退

---

## 📁 新增/修改的檔案

```
vscodecanva/
├── scripts/
│   └── build-webview.js      (新增) ✅
├── src/
│   └── webview/
│       ├── index.ts          (新增 - webview 入口) ✅
│       ├── milkdown-editor.ts (新增 - Milkdown 封裝) ✅
│       ├── scripts.ts        (修改 - 整合 Milkdown) ✅
│       ├── template.ts       (未修改)
│       └── styles.ts         (修改 - 新增 Milkdown 樣式) ✅
├── dist/
│   └── webview.bundle.js     (新增 - 打包輸出) ✅
├── .vscodeignore             (修改) ✅
├── tsconfig.json             (修改 - 排除 webview 模組) ✅
└── package.json              (修改 - 新增依賴和腳本) ✅
```

---

## 🚀 下一步

1. 安裝 .vsix 檔案在 VS Code 中測試
2. 測試 Milkdown 編輯器的各項功能
3. 根據測試結果調整樣式和功能

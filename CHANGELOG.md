# Change Log

## [1.4.0] - 2024-12-13
### Added - 側邊欄功能
- **可收合側邊欄**: 工具列最左側新增側邊欄切換按鈕，點擊可展開/收合 320px 寬的側邊欄。
- **三分頁設計**: 側邊欄包含三個分頁：
  - **常用文件 (Pinned Files)**: 可釘選 .md 檔案，側邊欄內直接顯示內容並支援編輯。
  - **卡片清單 (Card List)**: 列出目前白板上所有卡片，依修改時間排序，可按顏色篩選，點擊導航至該卡片。
  - **暫存區 (Stash)**: 可將卡片拖曳至此暫存，從白板移除但不刪除，隨時可恢復或永久刪除。
- **卡片修改時間追蹤**: 卡片資料新增 `lastModified` 欄位，編輯內容時自動更新。
- **資料版本升級至 v2**: 新增 `pinnedFiles` 和 `stashCards` 欄位支援側邊欄功能。

### Improved
- **自動資料遷移**: 開啟舊版白板時自動遷移資料至 v2 格式。

## [1.3.2] - 2024-12-13
### Improved - 視覺樣式優化
- **卡片顏色淡化**: Card 套用顏色時改為整張卡片都有淡色背景（15% 透明度），Header 區域稍深（35% 透明度），邊框也會帶有該顏色色調（40% 透明度）。
- **Block 預設大小縮小**: Block 預設尺寸從 200×100px 改為 150×75px，文字大小從 20px 改為 15px，所有元素等比例縮小約 25%。

## [1.3.1] - 2024-12-13
### Improved - Move to Folder 彈窗優化
- **層級資料夾顯示**: 資料夾選擇器現在以樹狀結構顯示嵌套資料夾，可展開/收起子資料夾。
- **鍵盤導覽**: 支援上下鍵選擇資料夾，按上鍵從最底部開始選，Enter 確認選擇。
- **視覺回饋**: 資料夾 hover 時圖示變黃色，展開箭頭有旋轉動畫。
- **搜尋模式**: 搜尋時自動切換為扁平列表顯示完整路徑。

### Improved - 縮放體驗優化
- **視窗中心縮放**: 右下角縮放按鈕（+/-）現在以視窗中心為基準點縮放，而非左上角。
- **平滑動畫**: 點擊縮放按鈕時加入 0.2s 平滑過渡動畫，體驗更流暢。
- **Reset 優化**: 重置縮放按鈕也有平滑動畫效果。

## [1.3.0] - 2024-12-13
### Added - 基礎體驗優化
- **資料版本號**: 新增 `version` 欄位支援未來資料格式遷移，確保向後相容。
- **儲存效能優化**: 實作 Debounce（500ms 延遲儲存）+ Dirty Flag，避免頻繁存檔造成卡頓。
- **選中效果統一**: Block 與 Card 的選中/編輯狀態統一為白色外框 + 陰影效果。
- **點擊空白離開編輯**: 點擊白板空白處時自動退出所有編輯模式。

### Added - 互動體驗改善
- **防誤觸機制**: 需按住 `Cmd` (Mac) 或 `Ctrl` (Win) 再點擊才會開啟檔案，避免拖曳時誤開。
- **編輯狀態平移控制**: 編輯 Card 時，滑鼠在 Card 範圍內將禁用白板平移，避免誤操作。
- **Delete 快捷鍵**: 按下 `Delete` 或 `Backspace` 可刪除所有選中的 Block 和 Card。

### Added - 右鍵選單功能擴充
- **卡片重新命名**: 右鍵點擊 Card → Rename，直接重新命名對應的 `.md` 檔案。
- **卡片移動至資料夾**: 右鍵點擊 Card → Move to...，開啟資料夾選擇器，可搜尋並選擇目標資料夾移動檔案。

### Improved
- **Shift 多選**: 強化 Shift+Click 切換選取狀態功能。
- **立即儲存**: 刪除操作使用 `forceSave()` 確保立即儲存。

## [1.2.6] - 2024-12-12
### Added
- **矩形框選多選**: 在空白處按住拖曳可繪製選取框，框到的 Block/Card 會被選取（只要有交集即選取）。
- **多選移動**: 選取多個元素後，拖曳任一選取元素即可同時移動所有選取的 Block 和 Card。
- **Shift 加選**: 按住 Shift 點擊可將元素加入/移出選取；按住 Shift 框選可追加選取。
- **視覺回饋**: 被選取的元素會顯示青色外框，選取框為虛線藍框。

### Fixed
- **卡片滾動優先**: 編輯 Card 時，滾輪會優先滾動卡片內容，而非平移白板畫布。

## [1.2.5] - 2024-12-12
### Added
- **檔案型態儲存**: 新增 `.whiteboard.json` 檔案格式，白板狀態現在可以儲存為實體檔案。
- **建立新白板指令**: Command Palette 輸入 "Create New Whiteboard" 可建立新的 `.whiteboard.json` 檔案。
- **點擊開啟白板**: 點擊 `.whiteboard.json` 檔案將以視覺化白板方式開啟。
- **右鍵選單**: 在 `.whiteboard.json` 檔案上按右鍵可選擇「Open with Text Editor」以文字編輯器開啟。
- **支援版本控制**: `.whiteboard.json` 檔案可加入 Git 追蹤，便於團隊協作和版本管理。
- **專案可攜性**: 白板狀態隨專案一起移動，不再遺失。

## [1.2.4] - 2024-12-12
### Improved
- **點擊範圍精確化**: Block 和 Card 的點擊開啟檔案範圍縮小至文字本身，避免誤觸。
- **檔案重新命名同步**: 當 .md 檔案在 VS Code 中重新命名時，自動更新 Card 和 Block 的連結，不再斷開。
- **彈窗關閉優化**: 點擊彈窗外的背景或按 Escape 鍵即可關閉檔案選擇器。
- **介面簡化**: 移除檔案選擇器底部的 Browse System 和 Cancel 按鈕。

## [1.2.3] - 2024-12-12
### Improved
- **點擊行為優化**: Block 只有點擊「標題文字」才會打開連結檔案，周圍空白處不再觸發，避免拖曳結束時意外開啟檔案。
- **色票精簡**: 預設色票改為 8 種深色調（藍、紅、橘、綠、深灰、紫、粉、咖），確保白色文字清晰可讀。
- **滑鼠中心縮放**: 縮放功能現在以滑鼠位置為中心，而非左上角。
- **觸控板直接平移**: Mac 觸控板雙指滑動可直接平移畫布，無需按住空白鍵。

## [1.2.2] - 2024-12-12
### Fixed
- **CSP 問題修復**: 將 Lucide CDN 替換為內聯 SVG，解決 VS Code Webview 因安全策略阻止外部腳本載入導致無法顯示介面的問題。

## [1.2.0]
- **UI 升級**: 全面導入 Lucide Icons，提升介面質感。
- **畫布體驗優化**:
  - 白板預設載入於中心位置，支援四向延展。
  - 新增畫布平移功能（中鍵拖曳、Alt+拖曳、空白鍵+拖曳）。
  - 優化重置縮放功能，同時回歸中心。
- **檔案操作增強**:
  - **動態建立檔案**: 搜尋框無結果時可直接建立並連結檔案。
  - **右鍵 Add Card**: 統一使用與連結檔案相同的介面，支援搜尋或直接建立。
- **操作優化**:
  - **點擊開啟**: 單擊 Block 或 Card 標題開啟檔案。
  - **分割視窗**: 按住 Option 點擊可於分割視窗開啟檔案。

## [1.1.0] - 2024-12-12

### Added - Cards (Markdown Files)
- **Inline Editing**: Edit `.md` files directly on the canvas with auto-sync
- **Drag & Drop**: Drag `.md` files from VS Code explorer onto the canvas
- **Resizable Cards**: Drag bottom-right corner to resize
- **Create New Cards**: Right-click canvas → "Add Card (.md)" → enter filename
- **Card Folder Setting**: Configure where new cards are stored

### Added - Canvas Context Menu
- Right-click on canvas to show "Add Block" or "Add Card" options

### Changed
- **Complete UI redesign** with minimalist black theme
- Blocks now show as solid color rectangles (no gradients)
- Text is now centered and editable directly in blocks
- Linked blocks display with underlined text style
- Simplified toolbar with emoji-only buttons

### Added
- **Zoom functionality**: Zoom in/out with Ctrl/Cmd + mouse wheel
- Zoom controls UI (bottom-right corner)
- **Double-click creation**: Double-click canvas to instantly create blocks
- **Context menu**: Right-click blocks to access:
  - Color picker (16 vibrant colors)
  - Link/Unlink file options
  - Delete block
- Infinite canvas with subtle grid pattern
- Clickable linked blocks - click anywhere to open file

### Removed
- Glassmorphic effects and gradients
- Inline color pickers and action buttons
- Block headers (replaced with full-color blocks)

## [1.0.0] - 2024-12-12

### Added
- Initial release
- Whiteboard canvas with draggable blocks
- Block color customization
- Markdown file linking
- Persistent state storage per workspace

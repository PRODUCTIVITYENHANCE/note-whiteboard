# Change Log

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

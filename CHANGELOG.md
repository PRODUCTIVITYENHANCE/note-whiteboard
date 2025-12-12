# Change Log

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

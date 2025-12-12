# Change Log

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

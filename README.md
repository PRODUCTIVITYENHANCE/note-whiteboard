# Whiteboard Canvas

A minimalist VS Code extension for visual note-taking with draggable blocks and markdown file cards - inspired by Heptabase and Obsidian Canvas.

## Features

### Blocks
- 🎨 **Colorful Blocks**: Solid color blocks with 16 vibrant color options
- 🖱️ **Drag & Drop**: Freely move blocks around the infinite canvas
- 📄 **Markdown Linking**: Link blocks to `.md` files - linked blocks show as underlined text

### Cards (Markdown Files)
- 📝 **Inline Editing**: Edit `.md` files directly on the canvas - changes sync to file
- 📂 **Drag & Drop**: Drag `.md` files from VS Code explorer onto the canvas
- ↔️ **Resizable**: Drag the bottom-right corner to resize cards
- ➕ **Quick Create**: Right-click canvas → "Add Card" to create new `.md` files

### Canvas Features
- 🔍 **Zoom Controls**: Zoom in/out with mouse wheel (Ctrl/Cmd + scroll) or UI controls
- ⚡ **Quick Creation**: Double-click canvas to instantly create a new block
- 🎯 **Context Menu**: Right-click for options (blocks, cards, or canvas)
- 💾 **Auto-Save**: Your whiteboard is automatically saved per workspace
- 🌑 **Minimalist Design**: Clean black background with no gradients

## Usage

### Blocks
1. **Create Block**: Click ➕ button, double-click canvas, or right-click → "Add Block"
2. **Move Block**: Click and drag anywhere on the block
3. **Edit Text**: Double-click to enter edit mode
4. **Change Color**: Right-click → select color from palette
5. **Link to File**: Right-click → "Link to .md file"

### Cards (Markdown Files)
1. **Create Card**: Right-click canvas → "Add Card (.md)" → enter filename
2. **Import Card**: Drag any `.md` file from the explorer onto the canvas
3. **Edit Content**: Click inside the card and start typing (auto-saves)
4. **Resize Card**: Drag the bottom-right corner handle
5. **Move Card**: Drag the header bar

### Zoom & Navigation
- **Zoom In/Out**: Hold `Ctrl` (or `Cmd` on Mac) + scroll mouse wheel
- **Zoom Controls**: Use +/- buttons in bottom-right corner
- **Reset Zoom**: Click ↺ button

## Settings

| Setting | Description |
|---------|-------------|
| `whiteboard.cardFolderPath` | Relative path for storing new card files (default: workspace root) |

## Commands

| Command | Description |
|---------|-------------|
| `Whiteboard: Open Whiteboard` | Opens the whiteboard canvas |

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package extension
npm run package
```

## License

MIT

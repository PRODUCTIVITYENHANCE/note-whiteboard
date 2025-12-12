# Whiteboard Canvas

A minimalist VS Code extension for visual note-taking with draggable blocks that link to markdown files.

## Features

- 🎨 **Colorful Blocks**: Solid color blocks with 16 vibrant color options
- 🖱️ **Drag & Drop**: Freely move blocks around the infinite canvas
- 📄 **Markdown Linking**: Link blocks to `.md` files - linked blocks show as underlined text
- 🔍 **Zoom Controls**: Zoom in/out with mouse wheel (Ctrl/Cmd + scroll) or UI controls
- ⚡ **Quick Creation**: Double-click canvas to instantly create a new block
- 🎯 **Context Menu**: Right-click blocks for color picker, file linking, and delete options
- 💾 **Auto-Save**: Your whiteboard is automatically saved per workspace
- 🌑 **Minimalist Design**: Clean black background with no gradients

## Usage

### Basic Operations

1. **Open Whiteboard**: Command Palette (`Cmd+Shift+P`) → "Open Whiteboard"
2. **Create Block**: 
   - Click ➕ button, or
   - Double-click anywhere on the canvas
3. **Move Block**: Click and drag the block
4. **Edit Text**: Click the text area and start typing
5. **Link to File**: Right-click block → "Link to .md file"
6. **Open Linked File**: Click anywhere on a linked block (shown with underline)

### Zoom & Navigation

- **Zoom In/Out**: Hold `Ctrl` (or `Cmd` on Mac) + scroll mouse wheel
- **Zoom Controls**: Use ➕ ➖ buttons in bottom-right corner
- **Reset Zoom**: Click ↺ button
- **Pan Canvas**: Scroll normally to navigate the infinite canvas

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

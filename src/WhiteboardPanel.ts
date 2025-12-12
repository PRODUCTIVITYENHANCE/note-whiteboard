import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Block {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    text: string;
    linkedFile: string | null;
}

interface WhiteboardState {
    blocks: Block[];
}

export class WhiteboardPanel {
    public static currentPanel: WhiteboardPanel | undefined;
    private static readonly viewType = 'whiteboardCanvas';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.ViewColumn.One;

        // If we already have a panel, show it
        if (WhiteboardPanel.currentPanel) {
            WhiteboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            WhiteboardPanel.viewType,
            'Whiteboard',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        WhiteboardPanel.currentPanel = new WhiteboardPanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._context = context;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openFile':
                        await this._openFile(message.filePath);
                        break;
                    case 'saveState':
                        await this._saveState(message.state);
                        break;
                    case 'requestState':
                        const state = this._loadState();
                        this._panel.webview.postMessage({ command: 'loadState', state });
                        break;
                    case 'browseFile':
                        await this._browseFile(message.blockId);
                        break;
                    case 'getWorkspaceFiles':
                        const files = await this._getMarkdownFiles();
                        this._panel.webview.postMessage({ command: 'workspaceFiles', files });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _openFile(filePath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            let fullPath: string;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            } else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }

            const uri = vscode.Uri.file(fullPath);

            if (fs.existsSync(fullPath)) {
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } else {
                vscode.window.showErrorMessage(`File not found: ${filePath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error opening file: ${error}`);
        }
    }

    private async _browseFile(blockId: string) {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Markdown File',
            filters: {
                'Markdown': ['md'],
                'All Files': ['*']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let relativePath = fileUri[0].fsPath;

            if (workspaceFolders) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                if (fileUri[0].fsPath.startsWith(workspaceRoot)) {
                    relativePath = path.relative(workspaceRoot, fileUri[0].fsPath);
                }
            }

            this._panel.webview.postMessage({
                command: 'fileSelected',
                blockId: blockId,
                filePath: relativePath
            });
        }
    }

    private async _getMarkdownFiles(): Promise<string[]> {
        const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**', 100);
        return files.map(f => vscode.workspace.asRelativePath(f));
    }

    private _saveState(state: WhiteboardState) {
        this._context.workspaceState.update('whiteboardState', state);
    }

    private _loadState(): WhiteboardState {
        return this._context.workspaceState.get('whiteboardState', { blocks: [] });
    }

    private _update() {
        this._panel.webview.html = this._getHtmlContent();
    }

    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whiteboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #000000;
        }

        #toolbar {
            position: fixed;
            top: 16px;
            left: 16px;
            display: flex;
            gap: 8px;
            z-index: 1000;
        }

        .toolbar-btn {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #1a1a1a;
            border: 1px solid #333;
        }

        .toolbar-btn:hover {
            background: #2a2a2a;
            transform: scale(1.05);
        }

        #zoom-controls {
            position: fixed;
            bottom: 16px;
            right: 16px;
            display: flex;
            gap: 8px;
            z-index: 1000;
        }

        .zoom-btn {
            width: 36px;
            height: 36px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 18px;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #fff;
            transition: all 0.2s ease;
        }

        .zoom-btn:hover {
            background: #2a2a2a;
        }

        .zoom-level {
            padding: 0 12px;
            display: flex;
            align-items: center;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            color: #888;
            font-size: 12px;
            min-width: 60px;
            justify-content: center;
        }

        #canvas-container {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: auto;
            cursor: grab;
        }

        #canvas-container:active {
            cursor: grabbing;
        }

        #whiteboard {
            width: 8000px;
            height: 6000px;
            position: relative;
            background-image: 
                linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            transform-origin: 0 0;
        }

        .block {
            position: absolute;
            width: 180px;
            height: 120px;
            border-radius: 8px;
            cursor: move;
            user-select: none;
            transition: box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 500;
            color: #fff;
            padding: 16px;
            text-align: center;
            word-break: break-word;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .block:hover {
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        }

        .block.dragging {
            opacity: 0.8;
            z-index: 1000;
        }

        .block.linked {
            cursor: pointer;
            text-decoration: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 3px;
        }

        .block.linked:hover {
            filter: brightness(1.2);
        }

        .block-text {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            color: inherit;
            font-size: inherit;
            font-weight: inherit;
            text-align: center;
            outline: none;
            resize: none;
            font-family: inherit;
        }

        .block-text::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

        /* Context Menu */
        .context-menu {
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            padding: 8px;
            z-index: 2000;
            display: none;
            min-width: 200px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        }

        .context-menu.active {
            display: block;
        }

        .context-menu-section {
            padding: 8px 0;
        }

        .context-menu-section + .context-menu-section {
            border-top: 1px solid #333;
            margin-top: 8px;
        }

        .context-menu-label {
            font-size: 11px;
            color: #666;
            padding: 4px 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .context-menu-item {
            padding: 8px 12px;
            cursor: pointer;
            color: #ccc;
            font-size: 13px;
            border-radius: 4px;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .context-menu-item:hover {
            background: #2a2a2a;
            color: #fff;
        }

        .context-menu-item.danger:hover {
            background: #8b0000;
            color: #fff;
        }

        .color-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            padding: 8px;
        }

        .color-option {
            width: 36px;
            height: 36px;
            border-radius: 6px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .color-option:hover {
            transform: scale(1.1);
            border-color: rgba(255, 255, 255, 0.3);
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 3000;
        }

        .modal-overlay.active {
            display: flex;
        }

        .modal {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 70vh;
            overflow-y: auto;
        }

        .modal h3 {
            margin-bottom: 16px;
            color: #fff;
            font-size: 16px;
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 400px;
            overflow-y: auto;
        }

        .file-item {
            padding: 12px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            color: #ccc;
            transition: all 0.2s ease;
        }

        .file-item:hover {
            background: #2a2a2a;
            border-color: #555;
            color: #fff;
        }

        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }

        .modal-btn {
            flex: 1;
            padding: 10px;
            border: 1px solid #333;
            border-radius: 6px;
            background: #0a0a0a;
            color: #ccc;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
        }

        .modal-btn:hover {
            background: #2a2a2a;
            color: #fff;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button class="toolbar-btn" id="addBlock" title="Add Block (or double-click canvas)">➕</button>
        <button class="toolbar-btn" id="saveBtn" title="Save">💾</button>
    </div>

    <div id="zoom-controls">
        <button class="zoom-btn" id="zoomOut">−</button>
        <div class="zoom-level" id="zoomLevel">100%</div>
        <button class="zoom-btn" id="zoomIn">+</button>
        <button class="zoom-btn" id="resetZoom" title="Reset Zoom">↺</button>
    </div>

    <div id="canvas-container">
        <div id="whiteboard"></div>
    </div>

    <div class="context-menu" id="contextMenu">
        <div class="context-menu-section">
            <div class="context-menu-label">Color</div>
            <div class="color-grid" id="colorGrid"></div>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-item" id="linkFileMenu">
                <span>🔗</span>
                <span>Link to .md file</span>
            </div>
            <div class="context-menu-item" id="unlinkFileMenu" style="display: none;">
                <span>🔓</span>
                <span>Unlink file</span>
            </div>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-item danger" id="deleteBlockMenu">
                <span>🗑️</span>
                <span>Delete</span>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="fileModal">
        <div class="modal">
            <h3>📁 Select Markdown File</h3>
            <div class="file-list" id="fileList"></div>
            <div class="modal-actions">
                <button class="modal-btn" id="browseFileBtn">Browse...</button>
                <button class="modal-btn" id="closeModalBtn">Cancel</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const whiteboard = document.getElementById('whiteboard');
        const canvasContainer = document.getElementById('canvas-container');
        const contextMenu = document.getElementById('contextMenu');
        const fileModal = document.getElementById('fileModal');
        const fileList = document.getElementById('fileList');
        const colorGrid = document.getElementById('colorGrid');
        
        let blocks = [];
        let selectedBlockId = null;
        let contextBlockId = null;
        let draggedBlock = null;
        let dragOffset = { x: 0, y: 0 };
        let zoomLevel = 1;
        let isDraggingCanvas = false;
        let canvasStartPos = { x: 0, y: 0 };

        const colors = [
            '#667eea', '#764ba2', '#f093fb', '#f5576c',
            '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
            '#fa709a', '#fee140', '#a8edea', '#fed6e3',
            '#ffecd2', '#fcb69f', '#ff9a9e', '#fecfef'
        ];

        // Initialize color grid
        colors.forEach(color => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-option';
            colorDiv.style.background = color;
            colorDiv.dataset.color = color;
            colorDiv.addEventListener('click', () => changeBlockColor(color));
            colorGrid.appendChild(colorDiv);
        });

        function generateId() {
            return 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        function createBlockElement(block) {
            const div = document.createElement('div');
            div.className = 'block' + (block.linkedFile ? ' linked' : '');
            div.id = block.id;
            div.style.left = block.x + 'px';
            div.style.top = block.y + 'px';
            div.style.background = block.color;

            const textarea = document.createElement('textarea');
            textarea.className = 'block-text';
            textarea.value = block.text;
            textarea.placeholder = 'New Block';
            
            textarea.addEventListener('input', (e) => {
                block.text = e.target.value;
                saveState();
            });

            textarea.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            div.appendChild(textarea);

            // Click to open linked file
            div.addEventListener('click', (e) => {
                if (block.linkedFile && !draggedBlock) {
                    e.preventDefault();
                    vscode.postMessage({ command: 'openFile', filePath: block.linkedFile });
                }
            });

            // Dragging
            div.addEventListener('mousedown', (e) => {
                if (e.target === textarea) return;
                startDrag(e, div, block);
            });

            // Context menu
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, block.id);
            });

            return div;
        }

        function startDrag(e, element, block) {
            draggedBlock = { element, block };
            element.classList.add('dragging');
            
            const rect = element.getBoundingClientRect();
            dragOffset = {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        }

        function onDrag(e) {
            if (!draggedBlock) return;

            const x = (e.clientX + canvasContainer.scrollLeft) / zoomLevel - dragOffset.x;
            const y = (e.clientY + canvasContainer.scrollTop) / zoomLevel - dragOffset.y;

            draggedBlock.element.style.left = Math.max(0, x) + 'px';
            draggedBlock.element.style.top = Math.max(0, y) + 'px';

            draggedBlock.block.x = Math.max(0, x);
            draggedBlock.block.y = Math.max(0, y);
        }

        function stopDrag() {
            if (draggedBlock) {
                draggedBlock.element.classList.remove('dragging');
                draggedBlock = null;
                saveState();
            }
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        }

        function addBlock(x, y) {
            const block = {
                id: generateId(),
                x: x || (canvasContainer.scrollLeft / zoomLevel + 100),
                y: y || (canvasContainer.scrollTop / zoomLevel + 100),
                color: colors[Math.floor(Math.random() * colors.length)],
                text: '',
                linkedFile: null
            };

            blocks.push(block);
            const element = createBlockElement(block);
            whiteboard.appendChild(element);
            saveState();
            
            // Focus the textarea
            setTimeout(() => {
                const textarea = element.querySelector('.block-text');
                if (textarea) textarea.focus();
            }, 100);
        }

        function showContextMenu(e, blockId) {
            contextBlockId = blockId;
            const block = blocks.find(b => b.id === blockId);
            
            // Show/hide unlink option
            const unlinkMenu = document.getElementById('unlinkFileMenu');
            unlinkMenu.style.display = block.linkedFile ? 'flex' : 'none';

            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.classList.add('active');
        }

        function hideContextMenu() {
            contextMenu.classList.remove('active');
            contextBlockId = null;
        }

        function changeBlockColor(color) {
            if (!contextBlockId) return;
            const block = blocks.find(b => b.id === contextBlockId);
            if (block) {
                block.color = color;
                const element = document.getElementById(contextBlockId);
                element.style.background = color;
                saveState();
            }
            hideContextMenu();
        }

        function deleteBlock() {
            if (!contextBlockId) return;
            blocks = blocks.filter(b => b.id !== contextBlockId);
            const element = document.getElementById(contextBlockId);
            if (element) element.remove();
            saveState();
            hideContextMenu();
        }

        function unlinkFile() {
            if (!contextBlockId) return;
            const block = blocks.find(b => b.id === contextBlockId);
            if (block) {
                block.linkedFile = null;
                const element = document.getElementById(contextBlockId);
                element.classList.remove('linked');
                saveState();
            }
            hideContextMenu();
        }

        function openFileSelector(blockId) {
            selectedBlockId = blockId || contextBlockId;
            vscode.postMessage({ command: 'getWorkspaceFiles' });
            fileModal.classList.add('active');
            hideContextMenu();
        }

        function closeFileSelector() {
            fileModal.classList.remove('active');
            selectedBlockId = null;
        }

        function selectFile(filePath) {
            if (!selectedBlockId) return;

            const block = blocks.find(b => b.id === selectedBlockId);
            if (block) {
                block.linkedFile = filePath;
                const element = document.getElementById(selectedBlockId);
                element.classList.add('linked');
                saveState();
            }

            closeFileSelector();
        }

        function setZoom(level) {
            zoomLevel = Math.max(0.25, Math.min(3, level));
            whiteboard.style.transform = \`scale(\${zoomLevel})\`;
            document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
        }

        function saveState() {
            vscode.postMessage({ command: 'saveState', state: { blocks } });
        }

        function loadState(state) {
            blocks = state.blocks || [];
            whiteboard.innerHTML = '';
            blocks.forEach(block => {
                const element = createBlockElement(block);
                whiteboard.appendChild(element);
            });
        }

        // Message handling
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loadState':
                    loadState(message.state);
                    break;
                case 'workspaceFiles':
                    fileList.innerHTML = message.files.map(f => 
                        \`<div class="file-item" data-file="\${f}">\${f}</div>\`
                    ).join('');
                    fileList.querySelectorAll('.file-item').forEach(item => {
                        item.addEventListener('click', () => selectFile(item.dataset.file));
                    });
                    break;
                case 'fileSelected':
                    if (message.blockId) {
                        const block = blocks.find(b => b.id === message.blockId);
                        if (block) {
                            block.linkedFile = message.filePath;
                            const element = document.getElementById(message.blockId);
                            element.classList.add('linked');
                            saveState();
                        }
                    }
                    closeFileSelector();
                    break;
            }
        });

        // Event listeners
        document.getElementById('addBlock').addEventListener('click', () => addBlock());
        document.getElementById('saveBtn').addEventListener('click', saveState);
        document.getElementById('deleteBlockMenu').addEventListener('click', deleteBlock);
        document.getElementById('linkFileMenu').addEventListener('click', () => openFileSelector());
        document.getElementById('unlinkFileMenu').addEventListener('click', unlinkFile);
        document.getElementById('closeModalBtn').addEventListener('click', closeFileSelector);
        document.getElementById('browseFileBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'browseFile', blockId: selectedBlockId });
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoomLevel + 0.1));
        document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoomLevel - 0.1));
        document.getElementById('resetZoom').addEventListener('click', () => setZoom(1));

        // Double-click to add block
        whiteboard.addEventListener('dblclick', (e) => {
            if (e.target === whiteboard) {
                const x = (e.clientX + canvasContainer.scrollLeft) / zoomLevel;
                const y = (e.clientY + canvasContainer.scrollTop) / zoomLevel;
                addBlock(x - 90, y - 60); // Center the block on click
            }
        });

        // Hide context menu on click outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
            }
        });

        // Prevent context menu on canvas
        canvasContainer.addEventListener('contextmenu', (e) => {
            if (e.target === whiteboard || e.target === canvasContainer) {
                e.preventDefault();
            }
        });

        // Mouse wheel zoom
        canvasContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setZoom(zoomLevel + delta);
            }
        });

        // Load initial state
        vscode.postMessage({ command: 'requestState' });
    </script>
</body>
</html>`;
    }

    public dispose() {
        WhiteboardPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

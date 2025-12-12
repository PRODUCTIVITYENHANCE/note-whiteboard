import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Block {
    id: string;
    x: number;
    y: number;
    color: string;
    text: string;
    linkedFile: string | null;
}

interface Card {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    filePath: string;
}

interface WhiteboardState {
    blocks: Block[];
    cards: Card[];
}

export class WhiteboardPanel {
    public static currentPanel: WhiteboardPanel | undefined;
    private static readonly viewType = 'whiteboardCanvas';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _fileWatcher: vscode.FileSystemWatcher | undefined;
    private _document: vscode.TextDocument | undefined; // For file-based storage

    // Legacy: Open from command palette (uses workspaceState)
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

    // New: Open from .whiteboard.json file (uses file-based storage)
    public static createFromDocument(
        context: vscode.ExtensionContext,
        panel: vscode.WebviewPanel,
        document: vscode.TextDocument
    ) {
        // Configure webview options
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        };

        const instance = new WhiteboardPanel(panel, context, document);
        return instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        document?: vscode.TextDocument
    ) {
        this._panel = panel;
        this._context = context;
        this._document = document;

        // Set panel title based on document
        if (document) {
            const fileName = path.basename(document.uri.fsPath, '.whiteboard.json');
            this._panel.title = `Whiteboard: ${fileName}`;
        }

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Setup file watcher for .md files
        this._setupFileWatcher();

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openFile':
                        await this._openFile(message.filePath, message.splitView);
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
                    case 'readCardContent':
                        await this._readCardContent(message.cardId, message.filePath);
                        break;
                    case 'saveCardContent':
                        await this._saveCardContent(message.filePath, message.content);
                        break;
                    case 'createNewCard':
                        await this._createNewCard(message.fileName, message.x, message.y, message.forBlockId);
                        break;
                    case 'getCardFolderPath':
                        const folderPath = this._getCardFolderPath();
                        this._panel.webview.postMessage({ command: 'cardFolderPath', path: folderPath });
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private _setupFileWatcher() {
        // Watch for changes to .md files in the workspace
        this._fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');

        // When a .md file is saved/changed externally
        this._fileWatcher.onDidChange(async (uri) => {
            await this._notifyFileChanged(uri);
        });

        // When a .md file is deleted
        this._fileWatcher.onDidDelete(async (uri) => {
            await this._notifyFileDeleted(uri);
        });

        this._disposables.push(this._fileWatcher);

        // Also listen for document save events (more reliable for editor changes)
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId === 'markdown' || document.fileName.endsWith('.md')) {
                await this._notifyFileChanged(document.uri);
            }
        }, null, this._disposables);

        // Listen for file rename events to update links
        vscode.workspace.onDidRenameFiles(async (e) => {
            await this._handleFileRename(e.files);
        }, null, this._disposables);
    }

    private async _handleFileRename(files: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]) {
        try {
            const state = this._loadState();
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) return;

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            let stateChanged = false;

            for (const { oldUri, newUri } of files) {
                // Only handle .md files
                if (!oldUri.fsPath.endsWith('.md') && !newUri.fsPath.endsWith('.md')) continue;

                const oldFullPath = oldUri.fsPath;
                const newFullPath = newUri.fsPath;

                // Calculate relative paths
                const oldRelativePath = path.relative(workspaceRoot, oldFullPath);
                const newRelativePath = path.relative(workspaceRoot, newFullPath);

                // Update Cards
                for (const card of state.cards) {
                    const cardFullPath = path.isAbsolute(card.filePath)
                        ? card.filePath
                        : path.join(workspaceRoot, card.filePath);

                    if (cardFullPath === oldFullPath) {
                        // Update to new path (use relative if original was relative)
                        card.filePath = path.isAbsolute(card.filePath) ? newFullPath : newRelativePath;
                        stateChanged = true;

                        // Notify webview about the rename
                        this._panel.webview.postMessage({
                            command: 'fileRenamed',
                            cardId: card.id,
                            oldPath: oldRelativePath,
                            newPath: newRelativePath
                        });
                    }
                }

                // Update Blocks
                for (const block of state.blocks) {
                    if (!block.linkedFile) continue;

                    const blockFullPath = path.isAbsolute(block.linkedFile)
                        ? block.linkedFile
                        : path.join(workspaceRoot, block.linkedFile);

                    if (blockFullPath === oldFullPath) {
                        // Update to new path (use relative if original was relative)
                        block.linkedFile = path.isAbsolute(block.linkedFile) ? newFullPath : newRelativePath;
                        stateChanged = true;

                        // Notify webview about the rename
                        this._panel.webview.postMessage({
                            command: 'blockFileRenamed',
                            blockId: block.id,
                            oldPath: oldRelativePath,
                            newPath: newRelativePath
                        });
                    }
                }
            }

            // Save updated state
            if (stateChanged) {
                this._saveState(state);
            }
        } catch (error) {
            console.error('Error handling file rename:', error);
        }
    }

    private async _notifyFileDeleted(uri: vscode.Uri) {
        try {
            const state = this._loadState();
            const filePath = uri.fsPath;

            // Check if any card is using this file
            const matchingCards = state.cards.filter((card: Card) => {
                if (path.isAbsolute(card.filePath)) {
                    return card.filePath === filePath;
                } else {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const fullCardPath = path.join(workspaceFolders[0].uri.fsPath, card.filePath);
                        return fullCardPath === filePath;
                    }
                }
                return false;
            });

            // Notify webview about deleted file
            for (const card of matchingCards) {
                this._panel.webview.postMessage({
                    command: 'fileDeleted',
                    cardId: card.id,
                    filePath: card.filePath
                });
            }
        } catch (error) {
            // Ignore errors
        }
    }

    private async _notifyFileChanged(uri: vscode.Uri) {
        try {
            const state = this._loadState();
            const filePath = uri.fsPath;

            // Check if any card is using this file
            const matchingCards = state.cards.filter((card: Card) => {
                // Handle both absolute and relative paths
                if (path.isAbsolute(card.filePath)) {
                    return card.filePath === filePath;
                } else {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const fullCardPath = path.join(workspaceFolders[0].uri.fsPath, card.filePath);
                        return fullCardPath === filePath;
                    }
                }
                return false;
            });

            // If we found matching cards, read the file and notify the webview
            if (matchingCards.length > 0) {
                const content = fs.readFileSync(filePath, 'utf-8');
                for (const card of matchingCards) {
                    this._panel.webview.postMessage({
                        command: 'fileChanged',
                        cardId: card.id,
                        filePath: card.filePath,
                        content: content
                    });
                }
            }
        } catch (error) {
            // File might not exist or other error, just ignore
        }
    }

    private async _openFile(filePath: string, splitView: boolean = true) {
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
                const viewColumn = splitView ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
                await vscode.window.showTextDocument(doc, viewColumn);
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

    private async _readCardContent(cardId: string, filePath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }

            let fullPath: string;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            } else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }

            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                this._panel.webview.postMessage({
                    command: 'cardContent',
                    cardId: cardId,
                    content: content
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
        }
    }

    private async _saveCardContent(filePath: string, content: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }

            let fullPath: string;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            } else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }

            fs.writeFileSync(fullPath, content, 'utf-8');
        } catch (error) {
            vscode.window.showErrorMessage(`Error saving file: ${error}`);
        }
    }

    private _getCardFolderPath(): string {
        const config = vscode.workspace.getConfiguration('whiteboard');
        return config.get('cardFolderPath', '');
    }

    private async _createNewCard(fileName: string, x: number, y: number, forBlockId?: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const folderPath = this._getCardFolderPath();
            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Ensure .md extension
            let finalFileName = fileName;
            if (!finalFileName.endsWith('.md')) {
                finalFileName += '.md';
            }

            // Build full path
            let fullPath: string;
            let relativePath: string;
            if (folderPath) {
                const targetDir = path.join(workspaceRoot, folderPath);
                // Create directory if not exists
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                fullPath = path.join(targetDir, finalFileName);
                relativePath = path.join(folderPath, finalFileName);
            } else {
                fullPath = path.join(workspaceRoot, finalFileName);
                relativePath = finalFileName;
            }

            // Check if file already exists
            if (fs.existsSync(fullPath)) {
                vscode.window.showErrorMessage(`File already exists: ${relativePath}`);
                return;
            }

            // Create the file with empty content
            fs.writeFileSync(fullPath, `# ${fileName.replace('.md', '')}\n\n`, 'utf-8');

            // Send back to webview
            this._panel.webview.postMessage({
                command: 'cardCreated',
                filePath: relativePath,
                x: x,
                y: y,
                forBlockId: forBlockId
            });

        } catch (error) {
            vscode.window.showErrorMessage(`Error creating file: ${error}`);
        }
    }

    private _saveState(state: WhiteboardState) {
        if (this._document) {
            // File-based storage: write to .whiteboard.json file
            try {
                const filePath = this._document.uri.fsPath;
                fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
            } catch (error) {
                vscode.window.showErrorMessage(`Error saving whiteboard: ${error}`);
            }
        } else {
            // Legacy: use workspaceState
            this._context.workspaceState.update('whiteboardState', state);
        }
    }

    private _loadState(): WhiteboardState {
        if (this._document) {
            // File-based storage: read from .whiteboard.json file
            try {
                const content = this._document.getText();
                if (content.trim()) {
                    return JSON.parse(content);
                }
            } catch (error) {
                console.error('Error parsing whiteboard file:', error);
            }
            return { blocks: [], cards: [] };
        } else {
            // Legacy: use workspaceState
            return this._context.workspaceState.get('whiteboardState', { blocks: [], cards: [] });
        }
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

        .icon {
            width: 18px;
            height: 18px;
            stroke-width: 2;
        }

        .icon-sm {
            width: 14px;
            height: 14px;
        }

        .icon-lg {
            width: 20px;
            height: 20px;
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
            color: #ccc;
        }

        .toolbar-btn:hover {
            background: #2a2a2a;
            transform: scale(1.05);
            color: white;
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
            overflow: hidden; /* Changed from auto to hidden to handle custom pan/zoom better */
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
            transition: transform 0.05s ease-out; /* Smooth transition for zoom */
        }

        .block {
            position: absolute;
            width: 200px; /* Slightly wider */
            height: 100px; /* Lower height */
            border-radius: 18px; /* Larger border radius */
            cursor: move;
            user-select: none;
            transition: box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .block:hover {
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
            z-index: 10;
        }

        .block.dragging {
            opacity: 0.9;
            z-index: 1000;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            transform: scale(1.02);
        }

        .block.linked {
            cursor: pointer;
        }

        .block-content {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 20px; /* Larger Font */
            font-weight: 600;
            pointer-events: none; /* Allows click through to block for dragging */
            word-break: break-word;
            line-height: 1.3;
        }

        .block.linked .block-content {
            text-decoration: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 4px;
            pointer-events: auto;
            cursor: pointer;
            /* Only take up text space, not full block */
            width: auto;
            height: auto;
            max-width: 90%;
            padding: 4px 8px;
            border-radius: 4px;
        }

        .block.linked .block-content:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .block-input {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.2);
            border: none;
            border-radius: 18px;
            color: white;
            font-size: 20px;
            font-weight: 600;
            text-align: center;
            outline: none;
            resize: none;
            font-family: inherit;
            padding: 30px 20px; /* Attempt to center verify visually */
            display: none;
            line-height: 1.3;
        }

        .block.editing .block-content {
            display: none;
        }

        .block.editing .block-input {
            display: block;
        }

        /* Context Menu */
        .context-menu {
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 8px;
            z-index: 2000;
            display: none;
            min-width: 200px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .context-menu.active {
            display: block;
            animation: fadeIn 0.1s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
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
            font-weight: 600;
        }

        .context-menu-item {
            padding: 10px 12px;
            cursor: pointer;
            color: #ccc;
            font-size: 14px;
            border-radius: 6px;
            transition: all 0.1s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .context-menu-item:hover {
            background: #2a2a2a;
            color: #fff;
        }

        .context-menu-item.danger:hover {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .color-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            padding: 8px;
        }

        .color-option {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .color-option:hover {
            transform: scale(1.15);
            border-color: rgba(255, 255, 255, 0.5);
            z-index: 10;
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
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .modal-overlay.active {
            display: flex;
            opacity: 1;
        }

        .modal {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 16px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 70vh;
            overflow-y: auto;
            transform: scale(0.95);
            transition: transform 0.2s ease;
        }

        .modal-overlay.active .modal {
            transform: scale(1);
        }

        .modal h3 {
            margin-bottom: 20px;
            color: #fff;
            font-size: 18px;
            font-weight: 600;
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
        }

        .file-item {
            padding: 14px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #ccc;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-item::before {
            content: '';
            width: 16px;
            height: 16px;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E") no-repeat center;
        }

        .file-item:hover, .file-item.selected {
            background: #2a2a2a;
            border-color: #555;
            color: #fff;
            transform: translateX(4px);
        }

        .file-search-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #0a0a0a;
            color: #fff;
            font-size: 14px;
            outline: none;
            margin-bottom: 12px;
        }

        .file-search-input:focus {
            border-color: #667eea;
        }

        .file-list-container {
            display: flex;
            flex-direction: column;
            max-height: 400px;
        }

        .new-file-item {
            padding: 14px;
            background: #1a1a2e;
            border: 1px dashed #667eea;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #667eea;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            flex-shrink: 0;
        }

        .new-file-item:hover, .new-file-item.selected {
            background: #252540;
            border-color: #8b9ff5;
            color: #8b9ff5;
        }

        .no-results {
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }

        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }

        .modal-btn {
            flex: 1;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2a2a2a;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .modal-btn:hover {
            background: #333;
            border-color: #555;
        }

        .modal-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #0a0a0a;
            color: #fff;
            font-size: 14px;
            outline: none;
            margin-bottom: 16px;
        }

        .modal-input:focus {
            border-color: #667eea;
        }

        /* Card Styles */
        .card {
            position: absolute;
            min-width: 250px;
            min-height: 150px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        .card:hover {
            box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            border-color: #444;
        }

        .card.dragging {
            opacity: 0.9;
            z-index: 1000;
        }

        .card.external-change {
            border-color: #f5a623;
            animation: pulse-border 1.5s ease-in-out infinite;
        }

        @keyframes pulse-border {
            0%, 100% { border-color: #f5a623; }
            50% { border-color: #ffd700; box-shadow: 0 0 12px rgba(245, 166, 35, 0.5); }
        }

        .card-header {
            padding: 10px 14px;
            background: #252525;
            border-bottom: 1px solid #333;
            cursor: move;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #888;
        }

        .card-header .filename {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 200px;
        }

        .card-content {
            flex: 1;
            padding: 12px;
            overflow: auto;
        }

        .card-textarea {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            outline: none;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            overflow-y: auto;
        }

        /* Custom scrollbar for card textarea */
        .card-textarea::-webkit-scrollbar {
            width: 6px;
        }

        .card-textarea::-webkit-scrollbar-track {
            background: transparent;
        }

        .card-textarea::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 3px;
        }

        .card-textarea::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        .card-resize-handle {
            position: absolute;
            right: 0;
            bottom: 0;
            width: 20px;
            height: 20px;
            cursor: se-resize;
            background: linear-gradient(135deg, transparent 50%, #444 50%);
            border-radius: 0 0 12px 0;
        }

        /* Collapse toggle button */
        .card-collapse-toggle {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease;
            flex-shrink: 0;
        }

        .card-collapse-toggle::before {
            content: '';
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid #888;
            transition: transform 0.2s ease;
        }

        .card-collapse-toggle:hover::before {
            border-top-color: #fff;
        }

        /* Collapsed state */
        .card.collapsed .card-collapse-toggle::before {
            transform: rotate(-90deg);
        }

        .card.collapsed .card-content {
            display: none;
        }

        .card.collapsed .card-resize-handle {
            display: none;
        }

        .card.collapsed {
            height: auto !important;
            min-height: auto;
        }

        .card.collapsed .card-header {
            border-bottom: none;
            border-radius: 12px;
        }

        /* Disconnected card state */
        .card.disconnected .card-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .card.disconnected .card-textarea {
            display: none;
        }

        .disconnected-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            height: 100%;
        }

        .disconnected-message {
            color: #888;
            font-size: 14px;
            text-align: center;
        }

        .refresh-btn {
            padding: 8px 16px;
            background: #333;
            border: 1px solid #444;
            border-radius: 6px;
            color: #ccc;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .refresh-btn:hover {
            background: #444;
            color: #fff;
            border-color: #555;
        }

        /* Canvas Context Menu */
        .canvas-context-menu {
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 8px;
            z-index: 2000;
            display: none;
            min-width: 180px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .canvas-context-menu.active {
            display: block;
            animation: fadeIn 0.1s ease-out;
        }

        /* Drop Zone */
        .drop-indicator {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(102, 126, 234, 0.1);
            border: 3px dashed #667eea;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999;
            pointer-events: none;
        }

        .drop-indicator.active {
            display: flex;
        }

        .drop-indicator span {
            background: #667eea;
            color: white;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
        }

        /* Selection Box */
        .selection-box {
            position: absolute;
            border: 2px dashed #22d3ee;
            background: rgba(34, 211, 238, 0.1);
            pointer-events: none;
            z-index: 999;
        }

        /* Selected state for blocks and cards */
        .block.selected {
            outline: 3px solid #22d3ee;
            outline-offset: 2px;
        }

        .card.selected {
            outline: 3px solid #22d3ee;
            outline-offset: 2px;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button class="toolbar-btn" id="addBlock" title="Add Block (or double-click canvas)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <button class="toolbar-btn" id="saveBtn" title="Save"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg></button>
    </div>

    <div id="zoom-controls">
        <button class="zoom-btn" id="zoomOut"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <div class="zoom-level" id="zoomLevel">100%</div>
        <button class="zoom-btn" id="zoomIn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <button class="zoom-btn" id="resetZoom" title="Reset Zoom"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg></button>
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
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                <span>Link to .md file</span>
            </div>
            <div class="context-menu-item" id="unlinkFileMenu" style="display: none;">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"></path><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"></path><line x1="8" y1="2" x2="8" y2="5"></line><line x1="2" y1="8" x2="5" y2="8"></line><line x1="16" y1="19" x2="16" y2="22"></line><line x1="19" y1="16" x2="22" y2="16"></line></svg>
                <span>Unlink file</span>
            </div>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-item danger" id="deleteBlockMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                <span>Delete</span>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="fileModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Select Markdown File</h3>
            <input type="text" class="file-search-input" id="fileSearchInput" placeholder="搜尋檔案名稱...">
            <div class="file-list-container">
                <div class="file-list" id="fileList"></div>
                <div class="new-file-item" id="newFileItem">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                    <span>建立新檔案...</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Canvas Context Menu -->
    <div class="canvas-context-menu" id="canvasContextMenu">
        <div class="context-menu-item" id="addBlockFromMenu">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
            <span>Add Block</span>
        </div>
        <div class="context-menu-item" id="addCardFromMenu">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
            <span>Add Card (.md)</span>
        </div>
    </div>

    <!-- New Card Modal -->
    <div class="modal-overlay" id="newCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg> Create New Card</h3>
            <input type="text" class="modal-input" id="newCardFileName" placeholder="Enter filename (e.g. my-notes)">
            <div class="modal-actions">
                <button class="modal-btn" id="createCardBtn">Create</button>
                <button class="modal-btn" id="closeNewCardModal" style="background: transparent; border: 1px solid #333;">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Drop Indicator -->
    <div class="drop-indicator" id="dropIndicator">
        <span><svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M12 18v-6"></path><path d="m9 15 3 3 3-3"></path></svg> Drop .md file to create card</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const whiteboard = document.getElementById('whiteboard');
        const canvasContainer = document.getElementById('canvas-container');
        const contextMenu = document.getElementById('contextMenu');
        const canvasContextMenu = document.getElementById('canvasContextMenu');
        const fileModal = document.getElementById('fileModal');
        const fileList = document.getElementById('fileList');
        const colorGrid = document.getElementById('colorGrid');
        const newCardModal = document.getElementById('newCardModal');
        const dropIndicator = document.getElementById('dropIndicator');
        
        let blocks = [];
        let cards = [];
        let selectedBlockId = null;
        let contextBlockId = null;
        let contextCardId = null;
        let draggedBlock = null;
        let draggedCard = null;
        let resizingCard = null;
        let dragOffset = { x: 0, y: 0 };
        let zoomLevel = 1;
        let panOffset = { x: 0, y: 0 };
        let pendingCardPosition = { x: 0, y: 0 };

        // Multi-selection state
        let selectedBlocks = new Set();
        let selectedCards = new Set();
        let isSelecting = false;
        let selectionStart = { x: 0, y: 0 };
        let selectionBox = null;
        let isMultiDragging = false;
        let multiDragStart = { x: 0, y: 0 };
        let initialPositions = new Map();

        // Colors palette - 8 deep colors for white text visibility
        const colors = [
            '#2563eb', // 藍 Blue
            '#dc2626', // 紅 Red
            '#ea580c', // 橘 Orange
            '#16a34a', // 綠 Green
            '#4b5563', // 深灰 Dark Gray
            '#7c3aed', // 紫 Purple
            '#db2777', // 粉 Pink
            '#92400e'  // 咖 Brown
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

            // Display Content (Div)
            const contentDiv = document.createElement('div');
            contentDiv.className = 'block-content';
            contentDiv.textContent = block.text;
            div.appendChild(contentDiv);

            // Editable Input (Textarea)
            const textarea = document.createElement('textarea');
            textarea.className = 'block-input';
            textarea.value = block.text;
            textarea.placeholder = 'Type here...';
            div.appendChild(textarea);
            
            // Events for Input
            textarea.addEventListener('input', (e) => {
                block.text = e.target.value;
                contentDiv.textContent = block.text; // sync content
                saveState();
            });

            textarea.addEventListener('blur', () => {
                div.classList.remove('editing');
            });

            textarea.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevent drag when editing

            // Double click to edit
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation(); // Prevent canvas double click
                e.preventDefault();
                div.classList.add('editing');
                setTimeout(() => textarea.focus(), 0);
            });

            // Click on text content to open linked file (only text area, not surrounding space)
            // Normal click: open in main view, Option+click: open in split view
            contentDiv.addEventListener('click', (e) => {
                if (div.classList.contains('editing')) return;
                
                // If it was a drag release, don't open file
                if (draggedBlock) return;

                if (block.linkedFile) {
                    e.preventDefault();
                    e.stopPropagation();
                    const splitView = e.altKey;
                    vscode.postMessage({ command: 'openFile', filePath: block.linkedFile, splitView: splitView });
                }
            });

            // Dragging (MouseDown on the whole block)
            div.addEventListener('mousedown', (e) => {
                if (div.classList.contains('editing')) return; // Don't drag if editing
                if (e.button !== 0) return; // Only Left Click
                
                // Check if this block is part of a multi-selection
                if (isBlockSelected(block.id)) {
                    // Start multi-drag if clicking on an already selected block
                    e.stopPropagation();
                    startMultiDrag(e);
                } else if (e.shiftKey) {
                    // Shift+click to add to selection
                    e.stopPropagation();
                    toggleBlockSelection(block.id, true);
                } else {
                    // Normal click - clear selection and start single drag
                    clearSelection();
                    startDrag(e, div, block);
                }
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
            e.preventDefault(); // Prevent text selection

            const pos = screenToWhiteboard(e.clientX, e.clientY);
            const x = pos.x - dragOffset.x;
            const y = pos.y - dragOffset.y;

            draggedBlock.element.style.left = x + 'px';
            draggedBlock.element.style.top = y + 'px';

            draggedBlock.block.x = x;
            draggedBlock.block.y = y;
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
            // Default center if no coords - use whiteboard center
            const centerPos = screenToWhiteboard(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
            const startX = x !== undefined ? x : centerPos.x - 100;
            const startY = y !== undefined ? y : centerPos.y - 50;

            const block = {
                id: generateId(),
                x: startX,
                y: startY,
                color: colors[Math.floor(Math.random() * colors.length)],
                text: 'New Block',
                linkedFile: null
            };

            blocks.push(block);
            const element = createBlockElement(block);
            whiteboard.appendChild(element);
            saveState();
            
            // Auto enter edit mode
            setTimeout(() => {
                const event = new MouseEvent('dblclick', { bubbles: true });
                element.dispatchEvent(event);
            }, 50);
        }

        function showContextMenu(e, blockId) {
            contextBlockId = blockId;
            const block = blocks.find(b => b.id === blockId);
            
            const unlinkMenu = document.getElementById('unlinkFileMenu');
            unlinkMenu.style.display = block.linkedFile ? 'flex' : 'none';

            // Menu positioning
            let x = e.pageX;
            let y = e.pageY;
            
            // Bound checking
            const menuWidth = 220;
            const menuHeight = 200;
            if (x + menuWidth > window.innerWidth) x -= menuWidth;
            if (y + menuHeight > window.innerHeight) y -= menuHeight;

            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
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
            if (element) {
                element.style.transform = 'scale(0)';
                element.style.opacity = '0';
                setTimeout(() => element.remove(), 200);
            }
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

        // File selector state
        let allWorkspaceFiles = [];
        let selectedFileIndex = -1;
        let filteredFiles = [];
        let fileSelectorMode = 'block'; // 'block' for linking to block, 'card' for creating new card
        const fileSearchInput = document.getElementById('fileSearchInput');
        const newFileItem = document.getElementById('newFileItem');

        function openFileSelector(blockId, mode = 'block') {
            fileSelectorMode = mode;
            selectedBlockId = blockId || contextBlockId;
            selectedFileIndex = -1;
            fileSearchInput.value = '';
            
            // Update modal title based on mode
            const modalTitle = fileModal.querySelector('h3');
            if (modalTitle) {
                if (mode === 'card') {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg> Select or Create Card';
                } else {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Select Markdown File';
                }
            }
            
            vscode.postMessage({ command: 'getWorkspaceFiles' });
            fileModal.classList.add('active');
            setTimeout(() => fileSearchInput.focus(), 100);
            hideContextMenu();
            hideCanvasContextMenu();
        }

        function closeFileSelector() {
            fileModal.classList.remove('active');
            selectedBlockId = null;
            selectedFileIndex = -1;
        }

        function renderFileList(files) {
            filteredFiles = files;
            if (files.length === 0) {
                fileList.innerHTML = '<div class="no-results">找不到符合的檔案</div>';
            } else {
                fileList.innerHTML = files.map((f, i) => 
                    \`<div class="file-item\${i === selectedFileIndex ? ' selected' : ''}" data-file="\${f}" data-index="\${i}">\${f}</div>\`
                ).join('');
                fileList.querySelectorAll('.file-item').forEach(item => {
                    item.addEventListener('click', () => selectFile(item.dataset.file));
                });
            }
            
            // Update new file button text based on search query
            const query = fileSearchInput.value.trim();
            const newFileText = newFileItem.querySelector('span:last-child');
            if (newFileText) {
                if (query) {
                    newFileText.textContent = \`Create \${query}...\`;
                } else {
                    newFileText.textContent = '建立新檔案...';
                }
            }
            
            updateNewFileItemSelection();
        }

        function updateNewFileItemSelection() {
            // New File item is selected when selectedFileIndex equals filteredFiles.length
            if (selectedFileIndex === filteredFiles.length) {
                newFileItem.classList.add('selected');
            } else {
                newFileItem.classList.remove('selected');
            }
        }

        function updateSelectedItem() {
            fileList.querySelectorAll('.file-item').forEach((item, i) => {
                if (i === selectedFileIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
            updateNewFileItemSelection();
        }

        function filterFiles(query) {
            selectedFileIndex = -1;
            const q = query.toLowerCase();
            const filtered = allWorkspaceFiles.filter(f => f.toLowerCase().includes(q));
            renderFileList(filtered);
        }

        // File search input events
        fileSearchInput.addEventListener('input', (e) => {
            filterFiles(e.target.value);
        });

        fileSearchInput.addEventListener('keydown', (e) => {
            const totalItems = filteredFiles.length + 1; // +1 for New File item
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedFileIndex = Math.min(selectedFileIndex + 1, totalItems - 1);
                updateSelectedItem();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedFileIndex = Math.max(selectedFileIndex - 1, -1);
                updateSelectedItem();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedFileIndex >= 0 && selectedFileIndex < filteredFiles.length) {
                    selectFile(filteredFiles[selectedFileIndex]);
                } else if (selectedFileIndex === filteredFiles.length) {
                    // New File selected
                    handleNewFileClick();
                }
            } else if (e.key === 'Escape') {
                closeFileSelector();
            }
        });

        // New File item click
        newFileItem.addEventListener('click', handleNewFileClick);

        function handleNewFileClick() {
            const query = fileSearchInput.value.trim();
            
            if (fileSelectorMode === 'card') {
                // Card mode: create new card
                if (query) {
                    // Directly create file with the search query as filename
                    vscode.postMessage({ 
                        command: 'createNewCard', 
                        fileName: query,
                        x: pendingCardPosition.x - 150,
                        y: pendingCardPosition.y - 100
                    });
                    closeFileSelector();
                } else {
                    // No query - open modal for filename input
                    closeFileSelector();
                    newCardModal.classList.add('active');
                    document.getElementById('newCardFileName').value = '';
                    document.getElementById('newCardFileName').focus();
                }
            } else {
                // Block mode: link file to block
                if (query && selectedBlockId) {
                    // Directly create file with the search query as filename
                    vscode.postMessage({ 
                        command: 'createNewCard', 
                        fileName: query,
                        x: 0,
                        y: 0,
                        forBlockId: selectedBlockId
                    });
                    closeFileSelector();
                } else if (selectedBlockId) {
                    // No query - open modal for filename input
                    closeFileSelector();
                    newFileForBlockMode = true;
                    newCardModal.classList.add('active');
                    document.getElementById('newCardFileName').value = '';
                    document.getElementById('newCardFileName').focus();
                }
            }
        }

        let newFileForBlockMode = false;

        function selectFile(filePath) {
            if (fileSelectorMode === 'card') {
                // Add existing file as a new card
                addCard(filePath, pendingCardPosition.x - 150, pendingCardPosition.y - 100);
                closeFileSelector();
            } else {
                // Link file to block
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
        }

        function updateWhiteboardTransform() {
            whiteboard.style.transform = \`translate(\${panOffset.x}px, \${panOffset.y}px) scale(\${zoomLevel})\`;
        }

        // Convert screen coordinates to whiteboard coordinates
        function screenToWhiteboard(screenX, screenY) {
            return {
                x: (screenX - panOffset.x) / zoomLevel,
                y: (screenY - panOffset.y) / zoomLevel
            };
        }

        function setZoom(level, mouseX = null, mouseY = null) {
            const oldZoom = zoomLevel;
            zoomLevel = Math.max(0.1, Math.min(5, level)); // Wider zoom range
            
            // If mouse position provided, zoom centered on mouse
            if (mouseX !== null && mouseY !== null) {
                // Calculate the point on whiteboard that mouse is pointing at
                const pointX = (mouseX - panOffset.x) / oldZoom;
                const pointY = (mouseY - panOffset.y) / oldZoom;
                
                // Adjust pan offset so that same point stays under mouse after zoom
                panOffset.x = mouseX - pointX * zoomLevel;
                panOffset.y = mouseY - pointY * zoomLevel;
            }
            
            updateWhiteboardTransform();
            document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
        }

        // Multi-selection functions
        function clearSelection() {
            selectedBlocks.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('selected');
            });
            selectedCards.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('selected');
            });
            selectedBlocks.clear();
            selectedCards.clear();
        }

        function toggleBlockSelection(blockId, additive = false) {
            if (!additive) {
                clearSelection();
            }
            
            if (selectedBlocks.has(blockId)) {
                selectedBlocks.delete(blockId);
                document.getElementById(blockId)?.classList.remove('selected');
            } else {
                selectedBlocks.add(blockId);
                document.getElementById(blockId)?.classList.add('selected');
            }
        }

        function toggleCardSelection(cardId, additive = false) {
            if (!additive) {
                clearSelection();
            }
            
            if (selectedCards.has(cardId)) {
                selectedCards.delete(cardId);
                document.getElementById(cardId)?.classList.remove('selected');
            } else {
                selectedCards.add(cardId);
                document.getElementById(cardId)?.classList.add('selected');
            }
        }

        function startSelectionBox(e) {
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            selectionStart = { x: pos.x, y: pos.y };
            isSelecting = true;
            
            // Create selection box element
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.left = pos.x + 'px';
            selectionBox.style.top = pos.y + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            whiteboard.appendChild(selectionBox);
        }

        function updateSelectionBox(e) {
            if (!isSelecting || !selectionBox) return;
            
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            
            const left = Math.min(selectionStart.x, pos.x);
            const top = Math.min(selectionStart.y, pos.y);
            const width = Math.abs(pos.x - selectionStart.x);
            const height = Math.abs(pos.y - selectionStart.y);
            
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        }

        function endSelectionBox(e, additive = false) {
            if (!isSelecting || !selectionBox) return;
            
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            
            const selRect = {
                left: Math.min(selectionStart.x, pos.x),
                top: Math.min(selectionStart.y, pos.y),
                right: Math.max(selectionStart.x, pos.x),
                bottom: Math.max(selectionStart.y, pos.y)
            };
            
            // Only clear if not additive (Shift not held)
            if (!additive) {
                clearSelection();
            }
            
            // Check blocks for intersection
            blocks.forEach(block => {
                const blockRect = {
                    left: block.x,
                    top: block.y,
                    right: block.x + 200, // block width
                    bottom: block.y + 100 // block height
                };
                
                if (rectsIntersect(selRect, blockRect)) {
                    selectedBlocks.add(block.id);
                    document.getElementById(block.id)?.classList.add('selected');
                }
            });
            
            // Check cards for intersection
            cards.forEach(card => {
                const cardRect = {
                    left: card.x,
                    top: card.y,
                    right: card.x + (card.width || 300),
                    bottom: card.y + (card.height || 200)
                };
                
                if (rectsIntersect(selRect, cardRect)) {
                    selectedCards.add(card.id);
                    document.getElementById(card.id)?.classList.add('selected');
                }
            });
            
            // Remove selection box
            selectionBox.remove();
            selectionBox = null;
            isSelecting = false;
        }

        function rectsIntersect(a, b) {
            return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
        }

        function startMultiDrag(e) {
            if (selectedBlocks.size === 0 && selectedCards.size === 0) return;
            
            isMultiDragging = true;
            multiDragStart = screenToWhiteboard(e.clientX, e.clientY);
            
            // Store initial positions
            initialPositions.clear();
            selectedBlocks.forEach(id => {
                const block = blocks.find(b => b.id === id);
                if (block) {
                    initialPositions.set(id, { x: block.x, y: block.y });
                }
            });
            selectedCards.forEach(id => {
                const card = cards.find(c => c.id === id);
                if (card) {
                    initialPositions.set(id, { x: card.x, y: card.y });
                }
            });
            
            document.addEventListener('mousemove', onMultiDrag);
            document.addEventListener('mouseup', stopMultiDrag);
        }

        function onMultiDrag(e) {
            if (!isMultiDragging) return;
            e.preventDefault();
            
            const currentPos = screenToWhiteboard(e.clientX, e.clientY);
            const deltaX = currentPos.x - multiDragStart.x;
            const deltaY = currentPos.y - multiDragStart.y;
            
            // Move all selected blocks
            selectedBlocks.forEach(id => {
                const block = blocks.find(b => b.id === id);
                const initial = initialPositions.get(id);
                if (block && initial) {
                    block.x = initial.x + deltaX;
                    block.y = initial.y + deltaY;
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.left = block.x + 'px';
                        el.style.top = block.y + 'px';
                    }
                }
            });
            
            // Move all selected cards
            selectedCards.forEach(id => {
                const card = cards.find(c => c.id === id);
                const initial = initialPositions.get(id);
                if (card && initial) {
                    card.x = initial.x + deltaX;
                    card.y = initial.y + deltaY;
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.left = card.x + 'px';
                        el.style.top = card.y + 'px';
                    }
                }
            });
        }

        function stopMultiDrag() {
            if (isMultiDragging) {
                isMultiDragging = false;
                initialPositions.clear();
                saveState();
            }
            document.removeEventListener('mousemove', onMultiDrag);
            document.removeEventListener('mouseup', stopMultiDrag);
        }

        function isBlockSelected(blockId) {
            return selectedBlocks.has(blockId);
        }

        function isCardSelected(cardId) {
            return selectedCards.has(cardId);
        }

        function saveState() {
            vscode.postMessage({ command: 'saveState', state: { blocks, cards } });
        }

        function loadState(state) {
            blocks = state.blocks || [];
            cards = state.cards || [];
            whiteboard.innerHTML = '';
            blocks.forEach(block => {
                const element = createBlockElement(block);
                whiteboard.appendChild(element);
            });
            cards.forEach(card => {
                const element = createCardElement(card);
                whiteboard.appendChild(element);
                // Load card content
                vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            });
        }

        // Helper function to extract filename from path
        function getFileName(filePath) {
            if (!filePath) return 'Unknown';
            // Handle both forward and backward slashes
            const parts = filePath.replace(/\\\\/g, '/').split('/');
            return parts[parts.length - 1];
        }

        function createCardElement(card) {
            const div = document.createElement('div');
            div.className = 'card' + (card.collapsed ? ' collapsed' : '');
            div.id = card.id;
            div.style.left = card.x + 'px';
            div.style.top = card.y + 'px';
            div.style.width = (card.width || 300) + 'px';
            if (!card.collapsed) {
                div.style.height = (card.height || 200) + 'px';
            }

            // Header - only show filename, not full path
            const header = document.createElement('div');
            header.className = 'card-header';
            
            // Collapse toggle triangle
            const collapseToggle = document.createElement('div');
            collapseToggle.className = 'card-collapse-toggle';
            collapseToggle.title = card.collapsed ? 'Expand' : 'Collapse';
            header.appendChild(collapseToggle);
            
            // File icon - also clickable
            const fileIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            fileIcon.setAttribute('class', 'icon-sm');
            fileIcon.setAttribute('viewBox', '0 0 24 24');
            fileIcon.setAttribute('fill', 'none');
            fileIcon.setAttribute('stroke', 'currentColor');
            fileIcon.setAttribute('stroke-width', '2');
            fileIcon.setAttribute('stroke-linecap', 'round');
            fileIcon.setAttribute('stroke-linejoin', 'round');
            fileIcon.innerHTML = '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line>';
            fileIcon.style.cursor = 'pointer';
            fileIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const splitView = e.altKey;
                vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: splitView });
            });
            header.appendChild(fileIcon);
            
            // Filename - clickable to open file
            const displayName = getFileName(card.filePath);
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = displayName;
            filenameSpan.style.cursor = 'pointer';
            filenameSpan.title = 'Click to open, Option+click for split view';
            
            // Click on filename to open file
            filenameSpan.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const splitView = e.altKey;
                vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: splitView });
            });
            
            header.appendChild(filenameSpan);
            
            div.appendChild(header);

            // Content
            const content = document.createElement('div');
            content.className = 'card-content';
            
            // Textarea for editing
            const textarea = document.createElement('textarea');
            textarea.className = 'card-textarea';
            textarea.placeholder = 'Loading...';
            textarea.dataset.cardId = card.id;
            content.appendChild(textarea);
            
            // Disconnected message container (hidden by default)
            const disconnectedContainer = document.createElement('div');
            disconnectedContainer.className = 'disconnected-container';
            disconnectedContainer.style.display = 'none';
            
            const disconnectedMsg = document.createElement('div');
            disconnectedMsg.className = 'disconnected-message';
            disconnectedMsg.textContent = '此文件已斷開連結';
            disconnectedContainer.appendChild(disconnectedMsg);
            
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'refresh-btn';
            refreshBtn.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> 重新連結';
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Try to reload the file content
                vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            });
            disconnectedContainer.appendChild(refreshBtn);
            
            content.appendChild(disconnectedContainer);
            div.appendChild(content);

            // Resize handle
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'card-resize-handle';
            div.appendChild(resizeHandle);

            // Collapse toggle click handler
            collapseToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                card.collapsed = !card.collapsed;
                div.classList.toggle('collapsed');
                collapseToggle.title = card.collapsed ? 'Expand' : 'Collapse';
                
                if (!card.collapsed) {
                    // Restore height when expanding
                    div.style.height = (card.height || 200) + 'px';
                } else {
                    // Remove explicit height when collapsing
                    div.style.height = '';
                }
                saveState();
            });

            // Drag by header (but not by clicking on toggle)
            header.addEventListener('mousedown', (e) => {
                if (e.target === collapseToggle || collapseToggle.contains(e.target)) return;
                if (e.button !== 0) return;
                
                // Check if this card is part of a multi-selection
                if (isCardSelected(card.id)) {
                    // Start multi-drag if clicking on an already selected card
                    e.stopPropagation();
                    startMultiDrag(e);
                } else if (e.shiftKey) {
                    // Shift+click to add to selection
                    e.stopPropagation();
                    toggleCardSelection(card.id, true);
                } else {
                    // Normal click - clear selection and start single drag
                    clearSelection();
                    startCardDrag(e, div, card);
                }
            });

            // Resize
            resizeHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startCardResize(e, div, card);
            });

            // Save content on change (debounced)
            let saveTimeout;
            textarea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    vscode.postMessage({ 
                        command: 'saveCardContent', 
                        filePath: card.filePath, 
                        content: textarea.value 
                    });
                }, 500);
            });

            // Context menu
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showCardContextMenu(e, card.id);
            });

            return div;
        }

        function startCardDrag(e, element, card) {
            draggedCard = { element, card };
            element.classList.add('dragging');
            
            const rect = element.getBoundingClientRect();
            dragOffset = {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };

            document.addEventListener('mousemove', onCardDrag);
            document.addEventListener('mouseup', stopCardDrag);
        }

        function onCardDrag(e) {
            if (!draggedCard) return;
            e.preventDefault();

            const pos = screenToWhiteboard(e.clientX, e.clientY);
            const x = pos.x - dragOffset.x;
            const y = pos.y - dragOffset.y;

            draggedCard.element.style.left = x + 'px';
            draggedCard.element.style.top = y + 'px';

            draggedCard.card.x = x;
            draggedCard.card.y = y;
        }

        function stopCardDrag() {
            if (draggedCard) {
                draggedCard.element.classList.remove('dragging');
                draggedCard = null;
                saveState();
            }
            document.removeEventListener('mousemove', onCardDrag);
            document.removeEventListener('mouseup', stopCardDrag);
        }

        function startCardResize(e, element, card) {
            resizingCard = { element, card, startX: e.clientX, startY: e.clientY, startW: element.offsetWidth, startH: element.offsetHeight };
            document.addEventListener('mousemove', onCardResize);
            document.addEventListener('mouseup', stopCardResize);
        }

        function onCardResize(e) {
            if (!resizingCard) return;
            e.preventDefault();
            
            const dx = (e.clientX - resizingCard.startX) / zoomLevel;
            const dy = (e.clientY - resizingCard.startY) / zoomLevel;
            
            const newW = Math.max(250, resizingCard.startW + dx);
            const newH = Math.max(150, resizingCard.startH + dy);
            
            resizingCard.element.style.width = newW + 'px';
            resizingCard.element.style.height = newH + 'px';
            resizingCard.card.width = newW;
            resizingCard.card.height = newH;
        }

        function stopCardResize() {
            if (resizingCard) {
                resizingCard = null;
                saveState();
            }
            document.removeEventListener('mousemove', onCardResize);
            document.removeEventListener('mouseup', stopCardResize);
        }

        function addCard(filePath, x, y) {
            const card = {
                id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                x: x,
                y: y,
                width: 300,
                height: 200,
                filePath: filePath
            };
            cards.push(card);
            const element = createCardElement(card);
            whiteboard.appendChild(element);
            vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            saveState();
        }

        function showCardContextMenu(e, cardId) {
            contextCardId = cardId;
            // Reuse block context menu but hide color options
            const colorSection = contextMenu.querySelector('.context-menu-section');
            colorSection.style.display = 'none';
            document.getElementById('linkFileMenu').parentElement.style.display = 'none';
            
            let x = e.pageX;
            let y = e.pageY;
            if (x + 220 > window.innerWidth) x -= 220;
            if (y + 100 > window.innerHeight) y -= 100;
            
            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
            contextMenu.classList.add('active');
        }

        function showCanvasContextMenu(e) {
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            pendingCardPosition = { x: pos.x, y: pos.y };
            
            let x = e.pageX;
            let y = e.pageY;
            if (x + 180 > window.innerWidth) x -= 180;
            if (y + 100 > window.innerHeight) y -= 100;
            
            canvasContextMenu.style.left = x + 'px';
            canvasContextMenu.style.top = y + 'px';
            canvasContextMenu.classList.add('active');
        }

        function hideCanvasContextMenu() {
            canvasContextMenu.classList.remove('active');
        }

        function openNewCardModal() {
            newCardModal.classList.add('active');
            document.getElementById('newCardFileName').value = '';
            document.getElementById('newCardFileName').focus();
            hideCanvasContextMenu();
        }

        function closeNewCardModal() {
            newCardModal.classList.remove('active');
            newFileForBlockMode = false;
        }

        function createNewCard() {
            const fileName = document.getElementById('newCardFileName').value.trim();
            if (!fileName) return;
            
            if (newFileForBlockMode && selectedBlockId) {
                // Creating new file for block linking
                vscode.postMessage({ 
                    command: 'createNewCard', 
                    fileName: fileName,
                    x: 0,
                    y: 0,
                    forBlockId: selectedBlockId
                });
            } else {
                // Creating new card on canvas
                vscode.postMessage({ 
                    command: 'createNewCard', 
                    fileName: fileName,
                    x: pendingCardPosition.x - 150,
                    y: pendingCardPosition.y - 100
                });
            }
            closeNewCardModal();
        }

        // Message handling
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loadState':
                    loadState(message.state);
                    break;
                case 'workspaceFiles':
                    allWorkspaceFiles = message.files;
                    renderFileList(message.files);
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
                case 'fileChanged':
                    // File was changed externally (e.g., in VS Code editor)
                    // Update the card content if it's not currently being edited
                    const changedTextarea = document.querySelector(\`textarea[data-card-id=\"\${message.cardId}\"]\`);
                    if (changedTextarea) {
                        // If card was disconnected, reconnect it
                        const changedCard = changedTextarea.closest('.card');
                        if (changedCard && changedCard.classList.contains('disconnected')) {
                            changedCard.classList.remove('disconnected');
                            const disconnectedContainer = changedCard.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'none';
                            changedTextarea.style.display = '';
                        }
                        
                        // Only update if the textarea is not focused (user not actively editing)
                        if (document.activeElement !== changedTextarea) {
                            changedTextarea.value = message.content;
                        } else {
                            // If user is editing, store the new content and notify later
                            changedTextarea.dataset.pendingContent = message.content;
                            // Add a visual indicator that file was changed externally
                            const card = changedTextarea.closest('.card');
                            if (card && !card.classList.contains('external-change')) {
                                card.classList.add('external-change');
                                // Remove the indicator when user clicks away
                                changedTextarea.addEventListener('blur', function onBlur() {
                                    card.classList.remove('external-change');
                                    changedTextarea.removeEventListener('blur', onBlur);
                                }, { once: true });
                            }
                        }
                    }
                    break;
                case 'fileDeleted':
                    // File was deleted - show disconnected state
                    const deletedCardTextarea = document.querySelector(\`textarea[data-card-id="\${message.cardId}"]\`);
                    if (deletedCardTextarea) {
                        const deletedCard = deletedCardTextarea.closest('.card');
                        if (deletedCard && !deletedCard.classList.contains('disconnected')) {
                            deletedCard.classList.add('disconnected');
                            // Show disconnected message, hide textarea
                            deletedCardTextarea.style.display = 'none';
                            const disconnectedContainer = deletedCard.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'flex';
                        }
                    }
                    break;
                case 'cardContent':
                    const cardTextarea = document.querySelector(\`textarea[data-card-id="\${message.cardId}"]\`);
                    if (cardTextarea) {
                        // File exists - remove disconnected state if present
                        const cardEl = cardTextarea.closest('.card');
                        if (cardEl && cardEl.classList.contains('disconnected')) {
                            cardEl.classList.remove('disconnected');
                            const disconnectedContainer = cardEl.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'none';
                            cardTextarea.style.display = '';
                        }
                        cardTextarea.value = message.content;
                        cardTextarea.placeholder = 'Type here...';
                    }
                    break;
                case 'cardCreated':
                    if (message.forBlockId) {
                        // Link to block instead of creating card
                        const block = blocks.find(b => b.id === message.forBlockId);
                        if (block) {
                            block.linkedFile = message.filePath;
                            const element = document.getElementById(message.forBlockId);
                            if (element) element.classList.add('linked');
                            saveState();
                        }
                    } else {
                        addCard(message.filePath, message.x, message.y);
                    }
                    break;
                case 'fileRenamed':
                    // Card's linked file was renamed - update the card
                    const renamedCard = cards.find(c => c.id === message.cardId);
                    if (renamedCard) {
                        renamedCard.filePath = message.newPath;
                        // Update the filename display in the header
                        const cardElement = document.getElementById(message.cardId);
                        if (cardElement) {
                            const filenameSpan = cardElement.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'blockFileRenamed':
                    // Block's linked file was renamed - update the block
                    const renamedBlock = blocks.find(b => b.id === message.blockId);
                    if (renamedBlock) {
                        renamedBlock.linkedFile = message.newPath;
                        saveState();
                    }
                    break;
            }
        });

        // Event listeners
        document.getElementById('addBlock').addEventListener('click', () => addBlock());
        document.getElementById('saveBtn').addEventListener('click', saveState);
        document.getElementById('deleteBlockMenu').addEventListener('click', () => {
            if (contextCardId) {
                // Delete card
                cards = cards.filter(c => c.id !== contextCardId);
                const el = document.getElementById(contextCardId);
                if (el) el.remove();
                contextCardId = null;
                saveState();
                hideContextMenu();
            } else {
                deleteBlock();
            }
        });
        document.getElementById('linkFileMenu').addEventListener('click', () => openFileSelector());
        document.getElementById('unlinkFileMenu').addEventListener('click', unlinkFile);

        // Canvas context menu
        document.getElementById('addBlockFromMenu').addEventListener('click', () => {
            addBlock(pendingCardPosition.x - 100, pendingCardPosition.y - 50);
            hideCanvasContextMenu();
        });
        document.getElementById('addCardFromMenu').addEventListener('click', () => openFileSelector(null, 'card'));

        // New card modal
        document.getElementById('createCardBtn').addEventListener('click', createNewCard);
        document.getElementById('closeNewCardModal').addEventListener('click', closeNewCardModal);
        document.getElementById('newCardFileName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') createNewCard();
            if (e.key === 'Escape') closeNewCardModal();
        });

        // Click outside modal to close (on the overlay background)
        document.getElementById('fileModal').addEventListener('click', (e) => {
            if (e.target.id === 'fileModal') {
                closeFileSelector();
            }
        });
        document.getElementById('newCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'newCardModal') {
                closeNewCardModal();
            }
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (fileModal.classList.contains('active')) {
                    closeFileSelector();
                }
                if (newCardModal.classList.contains('active')) {
                    closeNewCardModal();
                }
            }
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoomLevel + 0.1));
        document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoomLevel - 0.1));
        document.getElementById('resetZoom').addEventListener('click', () => {
            setZoom(1);
            centerWhiteboard();
        });

        // Canvas panning with middle mouse button or Alt+drag
        let isPanning = false;
        let panStart = { x: 0, y: 0 };

        canvasContainer.addEventListener('mousedown', (e) => {
            // Middle mouse button (button 1) or Alt+left click for panning
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                canvasContainer.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }
            
            // Left click on empty canvas area - start selection box
            if (e.button === 0 && (e.target === whiteboard || e.target === canvasContainer)) {
                // Clear selection if not holding Shift
                if (!e.shiftKey) {
                    clearSelection();
                }
                startSelectionBox(e);
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isPanning) {
                panOffset.x = e.clientX - panStart.x;
                panOffset.y = e.clientY - panStart.y;
                updateWhiteboardTransform();
            }
            
            // Update selection box if selecting
            if (isSelecting) {
                updateSelectionBox(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isPanning) {
                isPanning = false;
                canvasContainer.style.cursor = 'grab';
            }
            
            // End selection box if selecting
            if (isSelecting) {
                endSelectionBox(e, e.shiftKey);
            }
        });

        // Also support Space+drag for panning (like in design tools)
        let spacePressed = false;
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
                spacePressed = true;
                canvasContainer.style.cursor = 'grab';
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                if (!isPanning) {
                    canvasContainer.style.cursor = 'grab';
                }
            }
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (spacePressed && e.button === 0) {
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                canvasContainer.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        // Double-click to add block
        canvasContainer.addEventListener('dblclick', (e) => {
            if (e.target === whiteboard || e.target === canvasContainer) {
                const pos = screenToWhiteboard(e.clientX, e.clientY);
                addBlock(pos.x - 100, pos.y - 50);
            }
        });

        // Hide context menus on click outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
                // Reset visibility of sections for block context menu
                const colorSection = contextMenu.querySelector('.context-menu-section');
                if (colorSection) colorSection.style.display = '';
                const linkSection = document.getElementById('linkFileMenu');
                if (linkSection && linkSection.parentElement) linkSection.parentElement.style.display = '';
                contextCardId = null;
            }
            if (!canvasContextMenu.contains(e.target)) {
                hideCanvasContextMenu();
            }
        });

        // Canvas right-click context menu
        canvasContainer.addEventListener('contextmenu', (e) => {
            if (e.target === whiteboard || e.target === canvasContainer) {
                e.preventDefault();
                showCanvasContextMenu(e);
            }
        });

        // Drag and drop .md files from explorer
        canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            dropIndicator.classList.add('active');
        });

        canvasContainer.addEventListener('dragleave', (e) => {
            if (!canvasContainer.contains(e.relatedTarget)) {
                dropIndicator.classList.remove('active');
            }
        });

        canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            dropIndicator.classList.remove('active');
            
            // VS Code drag-drop provides file path in dataTransfer
            const files = e.dataTransfer.files;
            const uriList = e.dataTransfer.getData('text/uri-list');
            
            // Calculate drop position
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            const x = pos.x - 150;
            const y = pos.y - 100;
            
            // Try to get relative path from VS Code
            if (uriList) {
                const uri = uriList.split('\\n')[0].trim();
                if (uri.endsWith('.md')) {
                    // Extract relative path - this may need adjustment based on VS Code's format
                    let filePath = decodeURIComponent(uri.replace('file://', ''));
                    // Try to make it relative if workspace info is available
                    addCard(filePath, x, y);
                }
            }
        });

        // Smooth Mouse wheel zoom and trackpad pan
        canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            if (e.ctrlKey || e.metaKey) {
                // Pinch zoom (ctrl+wheel or trackpad pinch)
                // Smooth zoom calculation centered on mouse position
                const zoomSensitivity = 0.0015;
                const delta = -e.deltaY * zoomSensitivity;
                const newZoom = zoomLevel + delta;
                
                // Zoom centered on mouse position
                setZoom(newZoom, e.clientX, e.clientY);
            } else {
                // Trackpad two-finger pan or regular scroll
                panOffset.x -= e.deltaX;
                panOffset.y -= e.deltaY;
                updateWhiteboardTransform();
            }
        }, { passive: false });

        // Load initial state
        vscode.postMessage({ command: 'requestState' });

        // Center the whiteboard view on load
        function centerWhiteboard() {
            const whiteboardWidth = whiteboard.offsetWidth;
            const whiteboardHeight = whiteboard.offsetHeight;
            const containerWidth = canvasContainer.clientWidth;
            const containerHeight = canvasContainer.clientHeight;
            
            // Calculate center position
            const centerX = (whiteboardWidth - containerWidth) / 2;
            const centerY = (whiteboardHeight - containerHeight) / 2;
            
            // Set pan offset to center
            panOffset.x = -centerX;
            panOffset.y = -centerY;
            updateWhiteboardTransform();
        }
        
        // Center on initial load
        setTimeout(centerWhiteboard, 100);

        // Icons are now inline SVGs, no initialization needed
    </script>
</body>
</html>`;
    }

    public dispose() {
        WhiteboardPanel.currentPanel = undefined;

        // Dispose file watcher
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
        }

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}

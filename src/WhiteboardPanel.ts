import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Data format version - increment when making breaking changes to the data structure
// v2: Added lastModified to cards, pinnedFiles, stashCards for sidebar features
const CURRENT_DATA_VERSION = 2;

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
    color?: string;
    lastModified?: number; // Unix timestamp of last modification
    collapsed?: boolean;
}

interface StashCard {
    id: string;
    filePath: string;
    color?: string;
    lastModified: number;
}

interface WhiteboardState {
    version: number;
    blocks: Block[];
    cards: Card[];
    pinnedFiles?: string[];   // Pinned files for sidebar Tab 1
    stashCards?: StashCard[]; // Stashed cards for sidebar Tab 3
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
                    case 'renameCard':
                        await this._renameCard(message.cardId, message.oldPath, message.newName);
                        break;
                    case 'moveCard':
                        await this._moveCard(message.cardId, message.oldPath, message.targetFolder);
                        break;
                    case 'getWorkspaceFolders':
                        const folders = await this._getWorkspaceFolders();
                        this._panel.webview.postMessage({ command: 'workspaceFolders', folders });
                        break;
                    case 'readPinnedFileContent':
                        await this._readPinnedFileContent(message.filePath);
                        break;
                    case 'savePinnedFileContent':
                        await this._savePinnedFileContent(message.filePath, message.content);
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

    private async _readPinnedFileContent(filePath: string) {
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
                    command: 'pinnedFileContent',
                    filePath: filePath,
                    content: content
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error reading pinned file: ${error}`);
        }
    }

    private async _savePinnedFileContent(filePath: string, content: string) {
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
            vscode.window.showErrorMessage(`Error saving pinned file: ${error}`);
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

    private async _renameCard(cardId: string, oldPath: string, newName: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Get full old path
            const oldFullPath = path.isAbsolute(oldPath)
                ? oldPath
                : path.join(workspaceRoot, oldPath);

            // Ensure .md extension
            let finalNewName = newName;
            if (!finalNewName.endsWith('.md')) {
                finalNewName += '.md';
            }

            // Build new path (same directory as old path)
            const oldDir = path.dirname(oldFullPath);
            const newFullPath = path.join(oldDir, finalNewName);
            const newRelativePath = path.relative(workspaceRoot, newFullPath);

            // Check if source file exists
            if (!fs.existsSync(oldFullPath)) {
                vscode.window.showErrorMessage(`File not found: ${oldPath}`);
                return;
            }

            // Check if target file already exists
            if (fs.existsSync(newFullPath)) {
                vscode.window.showErrorMessage(`File already exists: ${newRelativePath}`);
                return;
            }

            // Use VS Code's WorkspaceEdit to rename - this triggers onDidRenameFiles properly
            const oldUri = vscode.Uri.file(oldFullPath);
            const newUri = vscode.Uri.file(newFullPath);

            const edit = new vscode.WorkspaceEdit();
            edit.renameFile(oldUri, newUri);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                // Notify webview about successful rename
                this._panel.webview.postMessage({
                    command: 'cardRenamed',
                    cardId: cardId,
                    oldPath: oldPath,
                    newPath: newRelativePath
                });

                vscode.window.showInformationMessage(`Renamed to: ${finalNewName}`);
            } else {
                vscode.window.showErrorMessage('Failed to rename file');
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
    }

    private async _moveCard(cardId: string, oldPath: string, targetFolder: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Get full old path
            const oldFullPath = path.isAbsolute(oldPath)
                ? oldPath
                : path.join(workspaceRoot, oldPath);

            // Get filename
            const fileName = path.basename(oldFullPath);

            // Build new path
            const targetDir = path.join(workspaceRoot, targetFolder);
            const newFullPath = path.join(targetDir, fileName);
            const newRelativePath = path.join(targetFolder, fileName);

            // Check if source file exists
            if (!fs.existsSync(oldFullPath)) {
                vscode.window.showErrorMessage(`File not found: ${oldPath}`);
                return;
            }

            // Create target directory if not exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Check if target file already exists
            if (fs.existsSync(newFullPath)) {
                vscode.window.showErrorMessage(`File already exists in target folder: ${newRelativePath}`);
                return;
            }

            // Use VS Code's WorkspaceEdit to move - this triggers onDidRenameFiles properly
            const oldUri = vscode.Uri.file(oldFullPath);
            const newUri = vscode.Uri.file(newFullPath);

            const edit = new vscode.WorkspaceEdit();
            edit.renameFile(oldUri, newUri);

            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                // Notify webview about successful move
                this._panel.webview.postMessage({
                    command: 'cardMoved',
                    cardId: cardId,
                    oldPath: oldPath,
                    newPath: newRelativePath
                });

                vscode.window.showInformationMessage(`Moved to: ${targetFolder || '/ (root)'}`);
            } else {
                vscode.window.showErrorMessage('Failed to move file');
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Error moving file: ${error}`);
        }
    }

    private async _getWorkspaceFolders(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const folders: string[] = ['']; // Include root as empty string

        // Recursively find all directories
        const findDirs = (dir: string, relativePath: string = '') => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
                        folders.push(relPath);
                        findDirs(path.join(dir, entry.name), relPath);
                    }
                }
            } catch (error) {
                // Ignore permission errors
            }
        };

        findDirs(workspaceRoot);
        return folders.sort();
    }

    private _saveState(state: WhiteboardState) {
        // Ensure version is always set to current version when saving
        const stateToSave: WhiteboardState = {
            version: CURRENT_DATA_VERSION,
            blocks: state.blocks,
            cards: state.cards,
            pinnedFiles: state.pinnedFiles || [],
            stashCards: state.stashCards || []
        };

        if (this._document) {
            // File-based storage: write to .whiteboard.json file
            try {
                const filePath = this._document.uri.fsPath;
                fs.writeFileSync(filePath, JSON.stringify(stateToSave, null, 2), 'utf-8');
            } catch (error) {
                vscode.window.showErrorMessage(`Error saving whiteboard: ${error}`);
            }
        } else {
            // Legacy: use workspaceState
            this._context.workspaceState.update('whiteboardState', stateToSave);
        }
    }

    private _loadState(): WhiteboardState {
        let rawState: any;

        if (this._document) {
            // File-based storage: read from .whiteboard.json file
            try {
                const content = this._document.getText();
                if (content.trim()) {
                    rawState = JSON.parse(content);
                }
            } catch (error) {
                console.error('Error parsing whiteboard file:', error);
            }
        } else {
            // Legacy: use workspaceState
            rawState = this._context.workspaceState.get('whiteboardState');
        }

        // Migrate data if needed
        return this._migrateState(rawState);
    }

    /**
     * Migrate old data format to current version
     * This ensures backward compatibility with older whiteboard files
     */
    private _migrateState(rawState: any): WhiteboardState {
        // Default empty state
        if (!rawState) {
            return { version: CURRENT_DATA_VERSION, blocks: [], cards: [], pinnedFiles: [], stashCards: [] };
        }

        const version = rawState.version || 0;
        let state = { ...rawState };

        // Migration: v0 (no version) -> v1
        if (version < 1) {
            console.log('Migrating whiteboard data from v0 to v1');
            state = {
                version: 1,
                blocks: state.blocks || [],
                cards: state.cards || []
            };
        }

        // Migration: v1 -> v2: Add lastModified to cards, add pinnedFiles and stashCards
        if (version < 2) {
            console.log('Migrating whiteboard data from v1 to v2');
            const now = Date.now();
            state.cards = (state.cards || []).map((card: any) => ({
                ...card,
                lastModified: card.lastModified || now
            }));
            state.pinnedFiles = state.pinnedFiles || [];
            state.stashCards = state.stashCards || [];
            state.version = 2;
        }

        return state;
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
            /* Note: No transition here - causes panning lag */
        }

        .block {
            position: absolute;
            width: 150px;
            height: 75px;
            border-radius: 14px;
            cursor: move;
            user-select: none;
            transition: box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 14px;
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
            font-size: 15px;
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
            border-radius: 14px;
            color: white;
            font-size: 15px;
            font-weight: 600;
            text-align: center;
            outline: none;
            resize: none;
            font-family: inherit;
            padding: 22px 14px;
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

        /* Folder tree styles */
        .folder-tree {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .folder-tree-item {
            display: flex;
            flex-direction: column;
        }

        .folder-tree-row {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #ccc;
            transition: all 0.2s ease;
            gap: 8px;
        }

        .folder-tree-row:hover {
            background: #2a2a2a;
            border-color: #555;
            color: #fff;
        }

        .folder-tree-row.selected {
            background: #2a2a2a;
            border-color: #667eea;
            color: #fff;
        }

        .folder-toggle {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s ease;
            flex-shrink: 0;
        }

        .folder-toggle svg {
            width: 12px;
            height: 12px;
            stroke: #888;
            transition: stroke 0.2s ease;
        }

        .folder-toggle:hover svg {
            stroke: #fff;
        }

        .folder-toggle.expanded {
            transform: rotate(90deg);
        }

        .folder-toggle.hidden {
            visibility: hidden;
        }

        .folder-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }

        .folder-icon svg {
            width: 16px;
            height: 16px;
            stroke: #888;
        }

        .folder-tree-row:hover .folder-icon svg {
            stroke: #f59e0b;
        }

        .folder-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .folder-children {
            margin-left: 20px;
            padding-left: 8px;
            border-left: 1px solid #333;
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-top: 2px;
            overflow: hidden;
        }

        .folder-children.collapsed {
            display: none;
        }

        /* Root folder special style */
        .folder-tree-row.root-folder {
            background: linear-gradient(135deg, #1a1a2e 0%, #0a0a0a 100%);
            border-color: #444;
        }

        .folder-tree-row.root-folder:hover {
            border-color: #667eea;
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

        /* Selected state for blocks and cards - unified white outline */
        .block.selected,
        .card.selected {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        /* Editing state - also white outline for consistency */
        .block.editing {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        .card.editing {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        /* ========== Sidebar Styles ========== */
        #sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 320px;
            height: 100vh;
            background: #0d0d0d;
            border-right: 1px solid #333;
            z-index: 1001;
            display: flex;
            flex-direction: column;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        #sidebar.open {
            transform: translateX(0);
        }

        .sidebar-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #333;
            gap: 8px;
        }

        .sidebar-tabs {
            display: flex;
            flex: 1;
            gap: 4px;
        }

        .sidebar-tab {
            flex: 1;
            padding: 10px 12px;
            background: transparent;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            color: #888;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .sidebar-tab:hover {
            background: #1a1a1a;
            color: #ccc;
        }

        .sidebar-tab.active {
            background: #1a1a1a;
            color: #fff;
        }

        .sidebar-tab svg {
            width: 18px;
            height: 18px;
        }

        .sidebar-close {
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .sidebar-close:hover {
            background: #1a1a1a;
            color: #fff;
        }

        .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }

        .sidebar-panel {
            display: none;
        }

        .sidebar-panel.active {
            display: block;
        }

        /* Tab 1: Pinned Files */
        .pinned-files-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            color: #666;
        }

        .pinned-files-empty svg {
            width: 48px;
            height: 48px;
            margin-bottom: 16px;
            stroke: #444;
        }

        .select-file-btn {
            padding: 10px 20px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            color: #ccc;
            cursor: pointer;
            font-size: 14px;
            margin-top: 16px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .select-file-btn:hover {
            background: #2a2a2a;
            color: #fff;
            border-color: #555;
        }

        .pinned-file-viewer {
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            overflow: hidden;
        }

        .pinned-file-header {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid #333;
            gap: 8px;
        }

        .pinned-file-header .filename {
            flex: 1;
            font-size: 13px;
            color: #ccc;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .pinned-file-actions {
            display: flex;
            gap: 4px;
        }

        .pinned-file-actions button {
            width: 24px;
            height: 24px;
            background: transparent;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .pinned-file-actions button:hover {
            background: #333;
            color: #fff;
        }

        .pinned-file-content {
            padding: 12px;
            max-height: calc(100vh - 200px);
            overflow-y: auto;
        }

        .pinned-file-textarea {
            width: 100%;
            min-height: 200px;
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 13px;
            font-family: inherit;
            line-height: 1.6;
            resize: vertical;
            outline: none;
        }

        /* Tab 2: Card List */
        .card-list-controls {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }

        .color-filter {
            flex: 1;
            padding: 8px 12px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            color: #ccc;
            font-size: 13px;
            cursor: pointer;
            outline: none;
        }

        .color-filter:focus {
            border-color: #667eea;
        }

        .card-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .card-list-item {
            display: flex;
            align-items: center;
            padding: 12px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 10px;
        }

        .card-list-item:hover {
            background: #2a2a2a;
            border-color: #444;
            transform: translateX(4px);
        }

        .card-list-item .color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .card-list-item .card-info {
            flex: 1;
            min-width: 0;
        }

        .card-list-item .card-name {
            font-size: 14px;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
        }

        .card-list-item .card-time {
            font-size: 11px;
            color: #666;
        }

        .card-list-empty {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }

        /* Tab 3: Stash */
        .stash-dropzone {
            border: 2px dashed #333;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            color: #666;
            margin-bottom: 12px;
            transition: all 0.2s ease;
        }

        .stash-dropzone.drag-over {
            border-color: #667eea;
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .stash-dropzone svg {
            width: 32px;
            height: 32px;
            margin-bottom: 8px;
        }

        .stash-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .stash-item {
            display: flex;
            align-items: center;
            padding: 12px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 8px;
            gap: 10px;
            transition: all 0.2s ease;
        }

        .stash-item:hover {
            background: #2a2a2a;
            border-color: #444;
        }

        .stash-item .color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .stash-item .stash-info {
            flex: 1;
            min-width: 0;
        }

        .stash-item .stash-name {
            font-size: 14px;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .stash-item-actions {
            display: flex;
            gap: 4px;
        }

        .stash-item-actions button {
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .stash-item-actions button:hover {
            background: #333;
            color: #fff;
        }

        .stash-item-actions button.restore:hover {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .stash-item-actions button.delete:hover {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .stash-empty {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 13px;
        }

        /* Adjust toolbar when sidebar is open */
        #toolbar.sidebar-open {
            left: 336px;
        }

        /* Adjust canvas container when sidebar is open */
        #canvas-container.sidebar-open {
            margin-left: 320px;
            width: calc(100% - 320px);
        }
    </style>
</head>
<body>
    <!-- Sidebar -->
    <div id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-tabs">
                <button class="sidebar-tab active" id="tabPinned" title="常用文件">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                <button class="sidebar-tab" id="tabCards" title="卡片清單">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </button>
                <button class="sidebar-tab" id="tabStash" title="暫存區">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                </button>
            </div>
            <button class="sidebar-close" id="closeSidebar" title="關閉側邊欄">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="sidebar-content">
            <!-- Tab 1: Pinned Files -->
            <div class="sidebar-panel active" id="panelPinned">
                <div class="pinned-files-empty" id="pinnedEmpty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <div>尚無固定的文件</div>
                    <button class="select-file-btn" id="selectPinnedFile">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Select file
                    </button>
                </div>
                <div id="pinnedFileViewer" style="display: none;"></div>
            </div>

            <!-- Tab 2: Card List -->
            <div class="sidebar-panel" id="panelCards">
                <div class="card-list-controls">
                    <select class="color-filter" id="colorFilter">
                        <option value="">所有顏色</option>
                    </select>
                </div>
                <div class="card-list" id="cardList"></div>
                <div class="card-list-empty" id="cardListEmpty" style="display: none;">
                    白板中沒有卡片
                </div>
            </div>

            <!-- Tab 3: Stash -->
            <div class="sidebar-panel" id="panelStash">
                <div class="stash-dropzone" id="stashDropzone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <div>拖曳卡片到此處暫存</div>
                </div>
                <div class="stash-list" id="stashList"></div>
                <div class="stash-empty" id="stashEmpty" style="display: none;">
                    暫存區是空的
                </div>
            </div>
        </div>
    </div>

    <div id="toolbar">
        <button class="toolbar-btn" id="toggleSidebar" title="Toggle Sidebar"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></button>
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
        <div class="context-menu-section" id="cardActionsSection" style="display: none;">
            <div class="context-menu-item" id="renameCardMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
                <span>Rename</span>
            </div>
            <div class="context-menu-item" id="moveCardMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg>
                <span>Move to...</span>
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

    <!-- Rename Card Modal -->
    <div class="modal-overlay" id="renameCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg> Rename Card</h3>
            <input type="text" class="modal-input" id="renameCardInput" placeholder="Enter new filename">
            <div class="modal-actions">
                <button class="modal-btn" id="confirmRenameBtn">Rename</button>
                <button class="modal-btn" id="closeRenameModal" style="background: transparent; border: 1px solid #333;">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Move Card Modal (Folder Selector) -->
    <div class="modal-overlay" id="moveCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Move to Folder</h3>
            <input type="text" class="file-search-input" id="folderSearchInput" placeholder="搜尋資料夾...">
            <div class="file-list-container">
                <div class="file-list" id="folderList"></div>
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
        const renameCardModal = document.getElementById('renameCardModal');
        const moveCardModal = document.getElementById('moveCardModal');
        const folderList = document.getElementById('folderList');
        
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

        // ========== Save Optimization ==========
        // Debounce: delay save until user stops making changes (500ms)
        // Dirty Flag: only save if there are actual changes
        let saveTimeoutId = null;
        let isDirty = false;
        let lastSavedState = null;
        const SAVE_DEBOUNCE_MS = 500;
        // ========================================

        // ========== Rename/Move State ==========
        let renameTargetCardId = null;
        let renameTargetPath = null;
        let moveTargetCardId = null;
        let moveTargetPath = null;
        let allWorkspaceFolders = [];
        let filteredFolders = [];
        let selectedFolderIndex = -1; // -1 means nothing selected (focus on search input)
        let flatFolderList = []; // Flattened list of visible folders for keyboard navigation
        // ========================================

        // ========== Sidebar State ==========
        const sidebar = document.getElementById('sidebar');
        const toolbar = document.getElementById('toolbar');
        const toggleSidebarBtn = document.getElementById('toggleSidebar');
        const closeSidebarBtn = document.getElementById('closeSidebar');
        const tabPinned = document.getElementById('tabPinned');
        const tabCards = document.getElementById('tabCards');
        const tabStash = document.getElementById('tabStash');
        const panelPinned = document.getElementById('panelPinned');
        const panelCards = document.getElementById('panelCards');
        const panelStash = document.getElementById('panelStash');
        const pinnedEmpty = document.getElementById('pinnedEmpty');
        const pinnedFileViewer = document.getElementById('pinnedFileViewer');
        const selectPinnedFileBtn = document.getElementById('selectPinnedFile');
        const cardListElem = document.getElementById('cardList');
        const cardListEmpty = document.getElementById('cardListEmpty');
        const colorFilterSelect = document.getElementById('colorFilter');
        const stashDropzone = document.getElementById('stashDropzone');
        const stashListElem = document.getElementById('stashList');
        const stashEmpty = document.getElementById('stashEmpty');
        
        let pinnedFiles = [];
        let stashCards = [];
        let currentPinnedFile = null;
        let pinnedFileContent = '';
        let sidebarOpen = false;
        let currentColorFilter = '';
        let cardBeingDraggedToStash = null;
        // ===================================

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
            // Cmd+click (Mac) or Ctrl+click (Win): open file in main view
            // Option+click (Mac) or Alt+click (Win): open file in split view
            // Cmd+Option+click: also open in split view
            contentDiv.addEventListener('click', (e) => {
                if (div.classList.contains('editing')) return;
                
                // If it was a drag release, don't open file
                if (draggedBlock) return;

                if (block.linkedFile) {
                    // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                    if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                    
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
                    // Normal click - select this item and start single drag
                    clearSelection();
                    selectedBlocks.add(block.id);
                    div.classList.add('selected');
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
            if (contextCardId) {
                // Change card color
                const card = cards.find(c => c.id === contextCardId);
                if (card) {
                    card.color = color;
                    const element = document.getElementById(contextCardId);
                    if (element) {
                        // Apply to entire card (lighter)
                        element.style.background = colorWithAlpha(color, 0.15);
                        element.style.borderColor = colorWithAlpha(color, 0.4);
                        
                        // Apply to header (slightly more opaque)
                        const header = element.querySelector('.card-header');
                        if (header) {
                            header.style.background = colorWithAlpha(color, 0.35);
                        }
                    }
                    saveState();
                }
                hideContextMenu();
                return;
            }
            
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
            forceSave(); // Use forceSave for delete operations
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
                } else if (mode === 'pinned') {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Select Pinned File';
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
            const q = query.toLowerCase();
            const filtered = allWorkspaceFiles.filter(f => f.toLowerCase().includes(q));
            
            // If no matching files and there's a query, auto-select the "Create" option
            if (filtered.length === 0 && query.trim()) {
                selectedFileIndex = 0; // Will be set to newFileItem (filteredFiles.length = 0)
            } else {
                selectedFileIndex = -1;
            }
            
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
                if (selectedFileIndex >= totalItems - 1) {
                    // At the end (Create button), wrap to input (-1)
                    selectedFileIndex = -1;
                } else {
                    selectedFileIndex = selectedFileIndex + 1;
                }
                updateSelectedItem();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedFileIndex <= -1) {
                    // At input, jump to Create button (last item)
                    selectedFileIndex = totalItems - 1;
                } else {
                    selectedFileIndex = selectedFileIndex - 1;
                }
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
            } else if (fileSelectorMode === 'pinned') {
                // Add file to pinned files list
                if (!pinnedFiles.includes(filePath)) {
                    pinnedFiles.push(filePath);
                }
                currentPinnedFile = filePath;
                closeFileSelector();
                renderPinnedFiles();
                saveState();
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

        function setZoom(level, mouseX = null, mouseY = null, smooth = false) {
            const oldZoom = zoomLevel;
            const newZoom = Math.max(0.1, Math.min(5, level)); // Wider zoom range
            
            // If no position provided, default to viewport center
            if (mouseX === null || mouseY === null) {
                mouseX = canvasContainer.clientWidth / 2;
                mouseY = canvasContainer.clientHeight / 2;
            }
            
            // Calculate the point on whiteboard that mouse is pointing at
            const pointX = (mouseX - panOffset.x) / oldZoom;
            const pointY = (mouseY - panOffset.y) / oldZoom;
            
            // Adjust pan offset so that same point stays under mouse after zoom
            panOffset.x = mouseX - pointX * newZoom;
            panOffset.y = mouseY - pointY * newZoom;
            
            zoomLevel = newZoom;
            
            // Apply smooth transition for button clicks
            if (smooth) {
                whiteboard.style.transition = 'transform 0.2s ease-out';
                // Remove transition after animation completes
                setTimeout(() => {
                    whiteboard.style.transition = '';
                }, 200);
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

        /**
         * Exit all editing modes for blocks and cards
         * Called when clicking on empty canvas area
         */
        function exitAllEditingModes() {
            // Exit block editing mode
            const editingBlocks = document.querySelectorAll('.block.editing');
            editingBlocks.forEach(block => {
                block.classList.remove('editing');
                // Sync text content from input to display
                const textarea = block.querySelector('.block-input');
                const contentDiv = block.querySelector('.block-content');
                if (textarea && contentDiv) {
                    contentDiv.textContent = textarea.value;
                }
            });

            // Exit card editing mode (blur active textarea)
            const editingCards = document.querySelectorAll('.card.editing');
            editingCards.forEach(card => {
                card.classList.remove('editing');
            });

            // Blur any focused textarea/input
            if (document.activeElement && 
                (document.activeElement.tagName === 'TEXTAREA' || 
                 document.activeElement.tagName === 'INPUT')) {
                document.activeElement.blur();
            }
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

        /**
         * Mark state as dirty and schedule a save
         * Uses debounce to avoid saving too frequently
         */
        function saveState() {
            isDirty = true;
            scheduleSave();
        }

        /**
         * Schedule a save with debounce
         * Cancels any pending save and starts a new timer
         */
        function scheduleSave() {
            if (saveTimeoutId) {
                clearTimeout(saveTimeoutId);
            }
            saveTimeoutId = setTimeout(() => {
                performSave();
            }, SAVE_DEBOUNCE_MS);
        }

        /**
         * Actually perform the save if there are changes
         * Uses dirty flag to skip unnecessary saves
         */
        function performSave() {
            saveTimeoutId = null;
            
            if (!isDirty) {
                return; // No changes, skip save
            }

            const currentState = JSON.stringify({ blocks, cards, pinnedFiles, stashCards });
            
            // Check if state actually changed (deep comparison)
            if (lastSavedState === currentState) {
                isDirty = false;
                return; // No actual changes, skip save
            }

            // Actually save
            vscode.postMessage({ command: 'saveState', state: { blocks, cards, pinnedFiles, stashCards } });
            lastSavedState = currentState;
            isDirty = false;
        }

        /**
         * Force an immediate save (used for critical operations)
         * Bypasses debounce but still respects dirty flag
         */
        function forceSave() {
            if (saveTimeoutId) {
                clearTimeout(saveTimeoutId);
                saveTimeoutId = null;
            }
            performSave();
        }

        function loadState(state) {
            blocks = state.blocks || [];
            cards = state.cards || [];
            pinnedFiles = state.pinnedFiles || [];
            stashCards = state.stashCards || [];
            
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
            
            // Initialize sidebar data
            initSidebar();
        }

        // Helper function to convert hex color to rgba with alpha
        function colorWithAlpha(hexColor, alpha) {
            // Handle hex colors
            if (hexColor && hexColor.startsWith('#')) {
                const hex = hexColor.slice(1);
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
            }
            return hexColor;
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
            
            // Apply card color to entire card background (lighter version)
            if (card.color) {
                div.style.background = colorWithAlpha(card.color, 0.15);
                div.style.borderColor = colorWithAlpha(card.color, 0.4);
            }

            // Header - only show filename, not full path
            const header = document.createElement('div');
            header.className = 'card-header';
            
            // Apply card color to header (slightly more opaque)
            if (card.color) {
                header.style.background = colorWithAlpha(card.color, 0.35);
            }
            
            // Collapse toggle triangle
            const collapseToggle = document.createElement('div');
            collapseToggle.className = 'card-collapse-toggle';
            collapseToggle.title = card.collapsed ? 'Expand' : 'Collapse';
            header.appendChild(collapseToggle);
            
            // File icon - clickable to open file (requires Cmd/Ctrl)
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
                // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                
                e.preventDefault();
                e.stopPropagation();
                const splitView = e.altKey;
                vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: splitView });
            });
            header.appendChild(fileIcon);
            
            // Filename - clickable to open file (requires Cmd/Ctrl)
            const displayName = getFileName(card.filePath);
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = displayName;
            filenameSpan.style.cursor = 'pointer';
            filenameSpan.title = 'Cmd+click or Option+click to open file';
            
            // Click on filename to open file (requires Cmd/Ctrl OR Option/Alt)
            filenameSpan.addEventListener('click', (e) => {
                // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                
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
                    // Normal click - select this item and start single drag
                    clearSelection();
                    selectedCards.add(card.id);
                    div.classList.add('selected');
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
                    // Update lastModified timestamp
                    updateCardLastModified(card.id);
                    saveState();
                }, 500);
            });

            // Add editing class when focused for visual feedback
            textarea.addEventListener('focus', () => {
                div.classList.add('editing');
            });

            textarea.addEventListener('blur', () => {
                div.classList.remove('editing');
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
            // Show color section for cards too
            const colorSection = contextMenu.querySelector('.context-menu-section');
            colorSection.style.display = 'block';
            // Hide link/unlink options (cards are already linked to files)
            document.getElementById('linkFileMenu').parentElement.style.display = 'none';
            // Show card-specific actions (Rename, Move)
            document.getElementById('cardActionsSection').style.display = 'block';
            
            let x = e.pageX;
            let y = e.pageY;
            if (x + 220 > window.innerWidth) x -= 220;
            if (y + 280 > window.innerHeight) y -= 280;
            
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

        // ========== Rename Card Functions ==========
        function openRenameModal(cardId, filePath) {
            renameTargetCardId = cardId;
            renameTargetPath = filePath;
            
            // Pre-fill with current filename (without extension)
            const currentName = filePath.split('/').pop().replace('.md', '');
            const input = document.getElementById('renameCardInput');
            input.value = currentName;
            
            renameCardModal.classList.add('active');
            input.focus();
            input.select();
        }

        function closeRenameModal() {
            renameCardModal.classList.remove('active');
            renameTargetCardId = null;
            renameTargetPath = null;
        }

        function confirmRename() {
            const newName = document.getElementById('renameCardInput').value.trim();
            if (!newName || !renameTargetCardId || !renameTargetPath) return;
            
            vscode.postMessage({
                command: 'renameCard',
                cardId: renameTargetCardId,
                oldPath: renameTargetPath,
                newName: newName
            });
            
            closeRenameModal();
        }

        // ========== Move Card Functions ==========
        function openMoveModal(cardId, filePath) {
            moveTargetCardId = cardId;
            moveTargetPath = filePath;
            selectedFolderIndex = -1; // Reset selection
            flatFolderList = []; // Reset folder list
            
            // Request folder list from extension
            vscode.postMessage({ command: 'getWorkspaceFolders' });
            
            moveCardModal.classList.add('active');
            document.getElementById('folderSearchInput').value = '';
            document.getElementById('folderSearchInput').focus();
        }

        function closeMoveModal() {
            moveCardModal.classList.remove('active');
            moveTargetCardId = null;
            moveTargetPath = null;
            allWorkspaceFolders = [];
            filteredFolders = [];
        }

        // Build folder tree structure from flat folder paths
        function buildFolderTree(folders) {
            const tree = { name: '', path: '', children: {} };
            
            folders.forEach(folderPath => {
                if (folderPath === '') {
                    // Root folder - already in tree
                    return;
                }
                
                const parts = folderPath.split('/');
                let current = tree;
                let currentPath = '';
                
                parts.forEach((part, index) => {
                    currentPath = currentPath ? currentPath + '/' + part : part;
                    if (!current.children[part]) {
                        current.children[part] = {
                            name: part,
                            path: currentPath,
                            children: {}
                        };
                    }
                    current = current.children[part];
                });
            });
            
            return tree;
        }

        // Track expanded folders state
        const expandedFolders = new Set(['']); // Root is expanded by default

        function renderFolderTree(node, container, isRoot = false) {
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = expandedFolders.has(node.path);
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'folder-tree-item';
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'folder-tree-row' + (isRoot ? ' root-folder' : '');
            rowDiv.dataset.path = node.path;
            
            // Toggle arrow (for folders with children)
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'folder-toggle' + (isExpanded ? ' expanded' : '') + (!hasChildren ? ' hidden' : '');
            toggleDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
            
            if (hasChildren) {
                toggleDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (expandedFolders.has(node.path)) {
                        expandedFolders.delete(node.path);
                    } else {
                        expandedFolders.add(node.path);
                    }
                    renderFolderList(filteredFolders);
                });
            }
            
            // Folder icon
            const iconDiv = document.createElement('div');
            iconDiv.className = 'folder-icon';
            iconDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg>';
            
            // Folder name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'folder-name';
            nameSpan.textContent = isRoot ? '/ (根目錄)' : node.name;
            
            rowDiv.appendChild(toggleDiv);
            rowDiv.appendChild(iconDiv);
            rowDiv.appendChild(nameSpan);
            
            // Click to select folder
            rowDiv.addEventListener('click', () => selectFolder(node.path));
            
            itemDiv.appendChild(rowDiv);
            
            // Render children if expanded
            if (hasChildren) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'folder-children' + (isExpanded ? '' : ' collapsed');
                
                // Sort children alphabetically
                const sortedChildren = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
                sortedChildren.forEach(child => {
                    renderFolderTree(child, childrenDiv, false);
                });
                
                itemDiv.appendChild(childrenDiv);
            }
            
            container.appendChild(itemDiv);
        }

        // Collect visible folders in tree order for keyboard navigation
        function collectVisibleFolders(node, result = []) {
            result.push(node.path);
            
            if (expandedFolders.has(node.path)) {
                const sortedChildren = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
                sortedChildren.forEach(child => {
                    collectVisibleFolders(child, result);
                });
            }
            
            return result;
        }

        function renderFolderList(folders) {
            folderList.innerHTML = '';
            
            // Check if we're filtering (searching)
            const searchQuery = document.getElementById('folderSearchInput').value.trim().toLowerCase();
            
            if (searchQuery) {
                // Flat list for search results
                flatFolderList = folders.slice(); // Copy the filtered folders
                folders.forEach((folder, index) => {
                    const item = document.createElement('div');
                    item.className = 'folder-tree-row' + (index === selectedFolderIndex ? ' selected' : '');
                    item.dataset.index = index;
                    item.innerHTML = \`
                        <div class="folder-toggle hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
                        <div class="folder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg></div>
                        <span class="folder-name">\${folder === '' ? '/ (根目錄)' : folder}</span>
                    \`;
                    item.addEventListener('click', () => selectFolder(folder));
                    folderList.appendChild(item);
                });
            } else {
                // Build and render tree structure
                const tree = buildFolderTree(folders);
                const treeContainer = document.createElement('div');
                treeContainer.className = 'folder-tree';
                
                // Collect visible folders for keyboard navigation
                flatFolderList = collectVisibleFolders(tree);
                
                // Render root folder first
                renderFolderTree(tree, treeContainer, true);
                
                folderList.appendChild(treeContainer);
            }
            
            // Update selected state
            updateSelectedFolder();
        }

        function updateSelectedFolder() {
            // Remove all selected states first
            folderList.querySelectorAll('.folder-tree-row').forEach((row, i) => {
                row.classList.remove('selected');
            });
            
            // Add selected state to the correct item
            if (selectedFolderIndex >= 0 && selectedFolderIndex < flatFolderList.length) {
                const selectedPath = flatFolderList[selectedFolderIndex];
                const selectedRow = folderList.querySelector(\`.folder-tree-row[data-path="\${selectedPath}"]\`);
                if (selectedRow) {
                    selectedRow.classList.add('selected');
                    selectedRow.scrollIntoView({ block: 'nearest' });
                } else {
                    // For search results mode, use index
                    const searchRows = folderList.querySelectorAll('.folder-tree-row');
                    if (searchRows[selectedFolderIndex]) {
                        searchRows[selectedFolderIndex].classList.add('selected');
                        searchRows[selectedFolderIndex].scrollIntoView({ block: 'nearest' });
                    }
                }
            }
        }

        function filterFolders(query) {
            const lowerQuery = query.toLowerCase();
            filteredFolders = allWorkspaceFolders.filter(f => 
                f.toLowerCase().includes(lowerQuery) || (f === '' && '根目錄'.includes(lowerQuery))
            );
            selectedFolderIndex = -1; // Reset selection when filtering
            renderFolderList(filteredFolders);
        }

        function selectFolder(folder) {
            if (!moveTargetCardId || !moveTargetPath) return;
            
            vscode.postMessage({
                command: 'moveCard',
                cardId: moveTargetCardId,
                oldPath: moveTargetPath,
                targetFolder: folder
            });
            
            closeMoveModal();
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
                case 'cardRenamed':
                    // Card was renamed via context menu
                    const cardToRename = cards.find(c => c.id === message.cardId);
                    if (cardToRename) {
                        cardToRename.filePath = message.newPath;
                        // Update the filename display in the header
                        const cardEl = document.getElementById(message.cardId);
                        if (cardEl) {
                            const filenameSpan = cardEl.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'cardMoved':
                    // Card was moved to another folder via context menu
                    const cardToMove = cards.find(c => c.id === message.cardId);
                    if (cardToMove) {
                        cardToMove.filePath = message.newPath;
                        // Update the filename display (path may have changed)
                        const movedCardEl = document.getElementById(message.cardId);
                        if (movedCardEl) {
                            const filenameSpan = movedCardEl.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'workspaceFolders':
                    // Received folder list for move modal
                    allWorkspaceFolders = message.folders;
                    filteredFolders = message.folders;
                    renderFolderList(message.folders);
                    break;
                case 'pinnedFileContent':
                    // Received content for pinned file in sidebar
                    const pinnedTextarea = document.getElementById('pinnedTextarea');
                    if (pinnedTextarea && message.filePath === currentPinnedFile) {
                        pinnedTextarea.value = message.content;
                    }
                    break;
            }
        });

        // Event listeners
        document.getElementById('addBlock').addEventListener('click', () => addBlock());
        document.getElementById('saveBtn').addEventListener('click', forceSave);
        document.getElementById('deleteBlockMenu').addEventListener('click', () => {
            if (contextCardId) {
                // Delete card
                cards = cards.filter(c => c.id !== contextCardId);
                const el = document.getElementById(contextCardId);
                if (el) el.remove();
                contextCardId = null;
                forceSave(); // Use forceSave for delete operations
                hideContextMenu();
            } else {
                deleteBlock();
            }
        });
        document.getElementById('linkFileMenu').addEventListener('click', () => openFileSelector());
        document.getElementById('unlinkFileMenu').addEventListener('click', unlinkFile);

        // Card-specific context menu actions
        document.getElementById('renameCardMenu').addEventListener('click', () => {
            if (!contextCardId) return;
            const card = cards.find(c => c.id === contextCardId);
            if (card) {
                openRenameModal(card.id, card.filePath);
            }
            hideContextMenu();
        });

        document.getElementById('moveCardMenu').addEventListener('click', () => {
            if (!contextCardId) return;
            const card = cards.find(c => c.id === contextCardId);
            if (card) {
                openMoveModal(card.id, card.filePath);
            }
            hideContextMenu();
        });

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

        // Rename card modal
        document.getElementById('confirmRenameBtn').addEventListener('click', confirmRename);
        document.getElementById('closeRenameModal').addEventListener('click', closeRenameModal);
        document.getElementById('renameCardInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmRename();
            if (e.key === 'Escape') closeRenameModal();
        });
        document.getElementById('renameCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'renameCardModal') {
                closeRenameModal();
            }
        });

        // Move card modal
        document.getElementById('folderSearchInput').addEventListener('input', (e) => {
            filterFolders(e.target.value);
        });
        document.getElementById('folderSearchInput').addEventListener('keydown', (e) => {
            const totalItems = flatFolderList.length;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedFolderIndex >= totalItems - 1) {
                    // At the end, wrap to input (-1)
                    selectedFolderIndex = -1;
                } else {
                    selectedFolderIndex = selectedFolderIndex + 1;
                }
                updateSelectedFolder();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedFolderIndex <= -1) {
                    // At input, jump to last item (bottom)
                    selectedFolderIndex = totalItems - 1;
                } else {
                    selectedFolderIndex = selectedFolderIndex - 1;
                }
                updateSelectedFolder();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedFolderIndex >= 0 && selectedFolderIndex < totalItems) {
                    selectFolder(flatFolderList[selectedFolderIndex]);
                }
            } else if (e.key === 'Escape') {
                closeMoveModal();
            }
        });
        document.getElementById('moveCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'moveCardModal') {
                closeMoveModal();
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
                if (renameCardModal.classList.contains('active')) {
                    closeRenameModal();
                }
                if (moveCardModal.classList.contains('active')) {
                    closeMoveModal();
                }
            }
        });

        // Zoom controls - use viewport center and smooth animation
        document.getElementById('zoomIn').addEventListener('click', () => {
            setZoom(zoomLevel + 0.1, null, null, true);
        });
        document.getElementById('zoomOut').addEventListener('click', () => {
            setZoom(zoomLevel - 0.1, null, null, true);
        });
        document.getElementById('resetZoom').addEventListener('click', () => {
            // Smooth transition for reset
            whiteboard.style.transition = 'transform 0.3s ease-out';
            setZoom(1, null, null, false);
            centerWhiteboard();
            setTimeout(() => {
                whiteboard.style.transition = '';
            }, 300);
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
                // Exit all editing modes when clicking empty area
                exitAllEditingModes();
                
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
            // Skip all keyboard shortcuts if editing text
            if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
                // Only handle Space for panning if not in text input
                return;
            }
            
            if (e.code === 'Space' && !e.repeat) {
                spacePressed = true;
                canvasContainer.style.cursor = 'grab';
            }
            
            // Delete/Backspace to delete selected items
            if (e.code === 'Delete' || e.code === 'Backspace') {
                deleteSelectedItems();
                e.preventDefault();
            }
        });

        /**
         * Delete all selected blocks and cards
         */
        function deleteSelectedItems() {
            if (selectedBlocks.size === 0 && selectedCards.size === 0) return;
            
            // Delete selected blocks
            selectedBlocks.forEach(blockId => {
                blocks = blocks.filter(b => b.id !== blockId);
                const element = document.getElementById(blockId);
                if (element) {
                    element.style.transform = 'scale(0)';
                    element.style.opacity = '0';
                    setTimeout(() => element.remove(), 200);
                }
            });
            
            // Delete selected cards
            selectedCards.forEach(cardId => {
                cards = cards.filter(c => c.id !== cardId);
                const element = document.getElementById(cardId);
                if (element) {
                    element.style.transform = 'scale(0)';
                    element.style.opacity = '0';
                    setTimeout(() => element.remove(), 200);
                }
            });
            
            // Clear selection
            selectedBlocks.clear();
            selectedCards.clear();
            
            // Force save immediately for delete operations
            forceSave();
        }

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
                // Hide card-specific actions
                const cardActionsSection = document.getElementById('cardActionsSection');
                if (cardActionsSection) cardActionsSection.style.display = 'none';
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
            // If the active element is a textarea (editing card), let it scroll naturally
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'TEXTAREA') {
                const textarea = activeElement;
                // Check if the textarea can scroll (has overflow)
                const canScrollUp = textarea.scrollTop > 0;
                const canScrollDown = textarea.scrollTop < (textarea.scrollHeight - textarea.clientHeight);
                
                // If scrolling down and can scroll down, or scrolling up and can scroll up
                // Let the native scroll happen
                if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                    // Don't prevent default - allow textarea to scroll
                    e.stopPropagation();
                    return;
                }
                
                // If inside an editing card, check if mouse is over the card
                // If so, don't pan the whiteboard - this prevents accidental panning while editing
                const editingCard = textarea.closest('.card.editing');
                if (editingCard) {
                    const cardRect = editingCard.getBoundingClientRect();
                    if (e.clientX >= cardRect.left && e.clientX <= cardRect.right &&
                        e.clientY >= cardRect.top && e.clientY <= cardRect.bottom) {
                        // Mouse is inside editing card - don't pan unless using Ctrl/Cmd for zoom
                        if (!e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            return;
                        }
                    }
                }
            }
            
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

        // ========== Sidebar Functions ==========
        
        /**
         * Initialize sidebar with loaded state data
         */
        function initSidebar() {
            // Initialize color filter options
            initColorFilter();
            
            // Render pinned files
            renderPinnedFiles();
            
            // Render card list
            renderCardList();
            
            // Render stash
            renderStash();
        }
        
        /**
         * Toggle sidebar open/close
         */
        function toggleSidebar() {
            sidebarOpen = !sidebarOpen;
            if (sidebarOpen) {
                sidebar.classList.add('open');
                toolbar.classList.add('sidebar-open');
                canvasContainer.classList.add('sidebar-open');
            } else {
                sidebar.classList.remove('open');
                toolbar.classList.remove('sidebar-open');
                canvasContainer.classList.remove('sidebar-open');
            }
        }
        
        /**
         * Switch sidebar tab
         */
        function switchTab(tabName) {
            // Update tab buttons
            [tabPinned, tabCards, tabStash].forEach(tab => tab.classList.remove('active'));
            [panelPinned, panelCards, panelStash].forEach(panel => panel.classList.remove('active'));
            
            if (tabName === 'pinned') {
                tabPinned.classList.add('active');
                panelPinned.classList.add('active');
            } else if (tabName === 'cards') {
                tabCards.classList.add('active');
                panelCards.classList.add('active');
                renderCardList(); // Refresh list when switching to this tab
            } else if (tabName === 'stash') {
                tabStash.classList.add('active');
                panelStash.classList.add('active');
                renderStash();
            }
        }
        
        // Sidebar event listeners
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
        closeSidebarBtn.addEventListener('click', toggleSidebar);
        tabPinned.addEventListener('click', () => switchTab('pinned'));
        tabCards.addEventListener('click', () => switchTab('cards'));
        tabStash.addEventListener('click', () => switchTab('stash'));
        
        // ========== Tab 1: Pinned Files ==========
        
        function renderPinnedFiles() {
            if (pinnedFiles.length === 0) {
                pinnedEmpty.style.display = 'flex';
                pinnedFileViewer.style.display = 'none';
                pinnedFileViewer.innerHTML = '';
                currentPinnedFile = null;
                return;
            }
            
            pinnedEmpty.style.display = 'none';
            pinnedFileViewer.style.display = 'block';
            
            // For now, show the first pinned file
            if (!currentPinnedFile || !pinnedFiles.includes(currentPinnedFile)) {
                currentPinnedFile = pinnedFiles[0];
            }
            
            pinnedFileViewer.innerHTML = \`
                <div class="pinned-file-viewer">
                    <div class="pinned-file-header">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span class="filename">\${getFileName(currentPinnedFile)}</span>
                        <div class="pinned-file-actions">
                            <button class="open-pinned" title="Open in Editor">
                                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </button>
                            <button class="unpin-file" title="Unpin">
                                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="pinned-file-content">
                        <textarea class="pinned-file-textarea" id="pinnedTextarea" placeholder="Loading..."></textarea>
                    </div>
                </div>
            \`;
            
            // Add event listeners
            pinnedFileViewer.querySelector('.open-pinned').addEventListener('click', () => {
                vscode.postMessage({ command: 'openFile', filePath: currentPinnedFile, splitView: true });
            });
            
            pinnedFileViewer.querySelector('.unpin-file').addEventListener('click', () => {
                pinnedFiles = pinnedFiles.filter(f => f !== currentPinnedFile);
                currentPinnedFile = null;
                renderPinnedFiles();
                saveState();
            });
            
            // Load file content
            vscode.postMessage({ command: 'readPinnedFileContent', filePath: currentPinnedFile });
            
            // Save on change with debounce
            const textarea = pinnedFileViewer.querySelector('#pinnedTextarea');
            let pinnedSaveTimeout;
            textarea.addEventListener('input', () => {
                clearTimeout(pinnedSaveTimeout);
                pinnedSaveTimeout = setTimeout(() => {
                    vscode.postMessage({ 
                        command: 'savePinnedFileContent', 
                        filePath: currentPinnedFile, 
                        content: textarea.value 
                    });
                }, 500);
            });
        }
        
        selectPinnedFileBtn.addEventListener('click', () => {
            openFileSelector(null, 'pinned');
        });
        
        // ========== Tab 2: Card List ==========
        
        function initColorFilter() {
            // Clear existing options except the first "All colors" option
            colorFilterSelect.innerHTML = '<option value="">所有顏色</option>';
            
            // Add color options
            const colorNames = {
                '#2563eb': '藍色',
                '#dc2626': '紅色',
                '#ea580c': '橘色',
                '#16a34a': '綠色',
                '#4b5563': '深灰',
                '#7c3aed': '紫色',
                '#db2777': '粉色',
                '#92400e': '咖啡'
            };
            
            colors.forEach(color => {
                const option = document.createElement('option');
                option.value = color;
                option.textContent = colorNames[color] || color;
                option.style.color = color;
                colorFilterSelect.appendChild(option);
            });
        }
        
        colorFilterSelect.addEventListener('change', (e) => {
            currentColorFilter = e.target.value;
            renderCardList();
        });
        
        function formatTimeAgo(timestamp) {
            if (!timestamp) return '';
            const now = Date.now();
            const diff = now - timestamp;
            
            const minutes = Math.floor(diff / (1000 * 60));
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (minutes < 1) return '剛剛';
            if (minutes < 60) return minutes + ' 分鐘前';
            if (hours < 24) return hours + ' 小時前';
            if (days < 30) return days + ' 天前';
            return new Date(timestamp).toLocaleDateString();
        }
        
        function renderCardList() {
            // Filter and sort cards
            let filteredCards = [...cards];
            
            if (currentColorFilter) {
                filteredCards = filteredCards.filter(c => c.color === currentColorFilter);
            }
            
            // Sort by lastModified (newest first)
            filteredCards.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            
            if (filteredCards.length === 0) {
                cardListElem.style.display = 'none';
                cardListEmpty.style.display = 'block';
                cardListEmpty.textContent = currentColorFilter ? '沒有符合篩選的卡片' : '白板中沒有卡片';
                return;
            }
            
            cardListElem.style.display = 'flex';
            cardListEmpty.style.display = 'none';
            
            cardListElem.innerHTML = filteredCards.map(card => \`
                <div class="card-list-item" data-card-id="\${card.id}" draggable="true">
                    <div class="color-dot" style="background: \${card.color || '#4b5563'}"></div>
                    <div class="card-info">
                        <div class="card-name">\${getFileName(card.filePath)}</div>
                        <div class="card-time">\${formatTimeAgo(card.lastModified)}</div>
                    </div>
                </div>
            \`).join('');
            
            // Add click listeners to navigate to card
            cardListElem.querySelectorAll('.card-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const cardId = item.dataset.cardId;
                    navigateToCard(cardId);
                });
                
                // Add drag listener for stash
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', item.dataset.cardId);
                    e.dataTransfer.effectAllowed = 'move';
                    cardBeingDraggedToStash = item.dataset.cardId;
                });
                
                item.addEventListener('dragend', () => {
                    cardBeingDraggedToStash = null;
                });
            });
        }
        
        function navigateToCard(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (!card) return;
            
            const cardEl = document.getElementById(cardId);
            if (!cardEl) return;
            
            // Calculate the center position of the card
            const cardCenterX = card.x + (card.width || 280) / 2;
            const cardCenterY = card.y + (card.height || 200) / 2;
            
            // Calculate the viewport center
            const viewportCenterX = canvasContainer.clientWidth / 2;
            const viewportCenterY = canvasContainer.clientHeight / 2;
            
            // Calculate new pan offset to center the card
            panOffset.x = viewportCenterX - cardCenterX * zoomLevel;
            panOffset.y = viewportCenterY - cardCenterY * zoomLevel;
            
            // Smooth transition
            whiteboard.style.transition = 'transform 0.3s ease-out';
            updateWhiteboardTransform();
            
            setTimeout(() => {
                whiteboard.style.transition = '';
            }, 300);
            
            // Highlight the card briefly
            cardEl.classList.add('selected');
            clearSelection();
            selectedCards.add(cardId);
        }
        
        // ========== Tab 3: Stash ==========
        
        function renderStash() {
            if (stashCards.length === 0) {
                stashListElem.style.display = 'none';
                stashEmpty.style.display = 'block';
                return;
            }
            
            stashListElem.style.display = 'flex';
            stashEmpty.style.display = 'none';
            
            // Sort by lastModified (newest first)
            const sortedStash = [...stashCards].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            
            stashListElem.innerHTML = sortedStash.map(item => \`
                <div class="stash-item" data-stash-id="\${item.id}">
                    <div class="color-dot" style="background: \${item.color || '#4b5563'}"></div>
                    <div class="stash-info">
                        <div class="stash-name">\${getFileName(item.filePath)}</div>
                    </div>
                    <div class="stash-item-actions">
                        <button class="restore" title="恢復到白板">
                            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                        </button>
                        <button class="delete" title="永久刪除">
                            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            \`).join('');
            
            // Add event listeners
            stashListElem.querySelectorAll('.stash-item').forEach(item => {
                const stashId = item.dataset.stashId;
                
                item.querySelector('.restore').addEventListener('click', () => {
                    restoreFromStash(stashId);
                });
                
                item.querySelector('.delete').addEventListener('click', () => {
                    deleteFromStash(stashId);
                });
            });
        }
        
        function moveCardToStash(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (!card) return;
            
            // Add to stash
            stashCards.push({
                id: card.id,
                filePath: card.filePath,
                color: card.color,
                lastModified: Date.now()
            });
            
            // Remove from whiteboard
            cards = cards.filter(c => c.id !== cardId);
            const cardEl = document.getElementById(cardId);
            if (cardEl) {
                cardEl.style.transform = 'scale(0)';
                cardEl.style.opacity = '0';
                setTimeout(() => cardEl.remove(), 200);
            }
            
            renderStash();
            renderCardList();
            saveState();
        }
        
        function restoreFromStash(stashId) {
            const stashItem = stashCards.find(s => s.id === stashId);
            if (!stashItem) return;
            
            // Get center of viewport for placement
            const centerPos = screenToWhiteboard(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
            
            // Create new card
            const newCard = {
                id: stashItem.id,
                x: centerPos.x - 140,
                y: centerPos.y - 100,
                width: 280,
                height: 200,
                filePath: stashItem.filePath,
                color: stashItem.color,
                lastModified: Date.now()
            };
            
            cards.push(newCard);
            const element = createCardElement(newCard);
            whiteboard.appendChild(element);
            vscode.postMessage({ command: 'readCardContent', cardId: newCard.id, filePath: newCard.filePath });
            
            // Remove from stash
            stashCards = stashCards.filter(s => s.id !== stashId);
            
            renderStash();
            renderCardList();
            saveState();
        }
        
        function deleteFromStash(stashId) {
            stashCards = stashCards.filter(s => s.id !== stashId);
            renderStash();
            saveState();
        }
        
        // Stash dropzone events
        stashDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            stashDropzone.classList.add('drag-over');
        });
        
        stashDropzone.addEventListener('dragleave', (e) => {
            stashDropzone.classList.remove('drag-over');
        });
        
        stashDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            stashDropzone.classList.remove('drag-over');
            
            const cardId = e.dataTransfer.getData('text/plain');
            if (cardId && cards.find(c => c.id === cardId)) {
                moveCardToStash(cardId);
                // Switch to stash tab
                switchTab('stash');
            }
        });
        
        // Make cards on whiteboard draggable to stash
        function enableCardDragToStash(cardElement, card) {
            cardElement.setAttribute('draggable', 'true');
            
            cardElement.addEventListener('dragstart', (e) => {
                // Only allow drag from header
                if (!e.target.closest('.card-header')) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.setData('text/plain', card.id);
                e.dataTransfer.effectAllowed = 'move';
                cardBeingDraggedToStash = card.id;
                cardElement.style.opacity = '0.5';
            });
            
            cardElement.addEventListener('dragend', () => {
                cardBeingDraggedToStash = null;
                cardElement.style.opacity = '1';
            });
        }
        
        // Update card's lastModified when content changes
        function updateCardLastModified(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (card) {
                card.lastModified = Date.now();
            }
        }

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

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhiteboardPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const types_1 = require("./types");
const styles_1 = require("./webview/styles");
const template_1 = require("./webview/template");
const scripts_1 = require("./webview/scripts");
class WhiteboardPanel {
    // Legacy: Open from command palette (uses workspaceState)
    static createOrShow(context) {
        const column = vscode.ViewColumn.One;
        // If we already have a panel, show it
        if (WhiteboardPanel.currentPanel) {
            WhiteboardPanel.currentPanel._panel.reveal(column);
            return;
        }
        // Create a new panel
        const panel = vscode.window.createWebviewPanel(WhiteboardPanel.viewType, 'Whiteboard', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media')
            ]
        });
        WhiteboardPanel.currentPanel = new WhiteboardPanel(panel, context);
    }
    // New: Open from .whiteboard.json file (uses file-based storage)
    static createFromDocument(context, panel, document) {
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
    constructor(panel, context, document) {
        this._disposables = [];
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
        this._panel.webview.onDidReceiveMessage(async (message) => {
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
        }, null, this._disposables);
    }
    _setupFileWatcher() {
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
    async _handleFileRename(files) {
        try {
            const state = this._loadState();
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders)
                return;
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            let stateChanged = false;
            for (const { oldUri, newUri } of files) {
                // Only handle .md files
                if (!oldUri.fsPath.endsWith('.md') && !newUri.fsPath.endsWith('.md'))
                    continue;
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
                    if (!block.linkedFile)
                        continue;
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
        }
        catch (error) {
            console.error('Error handling file rename:', error);
        }
    }
    async _notifyFileDeleted(uri) {
        try {
            const state = this._loadState();
            const filePath = uri.fsPath;
            // Check if any card is using this file
            const matchingCards = state.cards.filter((card) => {
                if (path.isAbsolute(card.filePath)) {
                    return card.filePath === filePath;
                }
                else {
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
        }
        catch (error) {
            // Ignore errors
        }
    }
    async _notifyFileChanged(uri) {
        try {
            const state = this._loadState();
            const filePath = uri.fsPath;
            // Check if any card is using this file
            const matchingCards = state.cards.filter((card) => {
                // Handle both absolute and relative paths
                if (path.isAbsolute(card.filePath)) {
                    return card.filePath === filePath;
                }
                else {
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
        }
        catch (error) {
            // File might not exist or other error, just ignore
        }
    }
    async _openFile(filePath, splitView = true) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            let fullPath;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            }
            else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }
            const uri = vscode.Uri.file(fullPath);
            if (fs.existsSync(fullPath)) {
                const doc = await vscode.workspace.openTextDocument(uri);
                const viewColumn = splitView ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
                await vscode.window.showTextDocument(doc, viewColumn);
            }
            else {
                vscode.window.showErrorMessage(`File not found: ${filePath}`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error opening file: ${error}`);
        }
    }
    async _browseFile(blockId) {
        const options = {
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
    async _getMarkdownFiles() {
        const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**', 100);
        return files.map(f => vscode.workspace.asRelativePath(f));
    }
    async _readCardContent(cardId, filePath) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }
            let fullPath;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            }
            else {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error reading file: ${error}`);
        }
    }
    async _saveCardContent(filePath, content) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }
            let fullPath;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            }
            else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }
            fs.writeFileSync(fullPath, content, 'utf-8');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error saving file: ${error}`);
        }
    }
    async _readPinnedFileContent(filePath) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }
            let fullPath;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            }
            else {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error reading pinned file: ${error}`);
        }
    }
    async _savePinnedFileContent(filePath, content) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return;
            }
            let fullPath;
            if (path.isAbsolute(filePath)) {
                fullPath = filePath;
            }
            else {
                fullPath = path.join(workspaceFolders[0].uri.fsPath, filePath);
            }
            fs.writeFileSync(fullPath, content, 'utf-8');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error saving pinned file: ${error}`);
        }
    }
    _getCardFolderPath() {
        const config = vscode.workspace.getConfiguration('whiteboard');
        return config.get('cardFolderPath', '');
    }
    async _createNewCard(fileName, x, y, forBlockId) {
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
            let fullPath;
            let relativePath;
            if (folderPath) {
                const targetDir = path.join(workspaceRoot, folderPath);
                // Create directory if not exists
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                fullPath = path.join(targetDir, finalFileName);
                relativePath = path.join(folderPath, finalFileName);
            }
            else {
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
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error creating file: ${error}`);
        }
    }
    async _renameCard(cardId, oldPath, newName) {
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
            }
            else {
                vscode.window.showErrorMessage('Failed to rename file');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error renaming file: ${error}`);
        }
    }
    async _moveCard(cardId, oldPath, targetFolder) {
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
            }
            else {
                vscode.window.showErrorMessage('Failed to move file');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error moving file: ${error}`);
        }
    }
    async _getWorkspaceFolders() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const folders = ['']; // Include root as empty string
        // Recursively find all directories
        const findDirs = (dir, relativePath = '') => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
                        folders.push(relPath);
                        findDirs(path.join(dir, entry.name), relPath);
                    }
                }
            }
            catch (error) {
                // Ignore permission errors
            }
        };
        findDirs(workspaceRoot);
        return folders.sort();
    }
    _saveState(state) {
        // Ensure version is always set to current version when saving
        const stateToSave = {
            version: types_1.CURRENT_DATA_VERSION,
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
            }
            catch (error) {
                vscode.window.showErrorMessage(`Error saving whiteboard: ${error}`);
            }
        }
        else {
            // Legacy: use workspaceState
            this._context.workspaceState.update('whiteboardState', stateToSave);
        }
    }
    _loadState() {
        let rawState;
        if (this._document) {
            // File-based storage: read from .whiteboard.json file
            try {
                const content = this._document.getText();
                if (content.trim()) {
                    rawState = JSON.parse(content);
                }
            }
            catch (error) {
                console.error('Error parsing whiteboard file:', error);
            }
        }
        else {
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
    _migrateState(rawState) {
        // Default empty state
        if (!rawState) {
            return { version: types_1.CURRENT_DATA_VERSION, blocks: [], cards: [], pinnedFiles: [], stashCards: [] };
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
            state.cards = (state.cards || []).map((card) => ({
                ...card,
                lastModified: card.lastModified || now
            }));
            state.pinnedFiles = state.pinnedFiles || [];
            state.stashCards = state.stashCards || [];
            state.version = 2;
        }
        return state;
    }
    _update() {
        this._panel.webview.html = this._getHtmlContent();
    }
    _getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whiteboard</title>
    <style>
${styles_1.whiteboardStyles}
    </style>
</head>
<body>
${template_1.whiteboardTemplate}
    <script>
${scripts_1.whiteboardScripts}
    </script>
</body>
</html>`;
    }
    dispose() {
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
exports.WhiteboardPanel = WhiteboardPanel;
WhiteboardPanel.viewType = 'whiteboardCanvas';
//# sourceMappingURL=WhiteboardPanel.js.map
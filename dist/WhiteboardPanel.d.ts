import * as vscode from 'vscode';
export declare class WhiteboardPanel {
    static currentPanel: WhiteboardPanel | undefined;
    private static readonly viewType;
    private readonly _panel;
    private readonly _context;
    private _disposables;
    private _fileWatcher;
    private _document;
    static createOrShow(context: vscode.ExtensionContext): void;
    static createFromDocument(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, document: vscode.TextDocument): WhiteboardPanel;
    private constructor();
    private _setupFileWatcher;
    private _handleFileRename;
    private _notifyFileDeleted;
    private _notifyFileChanged;
    private _openFile;
    private _browseFile;
    private _getMarkdownFiles;
    private _readCardContent;
    private _saveCardContent;
    private _readPinnedFileContent;
    private _savePinnedFileContent;
    private _getCardFolderPath;
    private _createNewCard;
    private _renameCard;
    private _moveCard;
    private _getWorkspaceFolders;
    private _saveState;
    private _loadState;
    /**
     * Migrate old data format to current version
     * This ensures backward compatibility with older whiteboard files
     */
    private _migrateState;
    private _update;
    private _getHtmlContent;
    dispose(): void;
}
//# sourceMappingURL=WhiteboardPanel.d.ts.map
import * as vscode from 'vscode';
export declare class WhiteboardPanel {
    static currentPanel: WhiteboardPanel | undefined;
    private static readonly viewType;
    private readonly _panel;
    private readonly _context;
    private _disposables;
    static createOrShow(context: vscode.ExtensionContext): void;
    private constructor();
    private _openFile;
    private _browseFile;
    private _getMarkdownFiles;
    private _saveState;
    private _loadState;
    private _update;
    private _getHtmlContent;
    dispose(): void;
}
//# sourceMappingURL=WhiteboardPanel.d.ts.map
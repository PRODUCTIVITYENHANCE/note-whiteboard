import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WhiteboardPanel } from './WhiteboardPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Whiteboard Canvas extension is now active!');

    // Register the command to open whiteboard - smart open logic
    const openCommand = vscode.commands.registerCommand('whiteboard.open', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace first');
            return;
        }

        // Find all .whiteboard.json files in workspace
        const whiteboardFiles = await vscode.workspace.findFiles('**/*.whiteboard.json', '**/node_modules/**');

        if (whiteboardFiles.length === 0) {
            // No whiteboard exists - create new one
            await vscode.commands.executeCommand('whiteboard.createNew');
        } else if (whiteboardFiles.length === 1) {
            // Only one whiteboard - open it directly
            await vscode.commands.executeCommand('vscode.openWith', whiteboardFiles[0], 'whiteboard.editor');
        } else {
            // Multiple whiteboards - let user choose
            const items = whiteboardFiles.map(uri => ({
                label: path.basename(uri.fsPath, '.whiteboard.json'),
                description: vscode.workspace.asRelativePath(uri),
                uri: uri
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a whiteboard to open'
            });

            if (selected) {
                await vscode.commands.executeCommand('vscode.openWith', selected.uri, 'whiteboard.editor');
            }
        }
    });

    // Register command to create new whiteboard file
    const createNewCommand = vscode.commands.registerCommand('whiteboard.createNew', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace first');
            return;
        }

        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter whiteboard name',
            placeHolder: 'my-whiteboard',
            validateInput: (value) => {
                if (!value) return 'Name is required';
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Only letters, numbers, - and _ allowed';
                return null;
            }
        });

        if (!fileName) return;

        const filePath = path.join(workspaceFolders[0].uri.fsPath, `${fileName}.whiteboard.json`);

        if (fs.existsSync(filePath)) {
            vscode.window.showErrorMessage(`File already exists: ${fileName}.whiteboard.json`);
            return;
        }

        // Create empty whiteboard file with version number
        const initialState = { version: 1, blocks: [], cards: [] };
        fs.writeFileSync(filePath, JSON.stringify(initialState, null, 2), 'utf-8');

        // Open the file (will trigger custom editor)
        const uri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'whiteboard.editor');
    });

    // Register command to open .whiteboard.json as text
    const openAsTextCommand = vscode.commands.registerCommand('whiteboard.openAsText', async (uri: vscode.Uri) => {
        if (uri) {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
        }
    });

    // Register custom editor provider for .whiteboard.json files
    const customEditorProvider = new WhiteboardEditorProvider(context);
    const customEditorDisposable = vscode.window.registerCustomEditorProvider(
        'whiteboard.editor',
        customEditorProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );

    context.subscriptions.push(openCommand, createNewCommand, openAsTextCommand, customEditorDisposable);
}

class WhiteboardEditorProvider implements vscode.CustomTextEditorProvider {
    constructor(private readonly context: vscode.ExtensionContext) { }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Use the WhiteboardPanel but with file-based storage
        WhiteboardPanel.createFromDocument(this.context, webviewPanel, document);
    }
}

export function deactivate() { }

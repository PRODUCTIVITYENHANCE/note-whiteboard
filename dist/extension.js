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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const WhiteboardPanel_1 = require("./WhiteboardPanel");
function activate(context) {
    console.log('Whiteboard Canvas extension is now active!');
    // Register the command to open whiteboard (legacy - uses workspaceState)
    const openCommand = vscode.commands.registerCommand('whiteboard.open', () => {
        WhiteboardPanel_1.WhiteboardPanel.createOrShow(context);
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
                if (!value)
                    return 'Name is required';
                if (!/^[a-zA-Z0-9_-]+$/.test(value))
                    return 'Only letters, numbers, - and _ allowed';
                return null;
            }
        });
        if (!fileName)
            return;
        const filePath = path.join(workspaceFolders[0].uri.fsPath, `${fileName}.whiteboard.json`);
        if (fs.existsSync(filePath)) {
            vscode.window.showErrorMessage(`File already exists: ${fileName}.whiteboard.json`);
            return;
        }
        // Create empty whiteboard file
        const initialState = { blocks: [], cards: [] };
        fs.writeFileSync(filePath, JSON.stringify(initialState, null, 2), 'utf-8');
        // Open the file (will trigger custom editor)
        const uri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('vscode.openWith', uri, 'whiteboard.editor');
    });
    // Register command to open .whiteboard.json as text
    const openAsTextCommand = vscode.commands.registerCommand('whiteboard.openAsText', async (uri) => {
        if (uri) {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
        }
    });
    // Register custom editor provider for .whiteboard.json files
    const customEditorProvider = new WhiteboardEditorProvider(context);
    const customEditorDisposable = vscode.window.registerCustomEditorProvider('whiteboard.editor', customEditorProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    });
    context.subscriptions.push(openCommand, createNewCommand, openAsTextCommand, customEditorDisposable);
}
class WhiteboardEditorProvider {
    constructor(context) {
        this.context = context;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        // Use the WhiteboardPanel but with file-based storage
        WhiteboardPanel_1.WhiteboardPanel.createFromDocument(this.context, webviewPanel, document);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map
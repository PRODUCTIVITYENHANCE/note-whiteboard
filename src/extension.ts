import * as vscode from 'vscode';
import { WhiteboardPanel } from './WhiteboardPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Whiteboard Canvas extension is now active!');

    // Register the command to open whiteboard
    const openCommand = vscode.commands.registerCommand('whiteboard.open', () => {
        WhiteboardPanel.createOrShow(context);
    });

    context.subscriptions.push(openCommand);
}

export function deactivate() { }

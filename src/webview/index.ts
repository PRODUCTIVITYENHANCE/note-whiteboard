/**
 * Webview Entry Point
 * This file is bundled by esbuild and loaded in the webview
 */

import { MilkdownEditorManager, type MilkdownEditor } from './milkdown-editor';

// Export the Milkdown editor manager for use in the webview
export { MilkdownEditorManager, type MilkdownEditor };

// Create a global instance of the editor manager
const editorManager = new MilkdownEditorManager();

// Expose to global scope for use in inline scripts
declare global {
    interface Window {
        MilkdownEditorManager: typeof MilkdownEditorManager;
        milkdownManager: MilkdownEditorManager;
    }
}

window.MilkdownEditorManager = MilkdownEditorManager;
window.milkdownManager = editorManager;

console.log('[Milkdown] Editor manager initialized');

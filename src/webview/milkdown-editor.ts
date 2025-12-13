/**
 * Milkdown Editor Wrapper
 * Encapsulates Milkdown initialization and management for whiteboard cards
 */

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { replaceAll, getMarkdown } from '@milkdown/kit/utils';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';

export interface MilkdownEditor {
    editor: Editor;
    container: HTMLElement;
    cardId: string;
    destroy: () => void;
    getMarkdown: () => string;
    setMarkdown: (content: string) => void;
    lastContent: string; // Track last content to prevent loops
    isUpdating: boolean; // Flag to prevent update loops
}

export class MilkdownEditorManager {
    private editors: Map<string, MilkdownEditor> = new Map();
    private onChangeCallbacks: Map<string, (cardId: string, markdown: string) => void> = new Map();

    // Debounce timers for onChange callbacks
    private debounceTimers: Map<string, number> = new Map();
    private readonly DEBOUNCE_MS = 500;

    /**
     * Create a new Milkdown editor instance for a card
     */
    async createEditor(
        container: HTMLElement,
        cardId: string,
        initialContent: string = '',
        onChange?: (cardId: string, markdown: string) => void
    ): Promise<MilkdownEditor> {
        // Clean up existing editor if any
        if (this.editors.has(cardId)) {
            this.destroyEditor(cardId);
        }

        // Store onChange callback
        if (onChange) {
            this.onChangeCallbacks.set(cardId, onChange);
        }

        // Add unique class for styling
        container.classList.add('milkdown-container');

        const editor = await Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, container);
                ctx.set(defaultValueCtx, initialContent);
            })
            .config(nord)
            .use(commonmark)
            .use(gfm)
            .use(history)
            .use(listener)
            .config((ctx) => {
                const listenerManager = ctx.get(listenerCtx);
                listenerManager.markdownUpdated((ctx, markdown, prevMarkdown) => {
                    if (markdown !== prevMarkdown) {
                        const editorInstance = this.editors.get(cardId);

                        // Skip if we're in the middle of an external update
                        if (editorInstance?.isUpdating) {
                            return;
                        }

                        // Update last known content
                        if (editorInstance) {
                            editorInstance.lastContent = markdown;
                        }

                        // Debounce the onChange callback
                        const existingTimer = this.debounceTimers.get(cardId);
                        if (existingTimer) {
                            clearTimeout(existingTimer);
                        }

                        const timer = window.setTimeout(() => {
                            const callback = this.onChangeCallbacks.get(cardId);
                            if (callback) {
                                callback(cardId, markdown);
                            }
                            this.debounceTimers.delete(cardId);
                        }, this.DEBOUNCE_MS);

                        this.debounceTimers.set(cardId, timer);
                    }
                });
            })
            .create();

        const milkdownEditor: MilkdownEditor = {
            editor,
            container,
            cardId,
            destroy: () => this.destroyEditor(cardId),
            getMarkdown: () => this.getMarkdown(cardId),
            setMarkdown: (content: string) => this.setMarkdown(cardId, content),
            lastContent: initialContent,
            isUpdating: false
        };

        this.editors.set(cardId, milkdownEditor);
        console.log(`[Milkdown] Editor created for card: ${cardId}`);

        return milkdownEditor;
    }

    /**
     * Get markdown content from an editor
     */
    getMarkdown(cardId: string): string {
        const editorInstance = this.editors.get(cardId);
        if (!editorInstance) {
            console.warn(`[Milkdown] No editor found for card: ${cardId}`);
            return '';
        }

        try {
            // Use the getMarkdown utility from @milkdown/kit/utils
            return editorInstance.editor.action(getMarkdown());
        } catch (error) {
            console.error(`[Milkdown] Error getting markdown for card ${cardId}:`, error);
            return editorInstance.lastContent || '';
        }
    }

    /**
     * Set markdown content for an editor (without recreating)
     */
    async setMarkdown(cardId: string, content: string): Promise<void> {
        const editorInstance = this.editors.get(cardId);
        if (!editorInstance) {
            console.warn(`[Milkdown] No editor found for card: ${cardId}`);
            return;
        }

        // Skip if content is the same
        if (editorInstance.lastContent === content) {
            console.log(`[Milkdown] Skipping update, content unchanged for card: ${cardId}`);
            return;
        }

        try {
            // Set flag to prevent onChange from firing during update
            editorInstance.isUpdating = true;

            // Use replaceAll to update content without recreating editor
            editorInstance.editor.action(replaceAll(content));

            // Update last known content
            editorInstance.lastContent = content;

            console.log(`[Milkdown] Content updated for card: ${cardId}`);
        } catch (error) {
            console.error(`[Milkdown] Error setting markdown for card ${cardId}:`, error);
        } finally {
            // Reset flag after a short delay to allow for internal updates
            setTimeout(() => {
                if (editorInstance) {
                    editorInstance.isUpdating = false;
                }
            }, 100);
        }
    }

    /**
     * Destroy an editor instance
     */
    destroyEditor(cardId: string): void {
        const editorInstance = this.editors.get(cardId);
        if (editorInstance) {
            try {
                // Cancel any pending debounce timer
                const timer = this.debounceTimers.get(cardId);
                if (timer) {
                    clearTimeout(timer);
                    this.debounceTimers.delete(cardId);
                }

                editorInstance.editor.destroy();
                editorInstance.container.innerHTML = '';
                editorInstance.container.classList.remove('milkdown-container');
            } catch (error) {
                console.error(`[Milkdown] Error destroying editor for card ${cardId}:`, error);
            }
            this.editors.delete(cardId);
            this.onChangeCallbacks.delete(cardId);
            console.log(`[Milkdown] Editor destroyed for card: ${cardId}`);
        }
    }

    /**
     * Destroy all editors
     */
    destroyAll(): void {
        for (const cardId of this.editors.keys()) {
            this.destroyEditor(cardId);
        }
    }

    /**
     * Check if an editor exists for a card
     */
    hasEditor(cardId: string): boolean {
        return this.editors.has(cardId);
    }

    /**
     * Get an editor instance
     */
    getEditor(cardId: string): MilkdownEditor | undefined {
        return this.editors.get(cardId);
    }

    /**
     * Focus an editor
     */
    focusEditor(cardId: string): void {
        const editorInstance = this.editors.get(cardId);
        if (editorInstance) {
            try {
                const view = editorInstance.editor.ctx.get(editorViewCtx);
                view.focus();
            } catch (error) {
                console.error(`[Milkdown] Error focusing editor for card ${cardId}:`, error);
            }
        }
    }

    /**
     * Check if editor is currently focused
     */
    isFocused(cardId: string): boolean {
        const editorInstance = this.editors.get(cardId);
        if (!editorInstance) return false;

        try {
            const view = editorInstance.editor.ctx.get(editorViewCtx);
            return view.hasFocus();
        } catch {
            return false;
        }
    }
}

// Data format version - increment when making breaking changes to the data structure
// v2: Added lastModified to cards, pinnedFiles, stashCards for sidebar features
export const CURRENT_DATA_VERSION = 2;

export interface Block {
    id: string;
    x: number;
    y: number;
    color: string;
    text: string;
    linkedFile: string | null;
}

export interface Card {
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

export interface StashCard {
    id: string;
    filePath: string;
    color?: string;
    lastModified: number;
    // Original position before stashing (for restore button)
    originalX: number;
    originalY: number;
    originalWidth: number;
    originalHeight: number;
}

export interface WhiteboardState {
    version: number;
    blocks: Block[];
    cards: Card[];
    pinnedFiles?: string[];   // Pinned files for sidebar Tab 1
    stashCards?: StashCard[]; // Stashed cards for sidebar Tab 3
}

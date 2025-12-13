export declare const CURRENT_DATA_VERSION = 2;
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
    lastModified?: number;
    collapsed?: boolean;
}
export interface StashCard {
    id: string;
    filePath: string;
    color?: string;
    lastModified: number;
}
export interface WhiteboardState {
    version: number;
    blocks: Block[];
    cards: Card[];
    pinnedFiles?: string[];
    stashCards?: StashCard[];
}
//# sourceMappingURL=types.d.ts.map
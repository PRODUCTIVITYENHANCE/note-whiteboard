#!/usr/bin/env python3
"""
Script to refactor WhiteboardPanel.ts by replacing _getHtmlContent with modular imports.
"""

import re

# Read the original file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/WhiteboardPanel.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Update imports - replace old import section with new one
old_imports = """import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Data format version - increment when making breaking changes to the data structure
// v2: Added lastModified to cards, pinnedFiles, stashCards for sidebar features
const CURRENT_DATA_VERSION = 2;

interface Block {
    id: string;
    x: number;
    y: number;
    color: string;
    text: string;
    linkedFile: string | null;
}

interface Card {
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

interface StashCard {
    id: string;
    filePath: string;
    color?: string;
    lastModified: number;
}

interface WhiteboardState {
    version: number;
    blocks: Block[];
    cards: Card[];
    pinnedFiles?: string[];   // Pinned files for sidebar Tab 1
    stashCards?: StashCard[]; // Stashed cards for sidebar Tab 3
}"""

new_imports = """import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Block, Card, StashCard, WhiteboardState, CURRENT_DATA_VERSION } from './types';
import { whiteboardStyles } from './webview/styles';
import { whiteboardTemplate } from './webview/template';
import { whiteboardScripts } from './webview/scripts';"""

content = content.replace(old_imports, new_imports)

# Step 2: Find and replace the _getHtmlContent method
# Find the start of the method
method_start_pattern = r"(    private _getHtmlContent\(\): string \{\s*return `)<!DOCTYPE html>"
method_start_match = re.search(method_start_pattern, content)

if not method_start_match:
    print("Could not find _getHtmlContent start")
    exit(1)

# Find the end of the method (</html>`;})
method_end_pattern = r"</html>`;\s*\}\s*\n\s*public dispose\(\)"
method_end_match = re.search(method_end_pattern, content)

if not method_end_match:
    print("Could not find _getHtmlContent end")
    exit(1)

# Create the new method content
new_method = """    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Whiteboard</title>
    <style>
$\{whiteboardStyles}
    </style>
</head>
<body>
$\{whiteboardTemplate}
    <script>
$\{whiteboardScripts}
    </script>
</body>
</html>`;
    }

    public dispose()"""

# Replace the entire method
start_idx = method_start_match.start()
end_idx = method_end_match.end()

new_content = content[:start_idx] + new_method + content[end_idx:]

# Write the modified file
with open('/Users/panmacbookpro/Desktop/vscodecanva/src/WhiteboardPanel.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Original file size: {len(content)} bytes")
print(f"New file size: {len(new_content)} bytes")
print(f"Reduced by: {len(content) - len(new_content)} bytes")
print("WhiteboardPanel.ts has been refactored successfully!")

// Whiteboard Canvas CSS Styles
// Auto-extracted from WhiteboardPanel.ts

export const whiteboardStyles = `
* {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        .icon {
            width: 18px;
            height: 18px;
            stroke-width: 2;
        }

        .icon-sm {
            width: 14px;
            height: 14px;
        }

        .icon-lg {
            width: 20px;
            height: 20px;
        }

        body {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #000000;
        }

        #toolbar {
            position: fixed;
            top: 16px;
            left: 16px;
            display: flex;
            gap: 8px;
            z-index: 1000;
        }

        .toolbar-btn {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #ccc;
        }

        .toolbar-btn:hover {
            background: #2a2a2a;
            transform: scale(1.05);
            color: white;
        }

        #zoom-controls {
            position: fixed;
            bottom: 16px;
            right: 16px;
            display: flex;
            gap: 8px;
            z-index: 1000;
        }

        .zoom-btn {
            width: 36px;
            height: 36px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 18px;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #fff;
            transition: all 0.2s ease;
        }

        .zoom-btn:hover {
            background: #2a2a2a;
        }

        .zoom-level {
            padding: 0 12px;
            display: flex;
            align-items: center;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            color: #888;
            font-size: 12px;
            min-width: 60px;
            justify-content: center;
        }

        #canvas-container {
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden; /* Changed from auto to hidden to handle custom pan/zoom better */
            cursor: grab;
        }

        #canvas-container:active {
            cursor: grabbing;
        }

        #whiteboard {
            width: 8000px;
            height: 6000px;
            position: relative;
            /* Dot grid pattern - lighter and more performant */
            background-image: radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px);
            background-size: 24px 24px;
            transform-origin: 0 0;
            will-change: transform;
        }

        .block {
            position: absolute;
            width: 150px;
            height: 75px;
            border-radius: 14px;
            cursor: move;
            user-select: none;
            transition: box-shadow 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 14px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
            will-change: transform;
        }

        .block:hover {
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
            z-index: 10;
        }

        .block.dragging {
            opacity: 0.9;
            z-index: 1000;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            transform: scale(1.02);
        }

        .block.linked {
            cursor: pointer;
        }

        .block-content {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 15px;
            font-weight: 600;
            pointer-events: none; /* Allows click through to block for dragging */
            word-break: break-word;
            line-height: 1.3;
        }

        .block.linked .block-content {
            text-decoration: underline;
            text-decoration-thickness: 2px;
            text-underline-offset: 4px;
            pointer-events: auto;
            cursor: pointer;
            /* Only take up text space, not full block */
            width: auto;
            height: auto;
            max-width: 90%;
            padding: 4px 8px;
            border-radius: 4px;
        }

        .block.linked .block-content:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .block-input {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.2);
            border: none;
            border-radius: 14px;
            color: white;
            font-size: 15px;
            font-weight: 600;
            text-align: center;
            outline: none;
            resize: none;
            font-family: inherit;
            padding: 22px 14px;
            display: none;
            line-height: 1.3;
        }

        .block.editing .block-content {
            display: none;
        }

        .block.editing .block-input {
            display: block;
        }

        /* Context Menu */
        .context-menu {
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 8px;
            z-index: 2000;
            display: none;
            min-width: 200px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .context-menu.active {
            display: block;
            animation: fadeIn 0.1s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }

        .context-menu-section {
            padding: 8px 0;
        }

        .context-menu-section + .context-menu-section {
            border-top: 1px solid #333;
            margin-top: 8px;
        }

        .context-menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .reset-color-icon {
            cursor: pointer;
            color: #666;
            margin-right: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s ease;
        }

        .reset-color-icon:hover {
            color: #ccc;
        }

        .context-menu-label {
            font-size: 11px;
            color: #666;
            padding: 4px 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }

        .context-menu-item {
            padding: 10px 12px;
            cursor: pointer;
            color: #ccc;
            font-size: 14px;
            border-radius: 6px;
            transition: all 0.1s ease;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .context-menu-item:hover {
            background: #2a2a2a;
            color: #fff;
        }

        .context-menu-item.danger:hover {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .color-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            padding: 8px;
        }

        .color-option {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .color-option:hover {
            transform: scale(1.15);
            border-color: rgba(255, 255, 255, 0.5);
            z-index: 10;
        }

        .color-option.active {
            border-color: #ffffff;
            border-width: 2px;
            box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
        }

        /* Modal */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .modal-overlay.active {
            display: flex;
            opacity: 1;
        }

        .modal {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 16px;
            padding: 24px;
            width: 90%;
            max-width: 500px;
            max-height: 70vh;
            overflow-y: auto;
            transform: scale(0.95);
            transition: transform 0.2s ease;
        }

        .modal-overlay.active .modal {
            transform: scale(1);
        }

        .modal h3 {
            margin-bottom: 20px;
            color: #fff;
            font-size: 18px;
            font-weight: 600;
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
        }

        .file-item {
            padding: 14px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #ccc;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-item::before {
            content: '';
            width: 16px;
            height: 16px;
            background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E") no-repeat center;
        }

        .file-item:hover, .file-item.selected {
            background: #2a2a2a;
            border-color: #555;
            color: #fff;
            transform: translateX(4px);
        }

        .file-search-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #0a0a0a;
            color: #fff;
            font-size: 14px;
            outline: none;
            margin-bottom: 12px;
        }

        .file-search-input:focus {
            border-color: #667eea;
        }

        .file-list-container {
            display: flex;
            flex-direction: column;
            max-height: 400px;
        }

        /* Folder tree styles */
        .folder-tree {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .folder-tree-item {
            display: flex;
            flex-direction: column;
        }

        .folder-tree-row {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #ccc;
            transition: all 0.2s ease;
            gap: 8px;
        }

        .folder-tree-row:hover {
            background: #2a2a2a;
            border-color: #555;
            color: #fff;
        }

        .folder-tree-row.selected {
            background: #2a2a2a;
            border-color: #667eea;
            color: #fff;
        }

        .folder-toggle {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.15s ease;
            flex-shrink: 0;
        }

        .folder-toggle svg {
            width: 12px;
            height: 12px;
            stroke: #888;
            transition: stroke 0.2s ease;
        }

        .folder-toggle:hover svg {
            stroke: #fff;
        }

        .folder-toggle.expanded {
            transform: rotate(90deg);
        }

        .folder-toggle.hidden {
            visibility: hidden;
        }

        .folder-icon {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }

        .folder-icon svg {
            width: 16px;
            height: 16px;
            stroke: #888;
        }

        .folder-tree-row:hover .folder-icon svg {
            stroke: #f59e0b;
        }

        .folder-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .folder-children {
            margin-left: 20px;
            padding-left: 8px;
            border-left: 1px solid #333;
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-top: 2px;
            overflow: hidden;
        }

        .folder-children.collapsed {
            display: none;
        }

        /* Root folder special style */
        .folder-tree-row.root-folder {
            background: linear-gradient(135deg, #1a1a2e 0%, #0a0a0a 100%);
            border-color: #444;
        }

        .folder-tree-row.root-folder:hover {
            border-color: #667eea;
        }

        .new-file-item {
            padding: 14px;
            background: #1a1a2e;
            border: 1px dashed #667eea;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #667eea;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            flex-shrink: 0;
        }

        .new-file-item:hover, .new-file-item.selected {
            background: #252540;
            border-color: #8b9ff5;
            color: #8b9ff5;
        }

        .no-results {
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }

        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }

        .modal-btn {
            flex: 1;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #2a2a2a;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .modal-btn:hover {
            background: #333;
            border-color: #555;
        }

        .modal-input {
            width: 100%;
            padding: 12px;
            border: 1px solid #333;
            border-radius: 8px;
            background: #0a0a0a;
            color: #fff;
            font-size: 14px;
            outline: none;
            margin-bottom: 16px;
        }

        .modal-input:focus {
            border-color: #667eea;
        }

        /* Card Styles */
        .card {
            position: absolute;
            min-width: 250px;
            min-height: 150px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            will-change: transform;
        }

        .card:hover {
            box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            border-color: #444;
        }

        .card.dragging {
            opacity: 0.9;
            z-index: 1000;
        }

        .card.external-change {
            border-color: #f5a623;
            animation: pulse-border 1.5s ease-in-out infinite;
        }

        @keyframes pulse-border {
            0%, 100% { border-color: #f5a623; }
            50% { border-color: #ffd700; box-shadow: 0 0 12px rgba(245, 166, 35, 0.5); }
        }

        .card-header {
            padding: 10px 14px;
            background: #252525;
            border-bottom: 1px solid #333;
            cursor: move;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #888;
        }

        .card-header .filename {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 200px;
        }

        .card-content {
            flex: 1;
            padding: 12px;
            overflow: auto;
        }

        .card-textarea {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            outline: none;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            overflow-y: auto;
        }

        /* Custom scrollbar for card textarea */
        .card-textarea::-webkit-scrollbar {
            width: 6px;
        }

        .card-textarea::-webkit-scrollbar-track {
            background: transparent;
        }

        .card-textarea::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 3px;
        }

        .card-textarea::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        /* Card resize handles - 8 directions */
        .card-resize-handle {
            position: absolute;
            background: transparent;
            z-index: 10;
        }

        /* Corner handles */
        .card-resize-handle.nw { top: -4px; left: -4px; width: 12px; height: 12px; cursor: nw-resize; }
        .card-resize-handle.ne { top: -4px; right: -4px; width: 12px; height: 12px; cursor: ne-resize; }
        .card-resize-handle.sw { bottom: -4px; left: -4px; width: 12px; height: 12px; cursor: sw-resize; }
        .card-resize-handle.se { bottom: -4px; right: -4px; width: 12px; height: 12px; cursor: se-resize; }

        /* Edge handles */
        .card-resize-handle.n { top: -4px; left: 12px; right: 12px; height: 8px; cursor: n-resize; }
        .card-resize-handle.s { bottom: -4px; left: 12px; right: 12px; height: 8px; cursor: s-resize; }
        .card-resize-handle.w { left: -4px; top: 12px; bottom: 12px; width: 8px; cursor: w-resize; }
        .card-resize-handle.e { right: -4px; top: 12px; bottom: 12px; width: 8px; cursor: e-resize; }

        /* Visual indicator on hover/resize */
        .card:hover .card-resize-handle.se::after {
            content: '';
            position: absolute;
            right: 2px;
            bottom: 2px;
            width: 8px;
            height: 8px;
            background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%);
            border-radius: 0 0 8px 0;
        }


        /* Collapse toggle button */
        .card-collapse-toggle {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s ease;
            flex-shrink: 0;
        }

        .card-collapse-toggle::before {
            content: '';
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid #888;
            transition: transform 0.2s ease;
        }

        .card-collapse-toggle:hover::before {
            border-top-color: #fff;
        }

        /* Collapsed state */
        .card.collapsed .card-collapse-toggle::before {
            transform: rotate(-90deg);
        }

        .card.collapsed .card-content {
            display: none;
        }

        .card.collapsed .card-resize-handle {
            display: none;
        }

        .card.collapsed {
            height: auto !important;
            min-height: auto;
        }

        .card.collapsed .card-header {
            border-bottom: none;
            border-radius: 12px;
        }

        /* Disconnected card state */
        .card.disconnected .card-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .card.disconnected .card-textarea {
            display: none;
        }

        .disconnected-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            height: 100%;
        }

        .disconnected-message {
            color: #888;
            font-size: 14px;
            text-align: center;
        }

        .refresh-btn {
            padding: 8px 16px;
            background: #333;
            border: 1px solid #444;
            border-radius: 6px;
            color: #ccc;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .refresh-btn:hover {
            background: #444;
            color: #fff;
            border-color: #555;
        }

        /* Canvas Context Menu */
        .canvas-context-menu {
            position: fixed;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 12px;
            padding: 8px;
            z-index: 2000;
            display: none;
            min-width: 180px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        }

        .canvas-context-menu.active {
            display: block;
            animation: fadeIn 0.1s ease-out;
        }

        /* Drop Zone */
        .drop-indicator {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(102, 126, 234, 0.1);
            border: 3px dashed #667eea;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999;
            pointer-events: none;
        }

        .drop-indicator.active {
            display: flex;
        }

        .drop-indicator span {
            background: #667eea;
            color: white;
            padding: 16px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
        }

        /* Selection Box */
        .selection-box {
            position: absolute;
            border: 2px dashed #22d3ee;
            background: rgba(34, 211, 238, 0.1);
            pointer-events: none;
            z-index: 999;
        }

        /* Selected state for blocks and cards - unified white outline */
        .block.selected,
        .card.selected {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        /* Editing state - also white outline for consistency */
        .block.editing {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        .card.editing {
            outline: 2px solid white;
            outline-offset: 2px;
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2), 0 12px 32px rgba(0, 0, 0, 0.5);
        }

        /* ========== Sidebar Styles (Figma-style floating panel) ========== */
        #sidebar {
            position: fixed;
            left: 16px;
            top: 16px;
            width: 260px;
            height: calc(100vh - 32px);
            min-height: 400px;
            max-height: calc(100vh - 32px);
            background: rgba(26, 26, 26, 0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid #333;
            border-radius: 16px;
            z-index: 1001;
            display: flex;
            flex-direction: column;
            transform: translateX(calc(-100% - 32px));
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
            overflow: hidden;
        }

        #sidebar.open {
            transform: translateX(0);
        }

        /* Sidebar resize handle */
        .sidebar-resize-handle {
            position: absolute;
            right: 0;
            top: 0;
            width: 6px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
            transition: background 0.2s ease;
            z-index: 10;
            border-radius: 0 16px 16px 0;
        }

        .sidebar-resize-handle:hover,
        .sidebar-resize-handle.resizing {
            background: rgba(102, 126, 234, 0.5);
        }

        .sidebar-header {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #333;
            gap: 8px;
            border-radius: 16px 16px 0 0;
        }

        .sidebar-tabs {
            display: flex;
            flex: 1;
            gap: 4px;
            background: rgba(0, 0, 0, 0.3);
            padding: 4px;
            border-radius: 8px;
        }

        .sidebar-tab {
            flex: 1;
            padding: 8px 12px;
            background: transparent;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            color: #888;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .sidebar-tab:hover {
            color: #ccc;
        }

        .sidebar-tab.active {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .sidebar-tab svg {
            width: 18px;
            height: 18px;
        }

        .sidebar-close {
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .sidebar-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 0;
        }

        .sidebar-panel {
            display: none;
            height: 100%;
        }

        .sidebar-panel.active {
            display: flex;
            flex-direction: column;
        }

        /* Tab 2 needs padding */
        #panelCards {
            padding: 12px;
        }
        
        /* Tab 3: Stash - Consistent padding */
        #panelStash {
            padding: 12px;
            display: flex;
            flex-direction: column;
        }
        
        /* When panel has items, we still use the same padding */
        #panelStash.has-items {
            padding: 12px;
        }


        /* Tab 1: Pinned Files */
        .pinned-files-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
            color: #666;
            flex: 1;
        }

        .pinned-files-empty svg {
            width: 48px;
            height: 48px;
            margin-bottom: 16px;
            stroke: #444;
        }

        .select-file-btn {
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #ccc;
            cursor: pointer;
            font-size: 13px;
            margin-top: 16px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: fit-content;
        }

        .select-file-btn svg {
            width: 14px;
            height: 14px;
            stroke-width: 2.5; /* Slightly thicker for better visibility at small size */
        }

        .select-file-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        /* Pinned file viewer - full width, full height */
        .pinned-file-viewer {
            display: flex;
            flex-direction: column;
            flex: 1;
            background: transparent;
            border: none;
            border-radius: 0;
            overflow: hidden;
        }

        .pinned-file-header {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: transparent;
            border-bottom: 1px solid #333;
            gap: 8px;
            flex-shrink: 0;
        }

        .pinned-file-header .filename {
            flex: 1;
            font-size: 13px;
            color: #ccc;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .pinned-file-actions {
            display: flex;
            gap: 4px;
        }

        .pinned-file-actions button {
            width: 24px;
            height: 24px;
            background: transparent;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .pinned-file-actions button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .pinned-file-content {
            flex: 1;
            padding: 0;
            overflow-y: auto;
        }

        .pinned-file-textarea {
            width: 100%;
            height: 100%;
            min-height: 100%;
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 13px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            line-height: 1.6;
            resize: none;
            outline: none;
            padding: 12px;
            box-sizing: border-box;
        }


        /* Tab 2: Card List */
        .card-list-controls {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 12px;
            flex-shrink: 0;
        }

        .color-filter-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Color swatch horizontal scroll */
        .color-filter-grid {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 4px 0;
            scrollbar-width: thin;
            scrollbar-color: #444 transparent;
        }

        .color-filter-grid::-webkit-scrollbar {
            height: 4px;
        }

        .color-filter-grid::-webkit-scrollbar-track {
            background: transparent;
        }

        .color-filter-grid::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 2px;
        }

        .color-filter-option {
            width: 28px;
            height: 28px;
            min-width: 28px;
            border-radius: 6px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: all 0.15s ease;
            flex-shrink: 0;
        }

        .color-filter-option:hover {
            transform: scale(1.1);
            border-color: rgba(255, 255, 255, 0.4);
        }

        .color-filter-option.active {
            border-color: #fff;
            box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
        }

        .color-filter-option.all-colors {
            background: #1a1a1a;
            border: 1px solid #444;
        }


        .card-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
            overflow-y: auto;
        }


        .card-list-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid #333;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            gap: 10px;
        }

        .card-list-item:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: #444;
        }


        .card-list-item .color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .card-list-item .card-info {
            flex: 1;
            min-width: 0;
        }

        .card-list-item .card-name {
            font-size: 14px;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .card-list-item .card-time {
            font-size: 11px;
            color: #666;
        }

        .card-list-empty {
            text-align: center;
            padding: 40px 20px;
            color: #666;
        }

        /* Tab 3: Stash */
        .stash-header {
            display: flex;
            padding: 0 0 8px 0; /* Add bottom spacing to match list gap */
            border-bottom: none;
            flex-shrink: 0;
            width: 100%;
        }
        
        .stash-add-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px;
            background: rgba(102, 126, 234, 0.08); /* Slightly more subtle */
            border: 1px dashed rgba(102, 126, 234, 0.4);
            border-radius: 8px;
            color: #8b9ff5;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .stash-add-btn:hover {
            background: rgba(102, 126, 234, 0.15);
            border-color: #667eea;
            color: #fff;
        }
        
        .stash-add-btn svg {
            width: 16px;
            height: 16px;
        }

        .stash-dropzone {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 2px dashed rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            margin: 0 0 12px 0; /* Remove side margin as parent now has padding */
            text-align: center;
            color: #666;
            transition: all 0.2s ease;
            min-height: 150px;
        }
        
        /* Hide dropzone when stash has items */
        .stash-dropzone.hidden {
            display: none;
        }

        .stash-dropzone.drag-over {
            border-color: #667eea;
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .stash-dropzone svg {
            width: 28px;
            height: 28px;
            margin-bottom: 6px;
        }

        .stash-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex: 1;
            overflow-y: auto;
        }

        .stash-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid #333;
            border-radius: 8px;
            gap: 10px;
            transition: all 0.2s ease;
            cursor: grab;
        }

        .stash-item:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: #444;
        }
        
        .stash-item.dragging {
            opacity: 0.5;
            cursor: grabbing;
        }


        .stash-item .color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .stash-item .stash-info {
            flex: 1;
            min-width: 0;
        }

        .stash-item .stash-name {
            font-size: 14px;
            color: #fff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .stash-item-actions {
            display: flex;
            gap: 4px;
        }

        .stash-item-actions button {
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            color: #888;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        }

        .stash-item-actions button:hover {
            background: #333;
            color: #fff;
        }

        .stash-item-actions button.restore:hover {
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
        }

        .stash-item-actions button.delete:hover {
            background: rgba(239, 68, 68, 0.2);
            color: #ef4444;
        }

        .stash-empty {
            display: none;
        }

        /* Sidebar is now overlay, no need to adjust toolbar or canvas */
`;

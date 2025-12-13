// Whiteboard Canvas Frontend JavaScript
// Auto-extracted from WhiteboardPanel.ts

export const whiteboardScripts = `
const vscode = acquireVsCodeApi();
        const whiteboard = document.getElementById('whiteboard');
        const canvasContainer = document.getElementById('canvas-container');
        const contextMenu = document.getElementById('contextMenu');
        const canvasContextMenu = document.getElementById('canvasContextMenu');
        const fileModal = document.getElementById('fileModal');
        const fileList = document.getElementById('fileList');
        const colorGrid = document.getElementById('colorGrid');
        const newCardModal = document.getElementById('newCardModal');
        const dropIndicator = document.getElementById('dropIndicator');
        const resetColorBtn = document.getElementById('resetColorBtn');
        const renameCardModal = document.getElementById('renameCardModal');
        const moveCardModal = document.getElementById('moveCardModal');
        const folderList = document.getElementById('folderList');
        
        let blocks = [];
        let cards = [];
        let selectedBlockId = null;
        let contextBlockId = null;
        let contextCardId = null;
        let draggedBlock = null;
        let draggedCard = null;
        let resizingCard = null;
        let dragOffset = { x: 0, y: 0 };
        let zoomLevel = 1;
        let panOffset = { x: 0, y: 0 };
        let pendingCardPosition = { x: 0, y: 0 };

        // Multi-selection state
        let selectedBlocks = new Set();
        let selectedCards = new Set();
        let isSelecting = false;
        let selectionStart = { x: 0, y: 0 };
        let selectionBox = null;
        let isMultiDragging = false;
        let multiDragStart = { x: 0, y: 0 };
        let initialPositions = new Map();

        // ========== Save Optimization ==========
        // Debounce: delay save until user stops making changes (500ms)
        // Dirty Flag: only save if there are actual changes
        // Version tracking: use a simple counter instead of JSON.stringify for comparison
        let saveTimeoutId = null;
        let isDirty = false;
        let stateVersion = 0;        // Incremented when state changes
        let lastSavedVersion = 0;    // Track last saved version
        const SAVE_DEBOUNCE_MS = 500;
        // ========================================

        // ========== Rename/Move State ==========
        let renameTargetCardId = null;
        let renameTargetPath = null;
        let moveTargetCardId = null;
        let moveTargetPath = null;
        let allWorkspaceFolders = [];
        let filteredFolders = [];
        let selectedFolderIndex = -1; // -1 means nothing selected (focus on search input)
        let flatFolderList = []; // Flattened list of visible folders for keyboard navigation
        // ========================================

        // ========== Sidebar State ==========
        const sidebar = document.getElementById('sidebar');
        const toolbar = document.getElementById('toolbar');
        const toggleSidebarBtn = document.getElementById('toggleSidebar');
        const closeSidebarBtn = document.getElementById('closeSidebar');
        const tabPinned = document.getElementById('tabPinned');
        const tabCards = document.getElementById('tabCards');
        const tabStash = document.getElementById('tabStash');
        const panelPinned = document.getElementById('panelPinned');
        const panelCards = document.getElementById('panelCards');
        const panelStash = document.getElementById('panelStash');
        const pinnedEmpty = document.getElementById('pinnedEmpty');
        const pinnedFileViewer = document.getElementById('pinnedFileViewer');
        const selectPinnedFileBtn = document.getElementById('selectPinnedFile');
        const cardListElem = document.getElementById('cardList');
        const cardListEmpty = document.getElementById('cardListEmpty');
        const colorFilterGrid = document.getElementById('colorFilterGrid');
        const stashDropzone = document.getElementById('stashDropzone');
        const stashListElem = document.getElementById('stashList');
        const stashEmpty = document.getElementById('stashEmpty');
        
        let pinnedFiles = [];
        let stashCards = [];
        let currentPinnedFile = null;
        let pinnedFileContent = '';
        let sidebarOpen = false;
        let currentColorFilter = '';
        let cardBeingDraggedToStash = null;
        let topZIndex = 10; // Track the highest z-index for bringing cards to front
        
        // Drag optimization: cache dropzone rect to avoid repeated DOM queries
        let cachedDropzoneRect = null;
        let isOverDropzone = false;
        
        // ========== RAF Optimization ==========
        // Use requestAnimationFrame for smooth DOM updates
        let rafId = null;
        let pendingPanUpdate = false;
        let pendingDragUpdate = false;
        let pendingMultiDragUpdate = false;
        // ======================================

        // ========== Undo/Redo State ==========
        // Tracks position changes for blocks and cards
        // Each action is: { type: 'move'|'multiMove', items: [{ id, type: 'block'|'card', before: {x,y}, after: {x,y} }] }
        let undoStack = [];
        let redoStack = [];
        const MAX_UNDO_HISTORY = 50;
        
        // Temporary storage for positions before drag starts
        let dragStartPositions = new Map();
        // ======================================

        // Helper to mix color with base for opaque result
        function mixWithBase(color, baseColor, alpha) {
            const h2d = (h) => parseInt(h, 16);
            const r1 = h2d(color.slice(1, 3));
            const g1 = h2d(color.slice(3, 5));
            const b1 = h2d(color.slice(5, 7));
            
            const r2 = h2d(baseColor.slice(1, 3));
            const g2 = h2d(baseColor.slice(3, 5));
            const b2 = h2d(baseColor.slice(5, 7));
            
            const r = Math.round(r1 * alpha + r2 * (1 - alpha));
            const g = Math.round(g1 * alpha + g2 * (1 - alpha));
            const b = Math.round(b1 * alpha + b2 * (1 - alpha));
            
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }

        const CARD_BASE_COLOR = '#1a1a1a';

        // Colors palette - 8 deep colors for white text visibility
        const colors = [
            '#2563eb', // 藍 Blue
            '#dc2626', // 紅 Red
            '#ea580c', // 橘 Orange
            '#16a34a', // 綠 Green
            '#4b5563', // 深灰 Dark Gray
            '#7c3aed', // 紫 Purple
            '#db2777', // 粉 Pink
            '#92400e'  // 咖 Brown
        ];

        // Initialize color grid
        colors.forEach(color => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-option';
            colorDiv.style.background = color;
            colorDiv.dataset.color = color;
            colorDiv.addEventListener('click', () => changeBlockColor(color));
            colorGrid.appendChild(colorDiv);
        });

        if (resetColorBtn) {
            resetColorBtn.addEventListener('click', () => changeBlockColor(null));
        }

        function generateId() {
            return 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        function createBlockElement(block) {
            const div = document.createElement('div');
            div.className = 'block' + (block.linkedFile ? ' linked' : '');
            div.id = block.id;
            div.style.transform = 'translate(' + block.x + 'px, ' + block.y + 'px)';
            div.style.background = block.color;

            // Display Content (Div)
            const contentDiv = document.createElement('div');
            contentDiv.className = 'block-content';
            contentDiv.textContent = block.text;
            div.appendChild(contentDiv);

            // Editable Input (Textarea)
            const textarea = document.createElement('textarea');
            textarea.className = 'block-input';
            textarea.value = block.text;
            textarea.placeholder = 'Type here...';
            div.appendChild(textarea);
            
            // Events for Input (debounced to avoid performance issues)
            let blockSaveTimeout;
            textarea.addEventListener('input', (e) => {
                block.text = e.target.value;
                contentDiv.textContent = block.text; // sync content
                // Debounce saveState to avoid frequent saves during typing
                clearTimeout(blockSaveTimeout);
                blockSaveTimeout = setTimeout(() => {
                    saveState();
                }, 500);
            });

            textarea.addEventListener('blur', () => {
                div.classList.remove('editing');
            });

            textarea.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevent drag when editing

            // Double click to edit
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation(); // Prevent canvas double click
                e.preventDefault();
                div.classList.add('editing');
                setTimeout(() => textarea.focus(), 0);
            });

            // Click on text content to open linked file (only text area, not surrounding space)
            // Cmd+click (Mac) or Ctrl+click (Win): open file in main view
            // Option+click (Mac) or Alt+click (Win): open file in split view
            // Cmd+Option+click: also open in split view
            contentDiv.addEventListener('click', (e) => {
                if (div.classList.contains('editing')) return;
                
                // If it was a drag release, don't open file
                if (draggedBlock) return;

                if (block.linkedFile) {
                    // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                    if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    const splitView = e.altKey;
                    vscode.postMessage({ command: 'openFile', filePath: block.linkedFile, splitView: splitView });
                }
            });

            // Dragging (MouseDown on the whole block)
            div.addEventListener('mousedown', (e) => {
                if (div.classList.contains('editing')) return; // Don't drag if editing
                if (e.button !== 0) return; // Only Left Click
                
                // Check if this block is part of a multi-selection
                if (isBlockSelected(block.id)) {
                    // Start multi-drag if clicking on an already selected block
                    e.stopPropagation();
                    startMultiDrag(e);
                } else if (e.shiftKey) {
                    // Shift+click to add to selection
                    e.stopPropagation();
                    toggleBlockSelection(block.id, true);
                } else {
                    // Normal click - select this item and start single drag
                    clearSelection();
                    selectedBlocks.add(block.id);
                    div.classList.add('selected');
                    startDrag(e, div, block);
                }
            });

            // Context menu
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, block.id);
            });

            return div;
        }

        function startDrag(e, element, block) {
            draggedBlock = { element, block };
            element.classList.add('dragging');
            
            // Record position for undo
            recordDragStartPositions([block.id], 'block');
            
            // Bring block to front by incrementing z-index
            topZIndex++;
            element.style.zIndex = topZIndex;
            
            const rect = element.getBoundingClientRect();
            dragOffset = {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };

            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        }

        // Pending block drag state for RAF optimization
        let pendingBlockDragX = 0;
        let pendingBlockDragY = 0;
        let pendingBlockDragUpdate = false;
        
        function onDrag(e) {
            if (!draggedBlock) return;
            e.preventDefault(); // Prevent text selection

            const pos = screenToWhiteboard(e.clientX, e.clientY);
            pendingBlockDragX = pos.x - dragOffset.x;
            pendingBlockDragY = pos.y - dragOffset.y;

            // Update data model immediately
            draggedBlock.block.x = pendingBlockDragX;
            draggedBlock.block.y = pendingBlockDragY;
            
            // Use RAF for DOM update
            if (!pendingBlockDragUpdate) {
                pendingBlockDragUpdate = true;
                requestAnimationFrame(() => {
                    if (draggedBlock) {
                        draggedBlock.element.style.transform = 'translate(' + pendingBlockDragX + 'px, ' + pendingBlockDragY + 'px)';
                    }
                    pendingBlockDragUpdate = false;
                });
            }
        }

        function stopDrag() {
            if (draggedBlock) {
                draggedBlock.element.classList.remove('dragging');
                // Record undo action before clearing reference
                recordDragEndAction();
                draggedBlock = null;
                saveState();
            }
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        }

        function addBlock(x, y) {
            // Default center if no coords - use whiteboard center
            const centerPos = screenToWhiteboard(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
            const startX = x !== undefined ? x : centerPos.x - 100;
            const startY = y !== undefined ? y : centerPos.y - 50;

            const block = {
                id: generateId(),
                x: startX,
                y: startY,
                color: colors[Math.floor(Math.random() * colors.length)],
                text: 'New Block',
                linkedFile: null
            };

            blocks.push(block);
            const element = createBlockElement(block);
            whiteboard.appendChild(element);
            saveState();
            
            // Auto enter edit mode
            setTimeout(() => {
                const event = new MouseEvent('dblclick', { bubbles: true });
                element.dispatchEvent(event);
            }, 50);
        }

        function showContextMenu(e, blockId) {
            contextBlockId = blockId;
            const block = blocks.find(b => b.id === blockId);
            
            const unlinkMenu = document.getElementById('unlinkFileMenu');
            unlinkMenu.style.display = block.linkedFile ? 'flex' : 'none';

            // Menu positioning
            let x = e.pageX;
            let y = e.pageY;
            
            // Bound checking
            const menuWidth = 220;
            const menuHeight = 200;
            if (x + menuWidth > window.innerWidth) x -= menuWidth;
            if (y + menuHeight > window.innerHeight) y -= menuHeight;

            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
            contextMenu.classList.add('active');
        }

        function hideContextMenu() {
            contextMenu.classList.remove('active');
            contextBlockId = null;
        }

        function changeBlockColor(color) {
            // Update active state in UI
            document.querySelectorAll('.color-option').forEach(el => {
                if (color && el.dataset.color === color) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });

            if (contextCardId) {
                // Change card color
                const card = cards.find(c => c.id === contextCardId);
                if (card) {
                    card.color = color; // Can be null for reset
                    const element = document.getElementById(contextCardId);
                    if (element) {
                        const header = element.querySelector('.card-header');
                        if (color) {
                            // Apply to entire card (opaque mix)
                            element.style.background = mixWithBase(color, CARD_BASE_COLOR, 0.15);
                            element.style.borderColor = mixWithBase(color, CARD_BASE_COLOR, 0.4);
                            
                            // Apply to header (slightly more opaque mix)
                            if (header) {
                                header.style.background = mixWithBase(color, CARD_BASE_COLOR, 0.35);
                            }
                        } else {
                            // Reset to default
                            element.style.background = ''; // css default #1a1a1a
                            element.style.borderColor = ''; // css default #333
                            if (header) {
                                header.style.background = ''; // css default #252525
                            }
                        }
                    }
                    saveState();
                    // Update card list in Tab 2 if visible
                    if (panelCards.classList.contains('active')) {
                        renderCardList();
                    }
                }
                hideContextMenu();
                return;
            }

            if (!contextBlockId) return;
            // Block logic (only if color is provided, ignore reset for now or handle if needed)
            if (color) {
                const block = blocks.find(b => b.id === contextBlockId);
                if (block) {
                    block.color = color;
                    const element = document.getElementById(contextBlockId);
                    element.style.background = color;
                    saveState();
                }
            }
            hideContextMenu();
        }

        function deleteBlock() {
            if (!contextBlockId) return;
            blocks = blocks.filter(b => b.id !== contextBlockId);
            const element = document.getElementById(contextBlockId);
            if (element) {
                element.style.transform = 'scale(0)';
                element.style.opacity = '0';
                setTimeout(() => element.remove(), 200);
            }
            forceSave(); // Use forceSave for delete operations
            hideContextMenu();
        }

        function unlinkFile() {
            if (!contextBlockId) return;
            const block = blocks.find(b => b.id === contextBlockId);
            if (block) {
                block.linkedFile = null;
                const element = document.getElementById(contextBlockId);
                element.classList.remove('linked');
                saveState();
            }
            hideContextMenu();
        }

        // File selector state
        let allWorkspaceFiles = []; // Array of { path: string, mtime: number }
        let selectedFileIndex = -1;
        let filteredFiles = [];
        let fileSelectorMode = 'block'; // 'block' for linking to block, 'card' for creating new card
        const fileSearchInput = document.getElementById('fileSearchInput');
        const newFileItem = document.getElementById('newFileItem');

        function openFileSelector(blockId, mode = 'block') {
            fileSelectorMode = mode;
            selectedBlockId = blockId || contextBlockId;
            selectedFileIndex = -1;
            fileSearchInput.value = '';
            
            // Update modal title based on mode
            const modalTitle = fileModal.querySelector('h3');
            if (modalTitle) {
                if (mode === 'card') {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg> Select or Create Card';
                } else if (mode === 'pinned') {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Select Pinned File';
                } else {
                    modalTitle.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Select Markdown File';
                }
            }
            
            vscode.postMessage({ command: 'getWorkspaceFiles' });
            fileModal.classList.add('active');
            setTimeout(() => fileSearchInput.focus(), 100);
            hideContextMenu();
            hideCanvasContextMenu();
        }

        function closeFileSelector() {
            fileModal.classList.remove('active');
            selectedBlockId = null;
            selectedFileIndex = -1;
        }

        function renderFileList(files) {
            filteredFiles = files;
            if (files.length === 0) {
                fileList.innerHTML = '<div class="no-results">找不到符合的檔案</div>';
            } else {
                fileList.innerHTML = files.map((f, i) => {
                    const filePath = typeof f === 'string' ? f : f.path;
                    return \`<div class="file-item\${i === selectedFileIndex ? ' selected' : ''}" data-file="\${filePath}" data-index="\${i}">\${filePath}</div>\`;
                }).join('');
                fileList.querySelectorAll('.file-item').forEach(item => {
                    item.addEventListener('click', () => selectFile(item.dataset.file));
                });
            }
            
            // Update new file button text based on search query
            const query = fileSearchInput.value.trim();
            const newFileText = newFileItem.querySelector('span:last-child');
            if (newFileText) {
                if (query) {
                    newFileText.textContent = \`Create \${query}...\`;
                } else {
                    newFileText.textContent = '建立新檔案...';
                }
            }
            
            updateNewFileItemSelection();
        }

        function updateNewFileItemSelection() {
            // New File item is selected when selectedFileIndex equals filteredFiles.length
            if (selectedFileIndex === filteredFiles.length) {
                newFileItem.classList.add('selected');
            } else {
                newFileItem.classList.remove('selected');
            }
        }

        function updateSelectedItem() {
            fileList.querySelectorAll('.file-item').forEach((item, i) => {
                if (i === selectedFileIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
            updateNewFileItemSelection();
        }

        function filterFiles(query) {
            const q = query.toLowerCase();
            const filtered = allWorkspaceFiles.filter(f => {
                const filePath = typeof f === 'string' ? f : f.path;
                return filePath.toLowerCase().includes(q);
            });
            
            // If no matching files and there's a query, auto-select the "Create" option
            if (filtered.length === 0 && query.trim()) {
                selectedFileIndex = 0; // Will be set to newFileItem (filteredFiles.length = 0)
            } else {
                selectedFileIndex = -1;
            }
            
            renderFileList(filtered);
        }

        // File search input events
        fileSearchInput.addEventListener('input', (e) => {
            filterFiles(e.target.value);
        });

        fileSearchInput.addEventListener('keydown', (e) => {
            const totalItems = filteredFiles.length + 1; // +1 for New File item
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedFileIndex >= totalItems - 1) {
                    // At the end (Create button), wrap to input (-1)
                    selectedFileIndex = -1;
                } else {
                    selectedFileIndex = selectedFileIndex + 1;
                }
                updateSelectedItem();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedFileIndex <= -1) {
                    // At input, jump to Create button (last item)
                    selectedFileIndex = totalItems - 1;
                } else {
                    selectedFileIndex = selectedFileIndex - 1;
                }
                updateSelectedItem();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedFileIndex >= 0 && selectedFileIndex < filteredFiles.length) {
                    const file = filteredFiles[selectedFileIndex];
                    selectFile(typeof file === 'string' ? file : file.path);
                } else if (selectedFileIndex === filteredFiles.length) {
                    // New File selected
                    handleNewFileClick();
                }
            } else if (e.key === 'Escape') {
                closeFileSelector();
            }
        });

        // New File item click
        newFileItem.addEventListener('click', handleNewFileClick);

        function handleNewFileClick() {
            const query = fileSearchInput.value.trim();
            
            if (fileSelectorMode === 'card' || fileSelectorMode === 'stash') {
                // Card or Stash mode: create new card
                if (query) {
                    // Directly create file with the search query as filename
                    vscode.postMessage({ 
                        command: 'createNewCard', 
                        fileName: query,
                        x: pendingCardPosition.x - 150,
                        y: pendingCardPosition.y - 100,
                        addToStash: fileSelectorMode === 'stash'
                    });
                    closeFileSelector();
                } else {
                    // No query - open modal for filename input
                    closeFileSelector();
                    newCardModal.classList.add('active');
                    document.getElementById('newCardFileName').value = '';
                    document.getElementById('newCardFileName').focus();
                }
            } else {
                // Block mode: link file to block
                if (query && selectedBlockId) {
                    // Directly create file with the search query as filename
                    vscode.postMessage({ 
                        command: 'createNewCard', 
                        fileName: query,
                        x: 0,
                        y: 0,
                        forBlockId: selectedBlockId
                    });
                    closeFileSelector();
                } else if (selectedBlockId) {
                    // No query - open modal for filename input
                    closeFileSelector();
                    newFileForBlockMode = true;
                    newCardModal.classList.add('active');
                    document.getElementById('newCardFileName').value = '';
                    document.getElementById('newCardFileName').focus();
                }
            }
        }

        let newFileForBlockMode = false;

        function selectFile(filePath) {
            if (fileSelectorMode === 'card') {
                // Add existing file as a new card
                addCard(filePath, pendingCardPosition.x - 150, pendingCardPosition.y - 100);
                closeFileSelector();
            } else if (fileSelectorMode === 'stash') {
                // Add existing file to stash
                addToStash(filePath);
                closeFileSelector();
            } else if (fileSelectorMode === 'pinned') {
                // Add file to pinned files list
                if (!pinnedFiles.includes(filePath)) {
                    pinnedFiles.push(filePath);
                }
                currentPinnedFile = filePath;
                closeFileSelector();
                renderPinnedFiles();
                saveState();
            } else {
                // Link file to block
                if (!selectedBlockId) return;

                const block = blocks.find(b => b.id === selectedBlockId);
                if (block) {
                    block.linkedFile = filePath;
                    const element = document.getElementById(selectedBlockId);
                    element.classList.add('linked');
                    saveState();
                }

                closeFileSelector();
            }
        }

        function updateWhiteboardTransform() {
            whiteboard.style.transform = \`translate(\${panOffset.x}px, \${panOffset.y}px) scale(\${zoomLevel})\`;
        }

        // Convert screen coordinates to whiteboard coordinates
        function screenToWhiteboard(screenX, screenY) {
            return {
                x: (screenX - panOffset.x) / zoomLevel,
                y: (screenY - panOffset.y) / zoomLevel
            };
        }

        function setZoom(level, mouseX = null, mouseY = null, smooth = false) {
            const oldZoom = zoomLevel;
            const newZoom = Math.max(0.1, Math.min(5, level)); // Wider zoom range
            
            // If no position provided, default to viewport center
            if (mouseX === null || mouseY === null) {
                mouseX = canvasContainer.clientWidth / 2;
                mouseY = canvasContainer.clientHeight / 2;
            }
            
            // Calculate the point on whiteboard that mouse is pointing at
            const pointX = (mouseX - panOffset.x) / oldZoom;
            const pointY = (mouseY - panOffset.y) / oldZoom;
            
            // Adjust pan offset so that same point stays under mouse after zoom
            panOffset.x = mouseX - pointX * newZoom;
            panOffset.y = mouseY - pointY * newZoom;
            
            zoomLevel = newZoom;
            
            // Apply smooth transition for button clicks
            if (smooth) {
                whiteboard.style.transition = 'transform 0.2s ease-out';
                // Remove transition after animation completes
                setTimeout(() => {
                    whiteboard.style.transition = '';
                }, 200);
            }
            
            updateWhiteboardTransform();
            document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
        }

        // Multi-selection functions
        function clearSelection() {
            selectedBlocks.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('selected');
            });
            selectedCards.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('selected');
            });
            selectedBlocks.clear();
            selectedCards.clear();
        }

        /**
         * Exit all editing modes for blocks and cards
         * Called when clicking on empty canvas area
         */
        function exitAllEditingModes() {
            // Exit block editing mode
            const editingBlocks = document.querySelectorAll('.block.editing');
            editingBlocks.forEach(block => {
                block.classList.remove('editing');
                // Sync text content from input to display
                const textarea = block.querySelector('.block-input');
                const contentDiv = block.querySelector('.block-content');
                if (textarea && contentDiv) {
                    contentDiv.textContent = textarea.value;
                }
            });

            // Exit card editing mode (blur active textarea)
            const editingCards = document.querySelectorAll('.card.editing');
            editingCards.forEach(card => {
                card.classList.remove('editing');
            });

            // Blur any focused textarea/input
            if (document.activeElement && 
                (document.activeElement.tagName === 'TEXTAREA' || 
                 document.activeElement.tagName === 'INPUT')) {
                document.activeElement.blur();
            }
        }

        function toggleBlockSelection(blockId, additive = false) {
            if (!additive) {
                clearSelection();
            }
            
            if (selectedBlocks.has(blockId)) {
                selectedBlocks.delete(blockId);
                document.getElementById(blockId)?.classList.remove('selected');
            } else {
                selectedBlocks.add(blockId);
                document.getElementById(blockId)?.classList.add('selected');
            }
        }

        function toggleCardSelection(cardId, additive = false) {
            if (!additive) {
                clearSelection();
            }
            
            if (selectedCards.has(cardId)) {
                selectedCards.delete(cardId);
                document.getElementById(cardId)?.classList.remove('selected');
            } else {
                selectedCards.add(cardId);
                document.getElementById(cardId)?.classList.add('selected');
            }
        }

        function startSelectionBox(e) {
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            selectionStart = { x: pos.x, y: pos.y };
            isSelecting = true;
            
            // Create selection box element
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.left = pos.x + 'px';
            selectionBox.style.top = pos.y + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            whiteboard.appendChild(selectionBox);
        }

        function updateSelectionBox(e) {
            if (!isSelecting || !selectionBox) return;
            
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            
            const left = Math.min(selectionStart.x, pos.x);
            const top = Math.min(selectionStart.y, pos.y);
            const width = Math.abs(pos.x - selectionStart.x);
            const height = Math.abs(pos.y - selectionStart.y);
            
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        }

        /**
         * Cancel and cleanup selection box without selecting items
         * Called when mouse leaves the window or window loses focus
         */
        function cancelSelectionBox() {
            if (selectionBox) {
                selectionBox.remove();
                selectionBox = null;
            }
            isSelecting = false;
        }


        function endSelectionBox(e, additive = false) {
            if (!isSelecting || !selectionBox) return;
            
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            
            const selRect = {
                left: Math.min(selectionStart.x, pos.x),
                top: Math.min(selectionStart.y, pos.y),
                right: Math.max(selectionStart.x, pos.x),
                bottom: Math.max(selectionStart.y, pos.y)
            };
            
            // Only clear if not additive (Shift not held)
            if (!additive) {
                clearSelection();
            }
            
            // Check blocks for intersection
            blocks.forEach(block => {
                const blockRect = {
                    left: block.x,
                    top: block.y,
                    right: block.x + 200, // block width
                    bottom: block.y + 100 // block height
                };
                
                if (rectsIntersect(selRect, blockRect)) {
                    selectedBlocks.add(block.id);
                    document.getElementById(block.id)?.classList.add('selected');
                }
            });
            
            // Check cards for intersection
            cards.forEach(card => {
                const cardRect = {
                    left: card.x,
                    top: card.y,
                    right: card.x + (card.width || 300),
                    bottom: card.y + (card.height || 200)
                };
                
                if (rectsIntersect(selRect, cardRect)) {
                    selectedCards.add(card.id);
                    document.getElementById(card.id)?.classList.add('selected');
                }
            });
            
            // Remove selection box
            selectionBox.remove();
            selectionBox = null;
            isSelecting = false;
        }

        function rectsIntersect(a, b) {
            return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
        }

        function startMultiDrag(e) {
            if (selectedBlocks.size === 0 && selectedCards.size === 0) return;
            
            isMultiDragging = true;
            multiDragStart = screenToWhiteboard(e.clientX, e.clientY);
            
            // Cache stash panel position at drag start to avoid repeated DOM queries
            if (sidebarOpen && selectedCards.size > 0 && panelStash.classList.contains('active')) {
                cachedDropzoneRect = panelStash.getBoundingClientRect();
            } else {
                cachedDropzoneRect = null;
            }
            isOverDropzone = false;
            
            // Store initial positions for both drag operation and undo
            initialPositions.clear();
            dragStartPositions.clear();
            selectedBlocks.forEach(id => {
                const block = blocks.find(b => b.id === id);
                if (block) {
                    initialPositions.set(id, { x: block.x, y: block.y });
                    dragStartPositions.set(id, { x: block.x, y: block.y, type: 'block' });
                }
            });
            selectedCards.forEach(id => {
                const card = cards.find(c => c.id === id);
                if (card) {
                    initialPositions.set(id, { x: card.x, y: card.y });
                    dragStartPositions.set(id, { x: card.x, y: card.y, type: 'card' });
                }
            });
            
            document.addEventListener('mousemove', onMultiDrag);
            document.addEventListener('mouseup', stopMultiDrag);
        }

        // Pending multi-drag state for RAF optimization
        let pendingMultiDragDeltaX = 0;
        let pendingMultiDragDeltaY = 0;
        
        function onMultiDrag(e) {
            if (!isMultiDragging) return;
            e.preventDefault();
            
            const currentPos = screenToWhiteboard(e.clientX, e.clientY);
            pendingMultiDragDeltaX = currentPos.x - multiDragStart.x;
            pendingMultiDragDeltaY = currentPos.y - multiDragStart.y;
            
            // Update data model immediately for responsiveness
            selectedBlocks.forEach(id => {
                const block = blocks.find(b => b.id === id);
                const initial = initialPositions.get(id);
                if (block && initial) {
                    block.x = initial.x + pendingMultiDragDeltaX;
                    block.y = initial.y + pendingMultiDragDeltaY;
                }
            });
            
            selectedCards.forEach(id => {
                const card = cards.find(c => c.id === id);
                const initial = initialPositions.get(id);
                if (card && initial) {
                    card.x = initial.x + pendingMultiDragDeltaX;
                    card.y = initial.y + pendingMultiDragDeltaY;
                }
            });
            
            // Use RAF for DOM updates - only schedule if not already pending
            if (!pendingMultiDragUpdate) {
                pendingMultiDragUpdate = true;
                requestAnimationFrame(() => {
                    // Move all selected blocks
                    selectedBlocks.forEach(id => {
                        const block = blocks.find(b => b.id === id);
                        if (block) {
                            const el = document.getElementById(id);
                            if (el) {
                                el.style.transform = 'translate(' + block.x + 'px, ' + block.y + 'px)';
                            }
                        }
                    });
                    
                    // Move all selected cards
                    selectedCards.forEach(id => {
                        const card = cards.find(c => c.id === id);
                        if (card) {
                            const el = document.getElementById(id);
                            if (el) {
                                el.style.transform = 'translate(' + card.x + 'px, ' + card.y + 'px)';
                            }
                        }
                    });
                    
                    pendingMultiDragUpdate = false;
                });
            }
            
            // Check if hovering over stash panel using cached rect
            if (cachedDropzoneRect) {
                const nowOver = e.clientX >= cachedDropzoneRect.left && e.clientX <= cachedDropzoneRect.right &&
                               e.clientY >= cachedDropzoneRect.top && e.clientY <= cachedDropzoneRect.bottom;
                // Only update classList when state changes
                if (nowOver !== isOverDropzone) {
                    isOverDropzone = nowOver;
                    if (nowOver) {
                        panelStash.classList.add('drag-over');
                    } else {
                        panelStash.classList.remove('drag-over');
                    }
                }
            }
        }

        function stopMultiDrag(e) {
            if (isMultiDragging) {
                isMultiDragging = false;

                // Check if dropped on stash panel
                if (sidebarOpen && selectedCards.size > 0 && panelStash.classList.contains('active')) {
                    const panelRect = panelStash.getBoundingClientRect();
                    if (e.clientX >= panelRect.left && e.clientX <= panelRect.right &&
                        e.clientY >= panelRect.top && e.clientY <= panelRect.bottom) {
                        // Move all selected cards to stash
                        // First restore original positions (since they were just visual during drag)
                        selectedCards.forEach(id => {
                            const initial = initialPositions.get(id);
                            const card = cards.find(c => c.id === id);
                            if (card && initial) {
                                card.x = initial.x;
                                card.y = initial.y;
                            }
                        });

                        // Then move to stash
                        const cardsToStash = [...selectedCards];
                        cardsToStash.forEach(cardId => {
                            moveCardToStash(cardId);
                        });

                        // Clear selection - don't record undo for stash moves
                        selectedCards.clear();
                        panelStash.classList.remove('drag-over');
                        initialPositions.clear();
                        dragStartPositions.clear();
                        document.removeEventListener('mousemove', onMultiDrag);
                        document.removeEventListener('mouseup', stopMultiDrag);
                        return;
                    }
                }

                panelStash.classList.remove('drag-over');
                initialPositions.clear();
                // Record undo action for position changes
                recordDragEndAction();
                saveState();
            }
            document.removeEventListener('mousemove', onMultiDrag);
            document.removeEventListener('mouseup', stopMultiDrag);
        }

        function isBlockSelected(blockId) {
            return selectedBlocks.has(blockId);
        }

        function isCardSelected(cardId) {
            return selectedCards.has(cardId);
        }

        /**
         * Mark state as dirty and schedule a save
         * Uses debounce to avoid saving too frequently
         */
        function saveState() {
            isDirty = true;
            stateVersion++;  // Increment version to track changes
            scheduleSave();
        }

        /**
         * Schedule a save with debounce
         * Cancels any pending save and starts a new timer
         */
        function scheduleSave() {
            if (saveTimeoutId) {
                clearTimeout(saveTimeoutId);
            }
            saveTimeoutId = setTimeout(() => {
                performSave();
            }, SAVE_DEBOUNCE_MS);
        }

        /**
         * Actually perform the save if there are changes
         * Uses dirty flag and version tracking to skip unnecessary saves
         */
        function performSave() {
            saveTimeoutId = null;

            if (!isDirty) {
                return; // No changes, skip save
            }

            // Use version tracking instead of expensive JSON.stringify comparison
            if (stateVersion === lastSavedVersion) {
                isDirty = false;
                return; // No actual changes, skip save
            }

            // Actually save
            vscode.postMessage({ command: 'saveState', state: { blocks, cards, pinnedFiles, stashCards } });
            lastSavedVersion = stateVersion;
            isDirty = false;
        }

        /**
         * Force an immediate save (used for critical operations)
         * Bypasses debounce but still respects dirty flag
         */
        function forceSave() {
            if (saveTimeoutId) {
                clearTimeout(saveTimeoutId);
                saveTimeoutId = null;
            }
            performSave();
        }

        // ========== Undo/Redo Functions ==========
        /**
         * Push an action to the undo stack
         * @param {Object} action - Action object with type and items
         */
        function pushUndoAction(action) {
            if (!action || !action.items || action.items.length === 0) return;
            
            undoStack.push(action);
            // Limit stack size
            if (undoStack.length > MAX_UNDO_HISTORY) {
                undoStack.shift();
            }
            // Clear redo stack when new action is performed
            redoStack = [];
        }

        /**
         * Undo the last whiteboard action (position change)
         */
        function undo() {
            if (undoStack.length === 0) return;
            
            const action = undoStack.pop();
            
            // Restore previous positions
            action.items.forEach(item => {
                if (item.type === 'block') {
                    const block = blocks.find(b => b.id === item.id);
                    if (block) {
                        block.x = item.before.x;
                        block.y = item.before.y;
                        updateElementPosition(item.id, block.x, block.y);
                    }
                } else if (item.type === 'card') {
                    const card = cards.find(c => c.id === item.id);
                    if (card) {
                        card.x = item.before.x;
                        card.y = item.before.y;
                        updateElementPosition(item.id, card.x, card.y);
                    }
                }
            });
            
            // Push to redo stack
            redoStack.push(action);
            
            saveState();
        }

        /**
         * Redo the last undone whiteboard action
         */
        function redo() {
            if (redoStack.length === 0) return;
            
            const action = redoStack.pop();
            
            // Apply the action again
            action.items.forEach(item => {
                if (item.type === 'block') {
                    const block = blocks.find(b => b.id === item.id);
                    if (block) {
                        block.x = item.after.x;
                        block.y = item.after.y;
                        updateElementPosition(item.id, block.x, block.y);
                    }
                } else if (item.type === 'card') {
                    const card = cards.find(c => c.id === item.id);
                    if (card) {
                        card.x = item.after.x;
                        card.y = item.after.y;
                        updateElementPosition(item.id, card.x, card.y);
                    }
                }
            });
            
            // Push back to undo stack
            undoStack.push(action);
            
            saveState();
        }

        /**
         * Update an element's visual position using transform
         */
        function updateElementPosition(id, x, y) {
            const el = document.getElementById(id);
            if (el) {
                el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
            }
        }

        /**
         * Record positions before drag starts (called at drag start)
         */
        function recordDragStartPositions(itemIds, itemType) {
            dragStartPositions.clear();
            itemIds.forEach(id => {
                let item;
                if (itemType === 'block') {
                    item = blocks.find(b => b.id === id);
                } else if (itemType === 'card') {
                    item = cards.find(c => c.id === id);
                }
                if (item) {
                    dragStartPositions.set(id, { x: item.x, y: item.y, type: itemType });
                }
            });
        }

        /**
         * Create and push undo action after drag ends
         */
        function recordDragEndAction() {
            if (dragStartPositions.size === 0) return;
            
            const items = [];
            dragStartPositions.forEach((before, id) => {
                let item;
                if (before.type === 'block') {
                    item = blocks.find(b => b.id === id);
                } else if (before.type === 'card') {
                    item = cards.find(c => c.id === id);
                }
                if (item) {
                    // Only record if position actually changed
                    if (item.x !== before.x || item.y !== before.y) {
                        items.push({
                            id: id,
                            type: before.type,
                            before: { x: before.x, y: before.y },
                            after: { x: item.x, y: item.y }
                        });
                    }
                }
            });
            
            if (items.length > 0) {
                pushUndoAction({ type: 'move', items: items });
            }
            
            dragStartPositions.clear();
        }
        // ==========================================

        function loadState(state) {
            blocks = state.blocks || [];
            cards = state.cards || [];
            pinnedFiles = state.pinnedFiles || [];
            stashCards = state.stashCards || [];
            
            whiteboard.innerHTML = '';
            blocks.forEach(block => {
                const element = createBlockElement(block);
                whiteboard.appendChild(element);
            });
            cards.forEach(card => {
                const element = createCardElement(card);
                whiteboard.appendChild(element);
                // Load card content
                vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            });
            
            // Initialize sidebar data
            initSidebar();
        }

        // Helper function to convert hex color to rgba with alpha
        function colorWithAlpha(hexColor, alpha) {
            // Handle hex colors
            if (hexColor && hexColor.startsWith('#')) {
                const hex = hexColor.slice(1);
                const r = parseInt(hex.substr(0, 2), 16);
                const g = parseInt(hex.substr(2, 2), 16);
                const b = parseInt(hex.substr(4, 2), 16);
                return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
            }
            return hexColor;
        }

        // Helper function to extract filename from path
        function getFileName(filePath) {
            if (!filePath) return 'Unknown';
            // Handle both forward and backward slashes
            const parts = filePath.replace(/\\\\/g, '/').split('/');
            return parts[parts.length - 1];
        }

        function createCardElement(card) {
            const div = document.createElement('div');
            div.className = 'card' + (card.collapsed ? ' collapsed' : '');
            div.id = card.id;
            div.style.transform = 'translate(' + card.x + 'px, ' + card.y + 'px)';
            div.style.width = (card.width || 300) + 'px';
            if (!card.collapsed) {
                div.style.height = (card.height || 200) + 'px';
            }
            
            // Apply card color to entire card background (opaque version)
            if (card.color) {
                div.style.background = mixWithBase(card.color, CARD_BASE_COLOR, 0.15);
                div.style.borderColor = mixWithBase(card.color, CARD_BASE_COLOR, 0.4);
            }

            // Header - only show filename, not full path
            const header = document.createElement('div');
            header.className = 'card-header';
            
            // Apply card color to header (slightly more opaque)
            if (card.color) {
                header.style.background = mixWithBase(card.color, CARD_BASE_COLOR, 0.35);
            }
            
            // Collapse toggle triangle
            const collapseToggle = document.createElement('div');
            collapseToggle.className = 'card-collapse-toggle';
            collapseToggle.title = card.collapsed ? 'Expand' : 'Collapse';
            header.appendChild(collapseToggle);
            
            // File icon - clickable to open file (requires Cmd/Ctrl)
            const fileIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            fileIcon.setAttribute('class', 'icon-sm');
            fileIcon.setAttribute('viewBox', '0 0 24 24');
            fileIcon.setAttribute('fill', 'none');
            fileIcon.setAttribute('stroke', 'currentColor');
            fileIcon.setAttribute('stroke-width', '2');
            fileIcon.setAttribute('stroke-linecap', 'round');
            fileIcon.setAttribute('stroke-linejoin', 'round');
            fileIcon.innerHTML = '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line>';
            fileIcon.style.cursor = 'pointer';
            fileIcon.addEventListener('click', (e) => {
                // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                
                e.preventDefault();
                e.stopPropagation();
                const splitView = e.altKey;
                vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: splitView });
            });
            header.appendChild(fileIcon);
            
            // Filename - clickable to open file (requires Cmd/Ctrl)
            const displayName = getFileName(card.filePath);
            const filenameSpan = document.createElement('span');
            filenameSpan.className = 'filename';
            filenameSpan.textContent = displayName;
            filenameSpan.style.cursor = 'pointer';
            filenameSpan.title = 'Cmd+click or Option+click to open file';
            
            // Click on filename to open file (requires Cmd/Ctrl OR Option/Alt)
            filenameSpan.addEventListener('click', (e) => {
                // Require Cmd/Ctrl OR Option/Alt to open file - prevents accidental opens
                if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
                
                e.preventDefault();
                e.stopPropagation();
                const splitView = e.altKey;
                vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: splitView });
            });
            
            header.appendChild(filenameSpan);
            
            div.appendChild(header);

            // Content
            const content = document.createElement('div');
            content.className = 'card-content';
            
            // Milkdown container (preferred editor)
            const milkdownContainer = document.createElement('div');
            milkdownContainer.className = 'milkdown-editor-wrapper';
            milkdownContainer.dataset.cardId = card.id;
            milkdownContainer.style.width = '100%';
            milkdownContainer.style.height = '100%';
            
            // Loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'milkdown-loading';
            loadingDiv.textContent = 'Loading...';
            milkdownContainer.appendChild(loadingDiv);
            
            content.appendChild(milkdownContainer);
            
            // Textarea (fallback for non-Milkdown mode)
            const textarea = document.createElement('textarea');
            textarea.className = 'card-textarea';
            textarea.style.display = 'none'; // Hidden by default, shown if Milkdown fails
            textarea.placeholder = 'Loading...';
            textarea.dataset.cardId = card.id;
            content.appendChild(textarea);
            
            // Disconnected message container (hidden by default)
            const disconnectedContainer = document.createElement('div');
            disconnectedContainer.className = 'disconnected-container';
            disconnectedContainer.style.display = 'none';
            
            const disconnectedMsg = document.createElement('div');
            disconnectedMsg.className = 'disconnected-message';
            disconnectedMsg.textContent = '此文件已斷開連結';
            disconnectedContainer.appendChild(disconnectedMsg);
            
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'refresh-btn';
            refreshBtn.innerHTML = '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> 重新連結';
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Try to reload the file content
                vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            });
            disconnectedContainer.appendChild(refreshBtn);
            
            content.appendChild(disconnectedContainer);
            div.appendChild(content);

            // Resize handles - 8 directions (4 corners + 4 edges)
            const resizeDirections = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
            resizeDirections.forEach(direction => {
                const handle = document.createElement('div');
                handle.className = 'card-resize-handle ' + direction;
                handle.dataset.direction = direction;
                handle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    startCardResize(e, div, card, direction);
                });
                div.appendChild(handle);
            });


            // Collapse toggle click handler
            collapseToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                card.collapsed = !card.collapsed;
                div.classList.toggle('collapsed');
                collapseToggle.title = card.collapsed ? 'Expand' : 'Collapse';
                
                if (!card.collapsed) {
                    // Restore height when expanding
                    div.style.height = (card.height || 200) + 'px';
                } else {
                    // Remove explicit height when collapsing
                    div.style.height = '';
                }
                saveState();
            });

            // Drag by header (but not by clicking on toggle)
            header.addEventListener('mousedown', (e) => {
                if (e.target === collapseToggle || collapseToggle.contains(e.target)) return;
                if (e.button !== 0) return;
                
                // Check if this card is part of a multi-selection
                if (isCardSelected(card.id)) {
                    // Start multi-drag if clicking on an already selected card
                    e.stopPropagation();
                    startMultiDrag(e);
                } else if (e.shiftKey) {
                    // Shift+click to add to selection
                    e.stopPropagation();
                    toggleCardSelection(card.id, true);
                } else {
                    // Normal click - select this item and start single drag
                    clearSelection();
                    selectedCards.add(card.id);
                    div.classList.add('selected');
                    startCardDrag(e, div, card);
                }
            });

            // (Resize handlers are now attached during handle creation above)

            // Save content on change (debounced)
            let saveTimeout;
            textarea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    vscode.postMessage({ 
                        command: 'saveCardContent', 
                        filePath: card.filePath, 
                        content: textarea.value 
                    });
                    // Update lastModified timestamp
                    updateCardLastModified(card.id);
                    saveState();
                }, 500);
            });

            // Add editing class when focused for visual feedback
            textarea.addEventListener('focus', () => {
                div.classList.add('editing');
            });

            textarea.addEventListener('blur', () => {
                div.classList.remove('editing');
            });

            // Context menu
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showCardContextMenu(e, card.id);
            });

            // Enable HTML5 drag & drop to stash
            enableCardDragToStash(div, card);

            return div;

        }

        function startCardDrag(e, element, card) {
            draggedCard = { element, card };
            element.classList.add('dragging');
            
            // Record position for undo
            recordDragStartPositions([card.id], 'card');
            
            // Bring card to front by incrementing z-index
            topZIndex++;
            element.style.zIndex = topZIndex;
            
            // Cache stash panel position at drag start to avoid repeated DOM queries
            if (sidebarOpen && panelStash.classList.contains('active')) {
                cachedDropzoneRect = panelStash.getBoundingClientRect();
            } else {
                cachedDropzoneRect = null;
            }
            isOverDropzone = false;
            
            const rect = element.getBoundingClientRect();
            dragOffset = {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };

            document.addEventListener('mousemove', onCardDrag);
            document.addEventListener('mouseup', stopCardDrag);
        }

        // Pending drag state for RAF optimization
        let pendingDragX = 0;
        let pendingDragY = 0;
        
        function onCardDrag(e) {
            if (!draggedCard) return;
            e.preventDefault();

            const pos = screenToWhiteboard(e.clientX, e.clientY);
            pendingDragX = pos.x - dragOffset.x;
            pendingDragY = pos.y - dragOffset.y;

            // Update data model immediately for responsiveness
            draggedCard.card.x = pendingDragX;
            draggedCard.card.y = pendingDragY;
            
            // Use RAF for DOM update - only schedule if not already pending
            if (!pendingDragUpdate) {
                pendingDragUpdate = true;
                requestAnimationFrame(() => {
                    if (draggedCard) {
                        draggedCard.element.style.transform = 'translate(' + pendingDragX + 'px, ' + pendingDragY + 'px)';
                    }
                    pendingDragUpdate = false;
                });
            }
            
            // Check if hovering over stash panel using cached rect
            if (cachedDropzoneRect) {
                const nowOver = e.clientX >= cachedDropzoneRect.left && e.clientX <= cachedDropzoneRect.right &&
                               e.clientY >= cachedDropzoneRect.top && e.clientY <= cachedDropzoneRect.bottom;
                // Only update classList when state changes
                if (nowOver !== isOverDropzone) {
                    isOverDropzone = nowOver;
                    if (nowOver) {
                        panelStash.classList.add('drag-over');
                    } else {
                        panelStash.classList.remove('drag-over');
                    }
                }
            }
        }

        function stopCardDrag(e) {
            if (draggedCard) {
                // Check if dropped on stash panel (either dropzone or list area)
                if (sidebarOpen && panelStash.classList.contains('active')) {
                    const panelRect = panelStash.getBoundingClientRect();
                    if (e.clientX >= panelRect.left && e.clientX <= panelRect.right &&
                        e.clientY >= panelRect.top && e.clientY <= panelRect.bottom) {
                        // Move card to stash instead of just repositioning
                        const cardId = draggedCard.card.id;
                        draggedCard.element.classList.remove('dragging');
                        stashDropzone.classList.remove('drag-over');
                        panelStash.classList.remove('drag-over');
                        draggedCard = null;
                        // Clear drag positions - don't record undo for stash moves
                        dragStartPositions.clear();

                        moveCardToStash(cardId);

                        document.removeEventListener('mousemove', onCardDrag);
                        document.removeEventListener('mouseup', stopCardDrag);
                        return;
                    }
                }

                stashDropzone.classList.remove('drag-over');
                panelStash.classList.remove('drag-over');
                draggedCard.element.classList.remove('dragging');
                // Record undo action before clearing reference
                recordDragEndAction();
                draggedCard = null;
                saveState();
            }
            document.removeEventListener('mousemove', onCardDrag);
            document.removeEventListener('mouseup', stopCardDrag);
        }

        function startCardResize(e, element, card, direction) {
            resizingCard = { 
                element, 
                card, 
                direction,
                startX: e.clientX, 
                startY: e.clientY, 
                startW: element.offsetWidth, 
                startH: element.offsetHeight,
                startLeft: card.x,
                startTop: card.y
            };
            document.body.style.cursor = getCursorForDirection(direction);
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onCardResize);
            document.addEventListener('mouseup', stopCardResize);
        }

        function getCursorForDirection(direction) {
            const cursors = {
                'nw': 'nw-resize', 'n': 'n-resize', 'ne': 'ne-resize',
                'w': 'w-resize', 'e': 'e-resize',
                'sw': 'sw-resize', 's': 's-resize', 'se': 'se-resize'
            };
            return cursors[direction] || 'se-resize';
        }

        function onCardResize(e) {
            if (!resizingCard) return;
            e.preventDefault();
            
            const dx = (e.clientX - resizingCard.startX) / zoomLevel;
            const dy = (e.clientY - resizingCard.startY) / zoomLevel;
            const dir = resizingCard.direction;
            
            let newW = resizingCard.startW;
            let newH = resizingCard.startH;
            let newX = resizingCard.startLeft;
            let newY = resizingCard.startTop;
            
            const MIN_W = 200;
            const MIN_H = 100;
            
            // Handle horizontal resizing
            if (dir.includes('e')) {
                // Resize from right edge
                newW = Math.max(MIN_W, resizingCard.startW + dx);
            } else if (dir.includes('w')) {
                // Resize from left edge - also adjust X position
                const widthChange = Math.min(dx, resizingCard.startW - MIN_W);
                newW = Math.max(MIN_W, resizingCard.startW - dx);
                newX = resizingCard.startLeft + (resizingCard.startW - newW);
            }
            
            // Handle vertical resizing
            if (dir.includes('s')) {
                // Resize from bottom edge
                newH = Math.max(MIN_H, resizingCard.startH + dy);
            } else if (dir.includes('n')) {
                // Resize from top edge - also adjust Y position
                const heightChange = Math.min(dy, resizingCard.startH - MIN_H);
                newH = Math.max(MIN_H, resizingCard.startH - dy);
                newY = resizingCard.startTop + (resizingCard.startH - newH);
            }
            
            // Apply changes
            resizingCard.element.style.width = newW + 'px';
            resizingCard.element.style.height = newH + 'px';
            resizingCard.element.style.transform = 'translate(' + newX + 'px, ' + newY + 'px)';
            
            resizingCard.card.width = newW;
            resizingCard.card.height = newH;
            resizingCard.card.x = newX;
            resizingCard.card.y = newY;
        }

        function stopCardResize() {
            if (resizingCard) {
                resizingCard = null;
                saveState();
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onCardResize);
            document.removeEventListener('mouseup', stopCardResize);
        }


        function addCard(filePath, x, y) {
            const card = {
                id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                x: x,
                y: y,
                width: 400,
                height: 300,
                filePath: filePath,
                lastModified: Date.now() // Add timestamp for proper sorting in list
            };
            cards.push(card);
            const element = createCardElement(card);
            whiteboard.appendChild(element);
            vscode.postMessage({ command: 'readCardContent', cardId: card.id, filePath: card.filePath });
            saveState();
            
            // Update sidebar card list if visible
            if (panelCards.classList.contains('active')) {
                renderCardList();
            }
        }


        function showCardContextMenu(e, cardId) {
            contextCardId = cardId;
            // Show color section for cards too
            const colorSection = contextMenu.querySelector('.context-menu-section');
            colorSection.style.display = 'block';
            // Hide link/unlink options (cards are already linked to files)
            document.getElementById('linkFileMenu').parentElement.style.display = 'none';
            // Show card-specific actions (Rename, Move)
            document.getElementById('cardActionsSection').style.display = 'block';
            
            // Highlight active color
            const card = cards.find(c => c.id === cardId);
            document.querySelectorAll('.color-option').forEach(el => {
                if (card && card.color && el.dataset.color === card.color) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
            
            let x = e.pageX;
            let y = e.pageY;
            if (x + 220 > window.innerWidth) x -= 220;
            if (y + 280 > window.innerHeight) y -= 280;
            
            contextMenu.style.left = x + 'px';
            contextMenu.style.top = y + 'px';
            contextMenu.classList.add('active');
        }

        function showCanvasContextMenu(e) {
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            pendingCardPosition = { x: pos.x, y: pos.y };
            
            let x = e.pageX;
            let y = e.pageY;
            if (x + 180 > window.innerWidth) x -= 180;
            if (y + 100 > window.innerHeight) y -= 100;
            
            canvasContextMenu.style.left = x + 'px';
            canvasContextMenu.style.top = y + 'px';
            canvasContextMenu.classList.add('active');
        }

        function hideCanvasContextMenu() {
            canvasContextMenu.classList.remove('active');
        }

        function openNewCardModal() {
            newCardModal.classList.add('active');
            document.getElementById('newCardFileName').value = '';
            document.getElementById('newCardFileName').focus();
            hideCanvasContextMenu();
        }

        function closeNewCardModal() {
            newCardModal.classList.remove('active');
            newFileForBlockMode = false;
        }

        function createNewCard() {
            const fileName = document.getElementById('newCardFileName').value.trim();
            if (!fileName) return;
            
            if (newFileForBlockMode && selectedBlockId) {
                // Creating new file for block linking
                vscode.postMessage({ 
                    command: 'createNewCard', 
                    fileName: fileName,
                    x: 0,
                    y: 0,
                    forBlockId: selectedBlockId
                });
            } else {
                // Creating new card on canvas or stash
                vscode.postMessage({ 
                    command: 'createNewCard', 
                    fileName: fileName,
                    x: pendingCardPosition.x - 150,
                    y: pendingCardPosition.y - 100,
                    addToStash: fileSelectorMode === 'stash'
                });
            }
            closeNewCardModal();
        }

        // ========== Rename Card Functions ==========
        function openRenameModal(cardId, filePath) {
            renameTargetCardId = cardId;
            renameTargetPath = filePath;
            
            // Pre-fill with current filename (without extension)
            const currentName = filePath.split('/').pop().replace('.md', '');
            const input = document.getElementById('renameCardInput');
            input.value = currentName;
            
            renameCardModal.classList.add('active');
            input.focus();
            input.select();
        }

        function closeRenameModal() {
            renameCardModal.classList.remove('active');
            renameTargetCardId = null;
            renameTargetPath = null;
        }

        function confirmRename() {
            const newName = document.getElementById('renameCardInput').value.trim();
            if (!newName || !renameTargetCardId || !renameTargetPath) return;
            
            vscode.postMessage({
                command: 'renameCard',
                cardId: renameTargetCardId,
                oldPath: renameTargetPath,
                newName: newName
            });
            
            closeRenameModal();
        }

        // ========== Move Card Functions ==========
        function openMoveModal(cardId, filePath) {
            moveTargetCardId = cardId;
            moveTargetPath = filePath;
            selectedFolderIndex = -1; // Reset selection
            flatFolderList = []; // Reset folder list
            
            // Request folder list from extension
            vscode.postMessage({ command: 'getWorkspaceFolders' });
            
            moveCardModal.classList.add('active');
            document.getElementById('folderSearchInput').value = '';
            document.getElementById('folderSearchInput').focus();
        }

        function closeMoveModal() {
            moveCardModal.classList.remove('active');
            moveTargetCardId = null;
            moveTargetPath = null;
            allWorkspaceFolders = [];
            filteredFolders = [];
        }

        // Build folder tree structure from flat folder paths
        function buildFolderTree(folders) {
            const tree = { name: '', path: '', children: {} };
            
            folders.forEach(folderPath => {
                if (folderPath === '') {
                    // Root folder - already in tree
                    return;
                }
                
                const parts = folderPath.split('/');
                let current = tree;
                let currentPath = '';
                
                parts.forEach((part, index) => {
                    currentPath = currentPath ? currentPath + '/' + part : part;
                    if (!current.children[part]) {
                        current.children[part] = {
                            name: part,
                            path: currentPath,
                            children: {}
                        };
                    }
                    current = current.children[part];
                });
            });
            
            return tree;
        }

        // Track expanded folders state
        const expandedFolders = new Set(['']); // Root is expanded by default

        function renderFolderTree(node, container, isRoot = false) {
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = expandedFolders.has(node.path);
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'folder-tree-item';
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'folder-tree-row' + (isRoot ? ' root-folder' : '');
            rowDiv.dataset.path = node.path;
            
            // Toggle arrow (for folders with children)
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'folder-toggle' + (isExpanded ? ' expanded' : '') + (!hasChildren ? ' hidden' : '');
            toggleDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
            
            if (hasChildren) {
                toggleDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (expandedFolders.has(node.path)) {
                        expandedFolders.delete(node.path);
                    } else {
                        expandedFolders.add(node.path);
                    }
                    renderFolderList(filteredFolders);
                });
            }
            
            // Folder icon
            const iconDiv = document.createElement('div');
            iconDiv.className = 'folder-icon';
            iconDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg>';
            
            // Folder name
            const nameSpan = document.createElement('span');
            nameSpan.className = 'folder-name';
            nameSpan.textContent = isRoot ? '/ (根目錄)' : node.name;
            
            rowDiv.appendChild(toggleDiv);
            rowDiv.appendChild(iconDiv);
            rowDiv.appendChild(nameSpan);
            
            // Click to select folder
            rowDiv.addEventListener('click', () => selectFolder(node.path));
            
            itemDiv.appendChild(rowDiv);
            
            // Render children if expanded
            if (hasChildren) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'folder-children' + (isExpanded ? '' : ' collapsed');
                
                // Sort children alphabetically
                const sortedChildren = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
                sortedChildren.forEach(child => {
                    renderFolderTree(child, childrenDiv, false);
                });
                
                itemDiv.appendChild(childrenDiv);
            }
            
            container.appendChild(itemDiv);
        }

        // Collect visible folders in tree order for keyboard navigation
        function collectVisibleFolders(node, result = []) {
            result.push(node.path);
            
            if (expandedFolders.has(node.path)) {
                const sortedChildren = Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name));
                sortedChildren.forEach(child => {
                    collectVisibleFolders(child, result);
                });
            }
            
            return result;
        }

        function renderFolderList(folders) {
            folderList.innerHTML = '';
            
            // Check if we're filtering (searching)
            const searchQuery = document.getElementById('folderSearchInput').value.trim().toLowerCase();
            
            if (searchQuery) {
                // Flat list for search results
                flatFolderList = folders.slice(); // Copy the filtered folders
                folders.forEach((folder, index) => {
                    const item = document.createElement('div');
                    item.className = 'folder-tree-row' + (index === selectedFolderIndex ? ' selected' : '');
                    item.dataset.index = index;
                    item.innerHTML = \`
                        <div class="folder-toggle hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></div>
                        <div class="folder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg></div>
                        <span class="folder-name">\${folder === '' ? '/ (根目錄)' : folder}</span>
                    \`;
                    item.addEventListener('click', () => selectFolder(folder));
                    folderList.appendChild(item);
                });
            } else {
                // Build and render tree structure
                const tree = buildFolderTree(folders);
                const treeContainer = document.createElement('div');
                treeContainer.className = 'folder-tree';
                
                // Collect visible folders for keyboard navigation
                flatFolderList = collectVisibleFolders(tree);
                
                // Render root folder first
                renderFolderTree(tree, treeContainer, true);
                
                folderList.appendChild(treeContainer);
            }
            
            // Update selected state
            updateSelectedFolder();
        }

        function updateSelectedFolder() {
            // Remove all selected states first
            folderList.querySelectorAll('.folder-tree-row').forEach((row, i) => {
                row.classList.remove('selected');
            });
            
            // Add selected state to the correct item
            if (selectedFolderIndex >= 0 && selectedFolderIndex < flatFolderList.length) {
                const selectedPath = flatFolderList[selectedFolderIndex];
                const selectedRow = folderList.querySelector(\`.folder-tree-row[data-path="\${selectedPath}"]\`);
                if (selectedRow) {
                    selectedRow.classList.add('selected');
                    selectedRow.scrollIntoView({ block: 'nearest' });
                } else {
                    // For search results mode, use index
                    const searchRows = folderList.querySelectorAll('.folder-tree-row');
                    if (searchRows[selectedFolderIndex]) {
                        searchRows[selectedFolderIndex].classList.add('selected');
                        searchRows[selectedFolderIndex].scrollIntoView({ block: 'nearest' });
                    }
                }
            }
        }

        function filterFolders(query) {
            const lowerQuery = query.toLowerCase();
            filteredFolders = allWorkspaceFolders.filter(f => 
                f.toLowerCase().includes(lowerQuery) || (f === '' && '根目錄'.includes(lowerQuery))
            );
            selectedFolderIndex = -1; // Reset selection when filtering
            renderFolderList(filteredFolders);
        }

        function selectFolder(folder) {
            if (!moveTargetCardId || !moveTargetPath) return;
            
            vscode.postMessage({
                command: 'moveCard',
                cardId: moveTargetCardId,
                oldPath: moveTargetPath,
                targetFolder: folder
            });
            
            closeMoveModal();
        }

        // Message handling
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'loadState':
                    loadState(message.state);
                    break;
                case 'workspaceFiles':
                    allWorkspaceFiles = message.files;
                    renderFileList(message.files);
                    break;
                case 'fileSelected':
                    if (message.blockId) {
                        const block = blocks.find(b => b.id === message.blockId);
                        if (block) {
                            block.linkedFile = message.filePath;
                            const element = document.getElementById(message.blockId);
                            element.classList.add('linked');
                            saveState();
                        }
                    }
                    closeFileSelector();
                    break;
                case 'fileChanged':
                    // File was changed externally (e.g., in VS Code editor)
                    // Update the card content if it's not currently being edited
                    const changedTextarea = document.querySelector(\`textarea[data-card-id=\"\${message.cardId}\"]\`);
                    const changedCard = changedTextarea ? changedTextarea.closest('.card') : document.getElementById(message.cardId);
                    
                    if (changedCard) {
                        // If card was disconnected, reconnect it
                        if (changedCard.classList.contains('disconnected')) {
                            changedCard.classList.remove('disconnected');
                            const disconnectedContainer = changedCard.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'none';
                        }
                        
                        // Update Milkdown if available
                        if (changedCard.classList.contains('using-milkdown') && window.milkdownManager) {
                            // Only update if the editor is not focused (user not actively editing)
                            const isFocused = window.milkdownManager.isFocused(message.cardId);
                            if (!isFocused) {
                                window.milkdownManager.setMarkdown(message.cardId, message.content);
                            } else {
                                console.log('[Milkdown] Skipping external update - editor is focused');
                            }
                        } else if (changedTextarea) {
                            // Update textarea
                            if (document.activeElement !== changedTextarea) {
                                changedTextarea.value = message.content;
                            } else {
                                // If user is editing, store the new content and notify later
                                changedTextarea.dataset.pendingContent = message.content;
                                // Add a visual indicator that file was changed externally
                                if (!changedCard.classList.contains('external-change')) {
                                    changedCard.classList.add('external-change');
                                    changedTextarea.addEventListener('blur', function onBlur() {
                                        changedCard.classList.remove('external-change');
                                        changedTextarea.removeEventListener('blur', onBlur);
                                    }, { once: true });
                                }
                            }
                        }
                    }
                    break;
                case 'fileDeleted':
                    // File was deleted - show disconnected state
                    const deletedCardTextarea = document.querySelector(\`textarea[data-card-id="\${message.cardId}"]\`);
                    if (deletedCardTextarea) {
                        const deletedCard = deletedCardTextarea.closest('.card');
                        if (deletedCard && !deletedCard.classList.contains('disconnected')) {
                            deletedCard.classList.add('disconnected');
                            // Show disconnected message, hide textarea
                            deletedCardTextarea.style.display = 'none';
                            const disconnectedContainer = deletedCard.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'flex';
                        }
                    }
                    break;
                case 'cardContent':
                    const cardTextarea = document.querySelector(\`textarea[data-card-id=\"\${message.cardId}\"]\`);
                    const milkdownWrapper = document.querySelector(\`.milkdown-editor-wrapper[data-card-id=\"\${message.cardId}\"]\`);
                    
                    if (cardTextarea) {
                        // File exists - remove disconnected state if present
                        const cardEl = cardTextarea.closest('.card');
                        if (cardEl && cardEl.classList.contains('disconnected')) {
                            cardEl.classList.remove('disconnected');
                            const disconnectedContainer = cardEl.querySelector('.disconnected-container');
                            if (disconnectedContainer) disconnectedContainer.style.display = 'none';
                        }
                        
                        // Store content for fallback
                        cardTextarea.value = message.content;
                        cardTextarea.placeholder = 'Type here...';
                        
                        // Try to initialize Milkdown
                        if (milkdownWrapper && window.milkdownManager) {
                            // Clear loading indicator
                            milkdownWrapper.innerHTML = '';
                            
                            // Get card info for save callback
                            const cardData = cards.find(c => c.id === message.cardId);
                            
                            // Initialize Milkdown editor
                            window.milkdownManager.createEditor(
                                milkdownWrapper,
                                message.cardId,
                                message.content,
                                (cardId, markdown) => {
                                    // On content change, save to file
                                    if (cardData) {
                                        vscode.postMessage({ 
                                            command: 'saveCardContent', 
                                            filePath: cardData.filePath, 
                                            content: markdown 
                                        });
                                        updateCardLastModified(cardId);
                                        saveState();
                                    }
                                }
                            ).then(() => {
                                console.log('[Milkdown] Editor initialized for card:', message.cardId);
                                cardEl.classList.add('using-milkdown');
                            }).catch((err) => {
                                console.error('[Milkdown] Failed to initialize:', err);
                                // Fallback to textarea
                                milkdownWrapper.style.display = 'none';
                                cardTextarea.style.display = '';
                            });
                        } else {
                            // Milkdown not available, use textarea
                            if (milkdownWrapper) milkdownWrapper.style.display = 'none';
                            cardTextarea.style.display = '';
                        }
                    }
                    break;
                case 'cardCreated':
                    if (message.forBlockId) {
                        // Link to block instead of creating card
                        const block = blocks.find(b => b.id === message.forBlockId);
                        if (block) {
                            block.linkedFile = message.filePath;
                            const element = document.getElementById(message.forBlockId);
                            if (element) element.classList.add('linked');
                            saveState();
                        }
                    } else if (message.addToStash) {
                        addToStash(message.filePath);
                    } else {
                        addCard(message.filePath, message.x, message.y);
                    }
                    break;
                case 'fileRenamed':
                    // Card's linked file was renamed - update the card
                    const renamedCard = cards.find(c => c.id === message.cardId);
                    if (renamedCard) {
                        renamedCard.filePath = message.newPath;
                        // Update the filename display in the header
                        const cardElement = document.getElementById(message.cardId);
                        if (cardElement) {
                            const filenameSpan = cardElement.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'blockFileRenamed':
                    // Block's linked file was renamed - update the block
                    const renamedBlock = blocks.find(b => b.id === message.blockId);
                    if (renamedBlock) {
                        renamedBlock.linkedFile = message.newPath;
                        saveState();
                    }
                    break;
                case 'cardRenamed':
                    // Card was renamed via context menu
                    const cardToRename = cards.find(c => c.id === message.cardId);
                    if (cardToRename) {
                        cardToRename.filePath = message.newPath;
                        // Update the filename display in the header
                        const cardEl = document.getElementById(message.cardId);
                        if (cardEl) {
                            const filenameSpan = cardEl.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'cardMoved':
                    // Card was moved to another folder via context menu
                    const cardToMove = cards.find(c => c.id === message.cardId);
                    if (cardToMove) {
                        cardToMove.filePath = message.newPath;
                        // Update the filename display (path may have changed)
                        const movedCardEl = document.getElementById(message.cardId);
                        if (movedCardEl) {
                            const filenameSpan = movedCardEl.querySelector('.filename');
                            if (filenameSpan) {
                                filenameSpan.textContent = getFileName(message.newPath);
                            }
                        }
                        saveState();
                    }
                    break;
                case 'workspaceFolders':
                    // Received folder list for move modal
                    allWorkspaceFolders = message.folders;
                    filteredFolders = message.folders;
                    renderFolderList(message.folders);
                    break;
                case 'pinnedFileContent':
                    // Received content for pinned file in sidebar
                    const pinnedTextarea = document.getElementById('pinnedTextarea');
                    if (pinnedTextarea && message.filePath === currentPinnedFile) {
                        pinnedTextarea.value = message.content;
                    }
                    break;
                case 'stashCardFileRenamed':
                    // Stash card's linked file was renamed - update the stash card
                    const renamedStashCard = stashCards.find(s => s.id === message.stashCardId);
                    if (renamedStashCard) {
                        renamedStashCard.filePath = message.newPath;
                        // Re-render stash list to update UI
                        renderStash();
                        saveState();
                    }
                    break;
                case 'pinnedFileRenamed':
                    // Pinned file was renamed - update the pinned files list
                    const pinnedIndex = pinnedFiles.findIndex(f => {
                        const workspaceFolders = message.oldPath;
                        return f === message.oldPath;
                    });
                    if (pinnedIndex !== -1) {
                        pinnedFiles[pinnedIndex] = message.newPath;
                        // Update currentPinnedFile if it was the renamed one
                        if (currentPinnedFile === message.oldPath) {
                            currentPinnedFile = message.newPath;
                        }
                        // Re-render pinned files to update UI
                        renderPinnedFiles();
                        saveState();
                    }
                    break;
                case 'toggleSidebarTab':
                    // Handle sidebar tab toggle from keyboard shortcut
                    const targetTab = message.tabName;
                    const currentTab = getCurrentActiveTab();

                    if (!sidebarOpen) {
                        // Sidebar is closed - open it and switch to the target tab
                        sidebarOpen = true;
                        sidebar.classList.add('open');
                        switchTab(targetTab);
                    } else if (currentTab === targetTab) {
                        // Already on the target tab - close sidebar
                        sidebarOpen = false;
                        sidebar.classList.remove('open');
                    } else {
                        // Sidebar is open but on different tab - switch to target tab
                        switchTab(targetTab);
                    }
                    break;
            }
        });

        // Event listeners
        document.getElementById('addBlock').addEventListener('click', () => addBlock());
        document.getElementById('saveBtn').addEventListener('click', forceSave);
        document.getElementById('deleteBlockMenu').addEventListener('click', () => {
            if (contextCardId) {
                // Delete card - cleanup Milkdown first if exists
                if (window.milkdownManager && window.milkdownManager.hasEditor(contextCardId)) {
                    window.milkdownManager.destroyEditor(contextCardId);
                }
                cards = cards.filter(c => c.id !== contextCardId);
                const el = document.getElementById(contextCardId);
                if (el) el.remove();
                contextCardId = null;
                forceSave(); // Use forceSave for delete operations
                hideContextMenu();
                
                // Update sidebar card list if visible
                if (panelCards.classList.contains('active')) {
                    renderCardList();
                }
            } else {
                deleteBlock();
            }
        });
        document.getElementById('linkFileMenu').addEventListener('click', () => openFileSelector());
        document.getElementById('unlinkFileMenu').addEventListener('click', unlinkFile);

        // Card-specific context menu actions
        document.getElementById('renameCardMenu').addEventListener('click', () => {
            if (!contextCardId) return;
            const card = cards.find(c => c.id === contextCardId);
            if (card) {
                openRenameModal(card.id, card.filePath);
            }
            hideContextMenu();
        });

        document.getElementById('moveCardMenu').addEventListener('click', () => {
            if (!contextCardId) return;
            const card = cards.find(c => c.id === contextCardId);
            if (card) {
                openMoveModal(card.id, card.filePath);
            }
            hideContextMenu();
        });

        document.getElementById('fitContentMenu').addEventListener('click', () => {
            if (!contextCardId) return;
            const card = cards.find(c => c.id === contextCardId);
            const cardElement = document.getElementById(contextCardId);
            if (card && cardElement) {
                const textarea = cardElement.querySelector('textarea');
                if (textarea) {
                    // Get the header height (typically ~32px)
                    const header = cardElement.querySelector('.card-header');
                    const headerHeight = header ? header.offsetHeight : 32;
                    
                    // Calculate the new height based on text content
                    // Add padding for better visual appearance
                    const padding = 16; // some bottom padding
                    const newHeight = textarea.scrollHeight + headerHeight + padding;
                    
                    // Apply the new height (minimum 100px to avoid too small cards)
                    const finalHeight = Math.max(100, newHeight);
                    card.height = finalHeight;
                    cardElement.style.height = finalHeight + 'px';
                    
                    saveState();
                }
            }
            hideContextMenu();
        });

        // Canvas context menu
        document.getElementById('addBlockFromMenu').addEventListener('click', () => {
            addBlock(pendingCardPosition.x - 100, pendingCardPosition.y - 50);
            hideCanvasContextMenu();
        });
        document.getElementById('addCardFromMenu').addEventListener('click', () => openFileSelector(null, 'card'));

        // New card modal
        document.getElementById('createCardBtn').addEventListener('click', createNewCard);
        document.getElementById('closeNewCardModal').addEventListener('click', closeNewCardModal);
        document.getElementById('newCardFileName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') createNewCard();
            if (e.key === 'Escape') closeNewCardModal();
        });

        // Click outside modal to close (on the overlay background)
        document.getElementById('fileModal').addEventListener('click', (e) => {
            if (e.target.id === 'fileModal') {
                closeFileSelector();
            }
        });
        document.getElementById('newCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'newCardModal') {
                closeNewCardModal();
            }
        });

        // Rename card modal
        document.getElementById('confirmRenameBtn').addEventListener('click', confirmRename);
        document.getElementById('closeRenameModal').addEventListener('click', closeRenameModal);
        document.getElementById('renameCardInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmRename();
            if (e.key === 'Escape') closeRenameModal();
        });
        document.getElementById('renameCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'renameCardModal') {
                closeRenameModal();
            }
        });

        // Move card modal
        document.getElementById('folderSearchInput').addEventListener('input', (e) => {
            filterFolders(e.target.value);
        });
        document.getElementById('folderSearchInput').addEventListener('keydown', (e) => {
            const totalItems = flatFolderList.length;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedFolderIndex >= totalItems - 1) {
                    // At the end, wrap to input (-1)
                    selectedFolderIndex = -1;
                } else {
                    selectedFolderIndex = selectedFolderIndex + 1;
                }
                updateSelectedFolder();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedFolderIndex <= -1) {
                    // At input, jump to last item (bottom)
                    selectedFolderIndex = totalItems - 1;
                } else {
                    selectedFolderIndex = selectedFolderIndex - 1;
                }
                updateSelectedFolder();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedFolderIndex >= 0 && selectedFolderIndex < totalItems) {
                    selectFolder(flatFolderList[selectedFolderIndex]);
                }
            } else if (e.key === 'Escape') {
                closeMoveModal();
            }
        });
        document.getElementById('moveCardModal').addEventListener('click', (e) => {
            if (e.target.id === 'moveCardModal') {
                closeMoveModal();
            }
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (fileModal.classList.contains('active')) {
                    closeFileSelector();
                }
                if (newCardModal.classList.contains('active')) {
                    closeNewCardModal();
                }
                if (renameCardModal.classList.contains('active')) {
                    closeRenameModal();
                }
                if (moveCardModal.classList.contains('active')) {
                    closeMoveModal();
                }
            }
        });

        // Zoom controls - use viewport center and smooth animation
        document.getElementById('zoomIn').addEventListener('click', () => {
            setZoom(zoomLevel + 0.1, null, null, true);
        });
        document.getElementById('zoomOut').addEventListener('click', () => {
            setZoom(zoomLevel - 0.1, null, null, true);
        });
        document.getElementById('resetZoom').addEventListener('click', () => {
            // Smooth transition for reset
            whiteboard.style.transition = 'transform 0.3s ease-out';
            setZoom(1, null, null, false);
            centerWhiteboard();
            setTimeout(() => {
                whiteboard.style.transition = '';
            }, 300);
        });

        // Canvas panning with middle mouse button or Alt+drag
        let isPanning = false;
        let panStart = { x: 0, y: 0 };

        canvasContainer.addEventListener('mousedown', (e) => {
            // Middle mouse button (button 1) or Alt+left click for panning
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                canvasContainer.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }
            
            // Left click on empty canvas area - start selection box
            if (e.button === 0 && (e.target === whiteboard || e.target === canvasContainer)) {
                // Exit all editing modes when clicking empty area
                exitAllEditingModes();
                
                // Clear selection if not holding Shift
                if (!e.shiftKey) {
                    clearSelection();
                }
                startSelectionBox(e);
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isPanning) {
                panOffset.x = e.clientX - panStart.x;
                panOffset.y = e.clientY - panStart.y;
                
                // Use RAF for smooth panning - only schedule if not already pending
                if (!pendingPanUpdate) {
                    pendingPanUpdate = true;
                    requestAnimationFrame(() => {
                        updateWhiteboardTransform();
                        pendingPanUpdate = false;
                    });
                }
            }
            
            // Update selection box if selecting
            if (isSelecting) {
                updateSelectionBox(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isPanning) {
                isPanning = false;
                canvasContainer.style.cursor = 'grab';
            }
            
            // End selection box if selecting
            if (isSelecting) {
                endSelectionBox(e, e.shiftKey);
            }
        });

        // Cancel selection when mouse leaves the document/window
        document.addEventListener('mouseleave', () => {
            if (isSelecting) {
                cancelSelectionBox();
            }
            if (isPanning) {
                isPanning = false;
                canvasContainer.style.cursor = 'grab';
            }
        });

        // Cancel selection when window loses focus (e.g., clicking outside webview)
        window.addEventListener('blur', () => {
            if (isSelecting) {
                cancelSelectionBox();
            }
            if (isPanning) {
                isPanning = false;
                canvasContainer.style.cursor = 'grab';
            }
        });

        // Also cancel on visibility change (e.g., switching tabs)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && isSelecting) {
                cancelSelectionBox();
            }
        });


        // Also support Space+drag for panning (like in design tools)
        let spacePressed = false;
        document.addEventListener('keydown', (e) => {
            const isEditingTextarea = document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT';
            
            // Check if any Milkdown editor is focused or if we're in a contenteditable element
            let isEditingMilkdown = false;
            const activeEl = document.activeElement;
            if (activeEl) {
                // Check if inside a Milkdown container (either class name)
                const milkdownContainer = activeEl.closest('.milkdown-container') || activeEl.closest('.milkdown-editor-wrapper');
                if (milkdownContainer) {
                    isEditingMilkdown = true;
                }
                // Also check for contenteditable (Milkdown uses ProseMirror which uses contenteditable)
                // Check if the element itself or any ancestor is contenteditable
                if (activeEl.isContentEditable) {
                    isEditingMilkdown = true;
                }
            }
            
            const isEditing = isEditingTextarea || isEditingMilkdown;
            
            // Handle Cmd/Ctrl+Z (Undo) and Cmd/Ctrl+Shift+Z (Redo)
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
                if (isEditing) {
                    // Let native browser / Milkdown handle text undo/redo
                    // Milkdown has its own history plugin that handles undo/redo
                    return;
                }
                
                // Whiteboard undo/redo (position changes)
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                return;
            }
            
            // Handle Cmd/Ctrl + Plus/Minus for zoom (prevent VS Code native zoom)
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
                // Cmd + (Equal/NumpadAdd) = Zoom In
                if (e.code === 'Equal' || e.code === 'NumpadAdd') {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoom(zoomLevel + 0.1, null, null, true);
                    return;
                }
                // Cmd - (Minus/NumpadSubtract) = Zoom Out
                if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoom(zoomLevel - 0.1, null, null, true);
                    return;
                }
                // Cmd 0 = Reset Zoom
                if (e.code === 'Digit0' || e.code === 'Numpad0') {
                    e.preventDefault();
                    e.stopPropagation();
                    whiteboard.style.transition = 'transform 0.3s ease-out';
                    setZoom(1, null, null, false);
                    centerWhiteboard();
                    setTimeout(() => {
                        whiteboard.style.transition = '';
                    }, 300);
                    return;
                }
            }
            
            // Skip other keyboard shortcuts if editing text
            if (isEditing) {
                return;
            }
            
            if (e.code === 'Space' && !e.repeat) {
                spacePressed = true;
                canvasContainer.style.cursor = 'grab';
            }
            
            // Delete/Backspace to delete selected items
            if (e.code === 'Delete' || e.code === 'Backspace') {
                deleteSelectedItems();
                e.preventDefault();
            }
        });

        /**
         * Delete all selected blocks and cards
         */
        function deleteSelectedItems() {
            if (selectedBlocks.size === 0 && selectedCards.size === 0) return;
            
            const hadSelectedCards = selectedCards.size > 0;
            
            // Delete selected blocks
            selectedBlocks.forEach(blockId => {
                blocks = blocks.filter(b => b.id !== blockId);
                const element = document.getElementById(blockId);
                if (element) {
                    element.style.transform = 'scale(0)';
                    element.style.opacity = '0';
                    setTimeout(() => element.remove(), 200);
                }
            });
            
            // Delete selected cards
            selectedCards.forEach(cardId => {
                // Cleanup Milkdown first if exists
                if (window.milkdownManager && window.milkdownManager.hasEditor(cardId)) {
                    window.milkdownManager.destroyEditor(cardId);
                }
                cards = cards.filter(c => c.id !== cardId);
                const element = document.getElementById(cardId);
                if (element) {
                    element.style.transform = 'scale(0)';
                    element.style.opacity = '0';
                    setTimeout(() => element.remove(), 200);
                }
            });
            
            // Clear selection
            selectedBlocks.clear();
            selectedCards.clear();
            
            // Force save immediately for delete operations
            forceSave();
            
            // Update sidebar card list if cards were deleted and panel is visible
            if (hadSelectedCards && panelCards.classList.contains('active')) {
                renderCardList();
            }
        }


        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                if (!isPanning) {
                    canvasContainer.style.cursor = 'grab';
                }
            }
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            if (spacePressed && e.button === 0) {
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                canvasContainer.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        // Double-click to open select/create card modal
        canvasContainer.addEventListener('dblclick', (e) => {
            if (e.target === whiteboard || e.target === canvasContainer) {
                const pos = screenToWhiteboard(e.clientX, e.clientY);
                pendingCardPosition = { x: pos.x, y: pos.y };
                openFileSelector(null, 'card');
            }
        });

        // Hide context menus on click outside
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                hideContextMenu();
                // Reset visibility of sections for block context menu
                const colorSection = contextMenu.querySelector('.context-menu-section');
                if (colorSection) colorSection.style.display = '';
                const linkSection = document.getElementById('linkFileMenu');
                if (linkSection && linkSection.parentElement) linkSection.parentElement.style.display = '';
                // Hide card-specific actions
                const cardActionsSection = document.getElementById('cardActionsSection');
                if (cardActionsSection) cardActionsSection.style.display = 'none';
                contextCardId = null;
            }
            if (!canvasContextMenu.contains(e.target)) {
                hideCanvasContextMenu();
            }
        });

        // Canvas right-click context menu
        canvasContainer.addEventListener('contextmenu', (e) => {
            if (e.target === whiteboard || e.target === canvasContainer) {
                e.preventDefault();
                showCanvasContextMenu(e);
            }
        });

        // Drag and drop .md files from explorer or stash items
        canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            // Check if it's a stash item being dragged
            const types = e.dataTransfer.types;
            if (types.includes('application/x-stash-id')) {
                e.dataTransfer.dropEffect = 'move';
            } else {
                e.dataTransfer.dropEffect = 'copy';
                dropIndicator.classList.add('active');
            }
        });

        canvasContainer.addEventListener('dragleave', (e) => {
            if (!canvasContainer.contains(e.relatedTarget)) {
                dropIndicator.classList.remove('active');
            }
        });

        canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            dropIndicator.classList.remove('active');
            
            // Calculate drop position
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            const x = pos.x - 150;
            const y = pos.y - 100;
            
            // Check if dropping a stash item
            const stashId = e.dataTransfer.getData('application/x-stash-id');
            if (stashId) {
                // Restore from stash at drop position
                restoreFromStash(stashId, false, pos.x, pos.y);
                return;
            }
            
            // VS Code drag-drop provides file path in dataTransfer
            const files = e.dataTransfer.files;
            const uriList = e.dataTransfer.getData('text/uri-list');
            
            // Try to get relative path from VS Code
            if (uriList) {
                const uri = uriList.split('\\n')[0].trim();
                if (uri.endsWith('.md')) {
                    // Extract relative path - this may need adjustment based on VS Code's format
                    let filePath = decodeURIComponent(uri.replace('file://', ''));
                    // Try to make it relative if workspace info is available
                    addCard(filePath, x, y);
                }
            }
        });

        // Smooth Mouse wheel zoom and trackpad pan
        // Track where scroll gesture started to determine behavior
        let scrollStartedInEditingCard = false;
        let lastWheelTime = 0;
        const SCROLL_GESTURE_TIMEOUT = 150; // ms - reset scroll origin after this pause
        
        canvasContainer.addEventListener('wheel', (e) => {
            // ALWAYS allow zoom with Ctrl/Cmd regardless of any state
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomSensitivity = 0.004;
                const delta = -e.deltaY * zoomSensitivity;
                const newZoom = zoomLevel + delta;
                setZoom(newZoom, e.clientX, e.clientY);
                return;
            }

            const now = Date.now();

            // Reset scroll origin tracking if there's been a pause in scrolling
            if (now - lastWheelTime > SCROLL_GESTURE_TIMEOUT) {
                // New scroll gesture - check where it started
                const targetCard = e.target.closest('.card');
                scrollStartedInEditingCard = false;
                
                if (targetCard) {
                    // Check if this card is ACTUALLY being edited (must have 'editing' class)
                    const isActuallyEditing = targetCard.classList.contains('editing');

                    if (isActuallyEditing) {
                        // Check if this card is being edited with Milkdown
                        if (targetCard.classList.contains('using-milkdown')) {
                            const milkdownWrapper = targetCard.querySelector('.milkdown-editor-wrapper');
                            if (milkdownWrapper && milkdownWrapper.scrollHeight > milkdownWrapper.clientHeight) {
                                scrollStartedInEditingCard = true;
                            }
                        }
                        // Check textarea fallback
                        const activeElement = document.activeElement;
                        if (activeElement && activeElement.tagName === 'TEXTAREA') {
                            const editingCard = activeElement.closest('.card.editing, .block.editing');
                            if (editingCard === targetCard && activeElement.scrollHeight > activeElement.clientHeight) {
                                scrollStartedInEditingCard = true;
                            }
                        }
                    }
                }
            }
            lastWheelTime = now;
            
            // Only handle card scrolling if the gesture started inside an editing card
            if (scrollStartedInEditingCard) {
                const targetCard = e.target.closest('.card');
                
                if (targetCard) {
                    const cardRect = targetCard.getBoundingClientRect();
                    const isMouseInsideCard = e.clientX >= cardRect.left && e.clientX <= cardRect.right &&
                                              e.clientY >= cardRect.top && e.clientY <= cardRect.bottom;
                    
                    if (isMouseInsideCard) {
                        // Check for Milkdown editor first
                        const milkdownWrapper = targetCard.querySelector('.milkdown-editor-wrapper');
                        if (milkdownWrapper && targetCard.classList.contains('using-milkdown')) {
                            // Check if the Milkdown container can scroll
                            const canScrollUp = milkdownWrapper.scrollTop > 0;
                            const canScrollDown = milkdownWrapper.scrollTop < (milkdownWrapper.scrollHeight - milkdownWrapper.clientHeight);
                            const hasScroll = milkdownWrapper.scrollHeight > milkdownWrapper.clientHeight;
                            
                            if (hasScroll) {
                                // If scrolling and container can scroll in that direction, let it scroll
                                if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                                    e.stopPropagation();
                                    return;
                                }

                                // Container can't scroll in that direction, but has scrollbar
                                // Block panning to prevent accidental operations while editing
                                // (Ctrl/Cmd + wheel zoom is already handled at the start)
                                e.preventDefault();
                                return;
                            }
                        }
                        
                        // Check for textarea (fallback mode)
                        const activeElement = document.activeElement;
                        if (activeElement && activeElement.tagName === 'TEXTAREA') {
                            const textarea = activeElement;
                            const editingCard = textarea.closest('.card.editing, .block.editing');
                            
                            if (editingCard && editingCard === targetCard) {
                                // Check if the textarea can scroll
                                const canScrollUp = textarea.scrollTop > 0;
                                const canScrollDown = textarea.scrollTop < (textarea.scrollHeight - textarea.clientHeight);
                                const hasScroll = textarea.scrollHeight > textarea.clientHeight;
                                
                                if (hasScroll) {
                                    // If scrolling and textarea can scroll in that direction, let it scroll
                                    if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                                        e.stopPropagation();
                                        return;
                                    }

                                    // Textarea can't scroll in that direction, but has scrollbar
                                    // Block panning to prevent accidental operations while editing
                                    // (Ctrl/Cmd + wheel zoom is already handled at the start)
                                    e.preventDefault();
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            
            e.preventDefault();
            
            if (e.ctrlKey || e.metaKey) {
                // Pinch zoom (ctrl+wheel or trackpad pinch)
                // Smooth zoom calculation centered on mouse position
                const zoomSensitivity = 0.004;
                const delta = -e.deltaY * zoomSensitivity;
                const newZoom = zoomLevel + delta;
                
                // Zoom centered on mouse position
                setZoom(newZoom, e.clientX, e.clientY);
            } else {
                // Trackpad two-finger pan or regular scroll
                panOffset.x -= e.deltaX;
                panOffset.y -= e.deltaY;
                updateWhiteboardTransform();
            }
        }, { passive: false });

        // Load initial state
        vscode.postMessage({ command: 'requestState' });

        // ========== Sidebar Functions ==========
        
        /**
         * Initialize sidebar with loaded state data
         */
        function initSidebar() {
            // Initialize color filter options
            initColorFilter();
            
            // Render pinned files
            renderPinnedFiles();
            
            // Render card list
            renderCardList();
            
            // Render stash
            renderStash();
        }
        
        /**
         * Toggle sidebar open/close (overlay mode - doesn't push canvas)
         */
        function toggleSidebar() {
            sidebarOpen = !sidebarOpen;
            if (sidebarOpen) {
                sidebar.classList.add('open');
            } else {
                sidebar.classList.remove('open');
            }
        }
        
        /**
         * Switch sidebar tab
         */
        function switchTab(tabName) {
            // Update tab buttons
            [tabPinned, tabCards, tabStash].forEach(tab => tab.classList.remove('active'));
            [panelPinned, panelCards, panelStash].forEach(panel => panel.classList.remove('active'));

            if (tabName === 'pinned') {
                tabPinned.classList.add('active');
                panelPinned.classList.add('active');
            } else if (tabName === 'cards') {
                tabCards.classList.add('active');
                panelCards.classList.add('active');
                renderCardList(); // Refresh list when switching to this tab
            } else if (tabName === 'stash') {
                tabStash.classList.add('active');
                panelStash.classList.add('active');
                renderStash();
            }
        }

        /**
         * Get the currently active sidebar tab name
         */
        function getCurrentActiveTab() {
            if (tabPinned.classList.contains('active')) return 'pinned';
            if (tabCards.classList.contains('active')) return 'cards';
            if (tabStash.classList.contains('active')) return 'stash';
            return 'pinned'; // Default
        }
        
        // ========== Sidebar Resize ==========
        const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
        const sidebarResizeHandleBottom = document.getElementById('sidebarResizeHandleBottom');
        const sidebarResizeHandleCorner = document.getElementById('sidebarResizeHandleCorner');

        let isResizingSidebar = false;
        let isResizingSidebarHeight = false;
        let isResizingSidebarCorner = false;
        let sidebarStartWidth = 260;
        let sidebarStartHeight = 0;
        let sidebarStartX = 0;
        let sidebarStartY = 0;
        const MIN_SIDEBAR_WIDTH = 220;
        const MAX_SIDEBAR_WIDTH = 600;
        const MIN_SIDEBAR_HEIGHT = 300;
        const MAX_SIDEBAR_HEIGHT = window.innerHeight - 32;

        // Width resize (right edge)
        sidebarResizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizingSidebar = true;
            sidebarStartWidth = sidebar.offsetWidth;
            sidebarStartX = e.clientX;
            sidebarResizeHandle.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        // Height resize (bottom edge)
        sidebarResizeHandleBottom.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizingSidebarHeight = true;
            sidebarStartHeight = sidebar.offsetHeight;
            sidebarStartY = e.clientY;
            sidebarResizeHandleBottom.classList.add('resizing');
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        });

        // Corner resize (both width and height)
        sidebarResizeHandleCorner.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizingSidebarCorner = true;
            sidebarStartWidth = sidebar.offsetWidth;
            sidebarStartHeight = sidebar.offsetHeight;
            sidebarStartX = e.clientX;
            sidebarStartY = e.clientY;
            sidebarResizeHandleCorner.classList.add('resizing');
            document.body.style.cursor = 'nwse-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            // Width resize
            if (isResizingSidebar) {
                const dx = e.clientX - sidebarStartX;
                const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, sidebarStartWidth + dx));
                sidebar.style.width = newWidth + 'px';
            }

            // Height resize
            if (isResizingSidebarHeight) {
                const dy = e.clientY - sidebarStartY;
                const maxHeight = window.innerHeight - 32;
                const newHeight = Math.min(maxHeight, Math.max(MIN_SIDEBAR_HEIGHT, sidebarStartHeight + dy));
                sidebar.style.height = newHeight + 'px';
                sidebar.style.maxHeight = newHeight + 'px';
            }

            // Corner resize (both)
            if (isResizingSidebarCorner) {
                const dx = e.clientX - sidebarStartX;
                const dy = e.clientY - sidebarStartY;
                const maxHeight = window.innerHeight - 32;
                const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, sidebarStartWidth + dx));
                const newHeight = Math.min(maxHeight, Math.max(MIN_SIDEBAR_HEIGHT, sidebarStartHeight + dy));
                sidebar.style.width = newWidth + 'px';
                sidebar.style.height = newHeight + 'px';
                sidebar.style.maxHeight = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                sidebarResizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
            if (isResizingSidebarHeight) {
                isResizingSidebarHeight = false;
                sidebarResizeHandleBottom.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
            if (isResizingSidebarCorner) {
                isResizingSidebarCorner = false;
                sidebarResizeHandleCorner.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
        
        // Sidebar event listeners
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
        closeSidebarBtn.addEventListener('click', toggleSidebar);
        tabPinned.addEventListener('click', () => switchTab('pinned'));
        tabCards.addEventListener('click', () => switchTab('cards'));
        tabStash.addEventListener('click', () => switchTab('stash'));
        
        // Stash add card button
        document.getElementById('stashAddCard').addEventListener('click', () => {
            openFileSelector(null, 'stash');
        });
        
        // ========== Tab 1: Pinned Files ==========
        
        function renderPinnedFiles() {
            if (pinnedFiles.length === 0) {
                pinnedEmpty.style.display = 'flex';
                pinnedFileViewer.classList.remove('visible');
                pinnedFileViewer.innerHTML = '';
                currentPinnedFile = null;
                return;
            }

            pinnedEmpty.style.display = 'none';
            pinnedFileViewer.classList.add('visible');
            
            // For now, show the first pinned file
            if (!currentPinnedFile || !pinnedFiles.includes(currentPinnedFile)) {
                currentPinnedFile = pinnedFiles[0];
            }
            
            pinnedFileViewer.innerHTML = \`
                <div class="pinned-file-viewer">
                    <div class="pinned-file-header">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span class="filename">\${getFileName(currentPinnedFile)}</span>
                        <div class="pinned-file-actions">
                            <button class="open-pinned" title="Open in Editor">
                                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                    <polyline points="15 3 21 3 21 9"></polyline>
                                    <line x1="10" y1="14" x2="21" y2="3"></line>
                                </svg>
                            </button>
                            <button class="unpin-file" title="Unpin">
                                <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="pinned-file-content">
                        <textarea class="pinned-file-textarea" id="pinnedTextarea" placeholder="Loading..."></textarea>
                    </div>
                </div>
            \`;
            
            // Add event listeners
            pinnedFileViewer.querySelector('.open-pinned').addEventListener('click', () => {
                vscode.postMessage({ command: 'openFile', filePath: currentPinnedFile, splitView: true });
            });
            
            pinnedFileViewer.querySelector('.unpin-file').addEventListener('click', () => {
                pinnedFiles = pinnedFiles.filter(f => f !== currentPinnedFile);
                currentPinnedFile = null;
                renderPinnedFiles();
                saveState();
            });
            
            // Load file content
            vscode.postMessage({ command: 'readPinnedFileContent', filePath: currentPinnedFile });
            
            // Save on change with debounce
            const textarea = pinnedFileViewer.querySelector('#pinnedTextarea');
            let pinnedSaveTimeout;
            textarea.addEventListener('input', () => {
                clearTimeout(pinnedSaveTimeout);
                pinnedSaveTimeout = setTimeout(() => {
                    vscode.postMessage({ 
                        command: 'savePinnedFileContent', 
                        filePath: currentPinnedFile, 
                        content: textarea.value 
                    });
                }, 500);
            });
        }
        
        selectPinnedFileBtn.addEventListener('click', () => {
            openFileSelector(null, 'pinned');
        });
        
        // ========== Tab 2: Card List ==========
        
        function initColorFilter() {
            // Clear existing swatches
            colorFilterGrid.innerHTML = '';
            
            // Add "All colors" option first
            const allColorsOption = document.createElement('div');
            allColorsOption.className = 'color-filter-option all-colors active';
            allColorsOption.dataset.color = '';
            allColorsOption.title = '所有顏色';
            allColorsOption.addEventListener('click', () => selectColorFilter(''));
            colorFilterGrid.appendChild(allColorsOption);
            
            // Add color swatches
            colors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'color-filter-option';
                swatch.style.background = color;
                swatch.dataset.color = color;
                swatch.addEventListener('click', () => selectColorFilter(color));
                colorFilterGrid.appendChild(swatch);
            });
        }
        
        function selectColorFilter(color) {
            currentColorFilter = color;
            
            // Update active state
            colorFilterGrid.querySelectorAll('.color-filter-option').forEach(opt => {
                if (opt.dataset.color === color) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
            
            renderCardList();
        }

        
        function formatTimeAgo(timestamp) {
            if (!timestamp) return '';
            const now = Date.now();
            const diff = now - timestamp;
            
            const minutes = Math.floor(diff / (1000 * 60));
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (minutes < 1) return '剛剛';
            if (minutes < 60) return minutes + ' 分鐘前';
            if (hours < 24) return hours + ' 小時前';
            if (days < 30) return days + ' 天前';
            return new Date(timestamp).toLocaleDateString();
        }
        
        function renderCardList() {
            // Filter and sort cards
            let filteredCards = [...cards];
            
            if (currentColorFilter) {
                filteredCards = filteredCards.filter(c => c.color === currentColorFilter);
            }
            
            // Sort by lastModified (newest first)
            filteredCards.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            
            if (filteredCards.length === 0) {
                cardListElem.style.display = 'none';
                cardListEmpty.style.display = 'block';
                cardListEmpty.textContent = currentColorFilter ? '沒有符合篩選的卡片' : '白板中沒有卡片';
                return;
            }
            
            cardListElem.style.display = 'flex';
            cardListEmpty.style.display = 'none';
            
            cardListElem.innerHTML = filteredCards.map(card => \`
                <div class="card-list-item" data-card-id="\${card.id}" draggable="true">
                    <div class="color-dot" style="background: \${card.color || '#4b5563'}"></div>
                    <div class="card-info">
                        <div class="card-name">\${getFileName(card.filePath)}</div>
                    </div>
                </div>
            \`).join('');
            
            // Add click listeners to navigate to card or open file
            cardListElem.querySelectorAll('.card-list-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const cardId = item.dataset.cardId;
                    const card = cards.find(c => c.id === cardId);
                    
                    if (e.metaKey && card) {
                        // Cmd+click: Open file in full screen (not split view)
                        vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: false });
                    } else if (e.altKey && card) {
                        // Option+click: Open file in split view (side panel)
                        vscode.postMessage({ command: 'openFile', filePath: card.filePath, splitView: true });
                    } else {
                        // Regular click: Navigate to card on whiteboard
                        navigateToCard(cardId);
                    }
                });
                
                // Add drag listener for stash
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', item.dataset.cardId);
                    e.dataTransfer.effectAllowed = 'move';
                    cardBeingDraggedToStash = item.dataset.cardId;
                });
                
                item.addEventListener('dragend', () => {
                    cardBeingDraggedToStash = null;
                });
            });
        }
        
        function navigateToCard(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (!card) return;
            
            const cardEl = document.getElementById(cardId);
            if (!cardEl) return;
            
            // Calculate the center position of the card
            const cardCenterX = card.x + (card.width || 280) / 2;
            const cardCenterY = card.y + (card.height || 200) / 2;
            
            // Calculate the viewport center
            const viewportCenterX = canvasContainer.clientWidth / 2;
            const viewportCenterY = canvasContainer.clientHeight / 2;
            
            // Calculate new pan offset to center the card
            panOffset.x = viewportCenterX - cardCenterX * zoomLevel;
            panOffset.y = viewportCenterY - cardCenterY * zoomLevel;
            
            // Smooth transition
            whiteboard.style.transition = 'transform 0.3s ease-out';
            updateWhiteboardTransform();
            
            setTimeout(() => {
                whiteboard.style.transition = '';
            }, 300);
            
            // Highlight the card briefly
            cardEl.classList.add('selected');
            clearSelection();
            selectedCards.add(cardId);
        }
        
        // ========== Tab 3: Stash ==========
        
        function renderStash() {
            const panelStash = document.getElementById('panelStash');
            
            if (stashCards.length === 0) {
                stashListElem.style.display = 'none';
                stashDropzone.classList.remove('hidden');
                panelStash.classList.remove('has-items');
                return;
            }
            
            // Hide dropzone when there are items, show list
            stashDropzone.classList.add('hidden');
            stashListElem.style.display = 'flex';
            panelStash.classList.add('has-items');
            
            // Sort by lastModified (newest first)
            const sortedStash = [...stashCards].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            
            stashListElem.innerHTML = sortedStash.map(item => \`
                <div class="stash-item" data-stash-id="\${item.id}" draggable="true">
                    <div class="color-dot" style="background: \${item.color || '#4b5563'}"></div>
                    <div class="stash-info">
                        <div class="stash-name">\${getFileName(item.filePath)}</div>
                    </div>
                    <div class="stash-item-actions">
                        <button class="restore" title="恢復到原位置">
                            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                        </button>
                        <button class="delete" title="永久刪除">
                            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            \`).join('');
            
            // Add event listeners for stash items
            stashListElem.querySelectorAll('.stash-item').forEach(item => {
                const stashId = item.dataset.stashId;
                const stashItem = stashCards.find(s => s.id === stashId);
                
                // Click handler for Cmd+click and Option+click to open file
                item.addEventListener('click', (e) => {
                    // Don't trigger if clicking on action buttons
                    if (e.target.closest('.stash-item-actions')) return;
                    
                    if (e.metaKey && stashItem) {
                        // Cmd+click: Open file in full screen (not split view)
                        vscode.postMessage({ command: 'openFile', filePath: stashItem.filePath, splitView: false });
                    } else if (e.altKey && stashItem) {
                        // Option+click: Open file in split view (side panel)
                        vscode.postMessage({ command: 'openFile', filePath: stashItem.filePath, splitView: true });
                    }
                    // Regular click: no action (user can use restore button)
                });
                
                item.querySelector('.restore').addEventListener('click', (e) => {
                    e.stopPropagation();
                    restoreFromStash(stashId, true); // true = use original position
                });
                
                item.querySelector('.delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteFromStash(stashId);
                });
                
                // Enable drag to restore
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('application/x-stash-id', stashId);
                    e.dataTransfer.effectAllowed = 'move';
                    item.classList.add('dragging');
                });
                
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });
            });
        }
        
        function moveCardToStash(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (!card) return;
            
            // Add to stash with original position
            stashCards.push({
                id: card.id,
                filePath: card.filePath,
                color: card.color,
                lastModified: Date.now(),
                originalX: card.x,
                originalY: card.y,
                originalWidth: card.width || 280,
                originalHeight: card.height || 200
            });
            
            // Remove from whiteboard - cleanup Milkdown first
            if (window.milkdownManager && window.milkdownManager.hasEditor(cardId)) {
                window.milkdownManager.destroyEditor(cardId);
            }
            cards = cards.filter(c => c.id !== cardId);
            const cardEl = document.getElementById(cardId);
            if (cardEl) {
                cardEl.style.transform = 'scale(0)';
                cardEl.style.opacity = '0';
                setTimeout(() => cardEl.remove(), 200);
            }
            
            renderStash();
            renderCardList();
            saveState();
            renderStash();
            renderCardList();
            saveState();
        }

        function addToStash(filePath) {
            // Check if this file is already in stash
            const alreadyInStash = stashCards.some(card => card.filePath === filePath);
            if (alreadyInStash) {
                // Switch to stash tab to show the existing card
                if (!panelStash.classList.contains('active')) {
                    switchTab('stash');
                }
                return; // Don't add duplicate
            }

            const id = 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            stashCards.push({
                id: id,
                filePath: filePath,
                color: null, // default
                lastModified: Date.now()
                // No original position data for new cards
            });

            // Switch to stash tab if not already active (e.g. if adding from file selector)
            if (!panelStash.classList.contains('active')) {
                switchTab('stash');
            }

            renderStash();
            saveState();
        }
        
        /**
         * Restore a card from stash to whiteboard
         * @param stashId - ID of the stash item
         * @param useOriginalPosition - If true, restore to original position; if false, use provided position or center
         * @param dropX - Optional X position for drop restore
         * @param dropY - Optional Y position for drop restore
         */
        function restoreFromStash(stashId, useOriginalPosition = false, dropX = null, dropY = null) {
            const stashItem = stashCards.find(s => s.id === stashId);
            if (!stashItem) return;
            
            let x, y, width, height;
            
            if (useOriginalPosition && stashItem.originalX !== undefined) {
                // Restore to original position (from restore button)
                x = stashItem.originalX;
                y = stashItem.originalY;
                width = stashItem.originalWidth || 280;
                height = stashItem.originalHeight || 200;
            } else if (dropX !== null && dropY !== null) {
                // Restore to drop position (from drag & drop)
                x = dropX - 140;
                y = dropY - 100;
                width = stashItem.originalWidth || 280;
                height = stashItem.originalHeight || 200;
            } else {
                // Fallback to center of viewport
                const centerPos = screenToWhiteboard(canvasContainer.clientWidth / 2, canvasContainer.clientHeight / 2);
                x = centerPos.x - 140;
                y = centerPos.y - 100;
                width = 280;
                height = 200;
            }
            
            // Create new card at the determined position
            const newCard = {
                id: stashItem.id,
                x: x,
                y: y,
                width: width,
                height: height,
                filePath: stashItem.filePath,
                color: stashItem.color,
                lastModified: Date.now()
            };
            
            cards.push(newCard);
            const element = createCardElement(newCard);
            whiteboard.appendChild(element);
            vscode.postMessage({ command: 'readCardContent', cardId: newCard.id, filePath: newCard.filePath });
            
            // Remove from stash
            stashCards = stashCards.filter(s => s.id !== stashId);
            
            renderStash();
            renderCardList();
            saveState();
            
            // If restoring to original position, navigate to the card
            if (useOriginalPosition) {
                setTimeout(() => navigateToCard(newCard.id), 100);
            }
        }
        
        function deleteFromStash(stashId) {
            stashCards = stashCards.filter(s => s.id !== stashId);
            renderStash();
            saveState();
        }
        
        // Stash dropzone events
        stashDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            stashDropzone.classList.add('drag-over');
        });
        
        stashDropzone.addEventListener('dragleave', (e) => {
            stashDropzone.classList.remove('drag-over');
        });
        
        stashDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            stashDropzone.classList.remove('drag-over');
            
            const cardId = e.dataTransfer.getData('text/plain');
            if (cardId && cards.find(c => c.id === cardId)) {
                moveCardToStash(cardId);
                // Switch to stash tab
                switchTab('stash');
            }
        });
        
        // Make cards on whiteboard draggable to stash
        function enableCardDragToStash(cardElement, card) {
            cardElement.setAttribute('draggable', 'true');
            
            cardElement.addEventListener('dragstart', (e) => {
                // Only allow drag from header
                if (!e.target.closest('.card-header')) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.setData('text/plain', card.id);
                e.dataTransfer.effectAllowed = 'move';
                cardBeingDraggedToStash = card.id;
                cardElement.style.opacity = '0.5';
            });
            
            cardElement.addEventListener('dragend', () => {
                cardBeingDraggedToStash = null;
                cardElement.style.opacity = '1';
            });
        }
        
        // Update card's lastModified when content changes
        function updateCardLastModified(cardId) {
            const card = cards.find(c => c.id === cardId);
            if (card) {
                card.lastModified = Date.now();
            }
        }

        // Center the whiteboard view on cards bounding box, or whiteboard center if no cards
        function centerWhiteboard() {
            const containerWidth = canvasContainer.clientWidth;
            const containerHeight = canvasContainer.clientHeight;

            // If there are cards, center on the bounding box of all cards
            if (cards.length > 0) {
                // Calculate bounding box of all cards
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;

                for (const card of cards) {
                    minX = Math.min(minX, card.x);
                    minY = Math.min(minY, card.y);
                    maxX = Math.max(maxX, card.x + (card.width || 300));
                    maxY = Math.max(maxY, card.y + (card.height || 200));
                }

                // Calculate center of bounding box
                const boundsCenterX = (minX + maxX) / 2;
                const boundsCenterY = (minY + maxY) / 2;

                // Set pan offset so that the bounding box center is at the screen center
                // Screen center in whiteboard coordinates should equal boundsCenterX/Y
                // Formula: screenCenter = panOffset + boundsCenterX * zoomLevel
                // So: panOffset = screenCenter - boundsCenterX * zoomLevel
                panOffset.x = (containerWidth / 2) - boundsCenterX * zoomLevel;
                panOffset.y = (containerHeight / 2) - boundsCenterY * zoomLevel;
            } else {
                // No cards, center on whiteboard absolute center
                const whiteboardWidth = whiteboard.offsetWidth;
                const whiteboardHeight = whiteboard.offsetHeight;

                const centerX = (whiteboardWidth - containerWidth) / 2;
                const centerY = (whiteboardHeight - containerHeight) / 2;

                panOffset.x = -centerX;
                panOffset.y = -centerY;
            }

            updateWhiteboardTransform();
        }
        
        // Center on initial load
        setTimeout(centerWhiteboard, 100);

        // Icons are now inline SVGs, no initialization needed
`;

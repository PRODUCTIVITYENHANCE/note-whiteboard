// Whiteboard Canvas HTML Template
// Auto-extracted from WhiteboardPanel.ts

export const whiteboardTemplate = `
<!-- Sidebar -->
    <div id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-tabs">
                <button class="sidebar-tab active" id="tabPinned" title="常用文件">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </button>
                <button class="sidebar-tab" id="tabCards" title="卡片清單">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </button>
                <button class="sidebar-tab" id="tabStash" title="暫存區">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                </button>
            </div>
            <button class="sidebar-close" id="closeSidebar" title="關閉側邊欄">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div class="sidebar-content">
            <!-- Tab 1: Pinned Files -->
            <div class="sidebar-panel active" id="panelPinned">
                <div class="pinned-files-empty" id="pinnedEmpty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <div>尚無固定的文件</div>
                    <button class="select-file-btn" id="selectPinnedFile">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Select file
                    </button>
                </div>
                <div id="pinnedFileViewer" style="display: none;"></div>
            </div>

            <!-- Tab 2: Card List -->
            <div class="sidebar-panel" id="panelCards">
                <div class="card-list-controls">
                    <select class="color-filter" id="colorFilter">
                        <option value="">所有顏色</option>
                    </select>
                </div>
                <div class="card-list" id="cardList"></div>
                <div class="card-list-empty" id="cardListEmpty" style="display: none;">
                    白板中沒有卡片
                </div>
            </div>

            <!-- Tab 3: Stash -->
            <div class="sidebar-panel" id="panelStash">
                <div class="stash-dropzone" id="stashDropzone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <div>拖曳卡片到此處暫存</div>
                </div>
                <div class="stash-list" id="stashList"></div>
                <div class="stash-empty" id="stashEmpty" style="display: none;">
                    暫存區是空的
                </div>
            </div>
        </div>
    </div>

    <div id="toolbar">
        <button class="toolbar-btn" id="toggleSidebar" title="Toggle Sidebar"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg></button>
        <button class="toolbar-btn" id="addBlock" title="Add Block (or double-click canvas)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <button class="toolbar-btn" id="saveBtn" title="Save"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg></button>
    </div>

    <div id="zoom-controls">
        <button class="zoom-btn" id="zoomOut"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <div class="zoom-level" id="zoomLevel">100%</div>
        <button class="zoom-btn" id="zoomIn"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <button class="zoom-btn" id="resetZoom" title="Reset Zoom"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg></button>
    </div>

    <div id="canvas-container">
        <div id="whiteboard"></div>
    </div>

    <div class="context-menu" id="contextMenu">
        <div class="context-menu-section">
            <div class="context-menu-label">Color</div>
            <div class="color-grid" id="colorGrid"></div>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-item" id="linkFileMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                <span>Link to .md file</span>
            </div>
            <div class="context-menu-item" id="unlinkFileMenu" style="display: none;">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"></path><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"></path><line x1="8" y1="2" x2="8" y2="5"></line><line x1="2" y1="8" x2="5" y2="8"></line><line x1="16" y1="19" x2="16" y2="22"></line><line x1="19" y1="16" x2="22" y2="16"></line></svg>
                <span>Unlink file</span>
            </div>
        </div>
        <div class="context-menu-section" id="cardActionsSection" style="display: none;">
            <div class="context-menu-item" id="renameCardMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
                <span>Rename</span>
            </div>
            <div class="context-menu-item" id="moveCardMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg>
                <span>Move to...</span>
            </div>
        </div>
        <div class="context-menu-section">
            <div class="context-menu-item danger" id="deleteBlockMenu">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                <span>Delete</span>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="fileModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Select Markdown File</h3>
            <input type="text" class="file-search-input" id="fileSearchInput" placeholder="搜尋檔案名稱...">
            <div class="file-list-container">
                <div class="file-list" id="fileList"></div>
                <div class="new-file-item" id="newFileItem">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                    <span>建立新檔案...</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Canvas Context Menu -->
    <div class="canvas-context-menu" id="canvasContextMenu">
        <div class="context-menu-item" id="addBlockFromMenu">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
            <span>Add Block</span>
        </div>
        <div class="context-menu-item" id="addCardFromMenu">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
            <span>Add Card (.md)</span>
        </div>
    </div>

    <!-- New Card Modal -->
    <div class="modal-overlay" id="newCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg> Create New Card</h3>
            <input type="text" class="modal-input" id="newCardFileName" placeholder="Enter filename (e.g. my-notes)">
            <div class="modal-actions">
                <button class="modal-btn" id="createCardBtn">Create</button>
                <button class="modal-btn" id="closeNewCardModal" style="background: transparent; border: 1px solid #333;">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Rename Card Modal -->
    <div class="modal-overlay" id="renameCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg> Rename Card</h3>
            <input type="text" class="modal-input" id="renameCardInput" placeholder="Enter new filename">
            <div class="modal-actions">
                <button class="modal-btn" id="confirmRenameBtn">Rename</button>
                <button class="modal-btn" id="closeRenameModal" style="background: transparent; border: 1px solid #333;">Cancel</button>
            </div>
        </div>
    </div>

    <!-- Move Card Modal (Folder Selector) -->
    <div class="modal-overlay" id="moveCardModal">
        <div class="modal">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg> Move to Folder</h3>
            <input type="text" class="file-search-input" id="folderSearchInput" placeholder="搜尋資料夾...">
            <div class="file-list-container">
                <div class="file-list" id="folderList"></div>
            </div>
        </div>
    </div>

    <!-- Drop Indicator -->
    <div class="drop-indicator" id="dropIndicator">
        <span><svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M12 18v-6"></path><path d="m9 15 3 3 3-3"></path></svg> Drop .md file to create card</span>
    </div>
`;

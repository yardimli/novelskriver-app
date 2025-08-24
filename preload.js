const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
	// --- Dashboard/Novel Creation ---
	getNovelsWithCovers: () => ipcRenderer.invoke('novels:getAllWithCovers'),
	getOneNovel: (novelId) => ipcRenderer.invoke('novels:getOne', novelId),
	createNovel: (data) => ipcRenderer.invoke('novels:store', data),
	openEditor: (novelId) => ipcRenderer.send('novels:openEditor', novelId),
	getSeries: () => ipcRenderer.invoke('series:getAll'),
	createSeries: (data) => ipcRenderer.invoke('series:store', data),
	generateTitle: () => ipcRenderer.invoke('novels:generateTitle'),
	getAuthors: () => ipcRenderer.invoke('authors:getDistinct'),
	
	getStructureFiles: () => ipcRenderer.invoke('files:getStructureFiles'),
	generateStructure: (data) => ipcRenderer.invoke('novels:generateStructure', data),
	
	onCoverUpdated: (callback) => ipcRenderer.on('novels:cover-updated', callback),
	
	// --- Editor Specific APIs ---
	
	// NEW: Template fetching
	getTemplate: (templateName) => ipcRenderer.invoke('templates:get', templateName),
	
	// State Management
	saveEditorState: (novelId, state) => ipcRenderer.invoke('editor:saveState', novelId, state),
	
	// Window Content Fetching
	getChapterHtml: (chapterId) => ipcRenderer.invoke('chapters:getOneHtml', chapterId),
	getCodexEntryHtml: (entryId) => ipcRenderer.invoke('codex-entries:getOneHtml', entryId),
	
	// Chapter <-> Codex Linking
	attachCodexToChapter: (chapterId, codexEntryId) => ipcRenderer.invoke('chapters:codex:attach', chapterId, codexEntryId),
	detachCodexFromChapter: (chapterId, codexEntryId) => ipcRenderer.invoke('chapters:codex:detach', chapterId, codexEntryId),
	
	// Codex Entry Management
	createCodexEntry: (novelId, formData) => ipcRenderer.invoke('codex-entries:store', novelId, formData),
	updateCodexEntry: (entryId, data) => ipcRenderer.invoke('codex-entries:update', entryId, data),
	
	// Codex <-> Codex Linking
	attachCodexToCodex: (parentEntryId, linkedEntryId) => ipcRenderer.invoke('codex-entries:link:attach', parentEntryId, linkedEntryId),
	detachCodexFromCodex: (parentEntryId, linkedEntryId) => ipcRenderer.invoke('codex-entries:link:detach', parentEntryId, linkedEntryId),
	
	// Codex AI & Image Actions
	processCodexText: (entryId, data) => ipcRenderer.invoke('codex-entries:process-text', entryId, data),
	getModels: () => ipcRenderer.invoke('ai:getModels'), // NEW
	generateCodexImage: (entryId, prompt) => ipcRenderer.invoke('codex-entries:generate-image', entryId, prompt),
	uploadCodexImage: (entryId, filePath) => ipcRenderer.invoke('codex-entries:upload-image', entryId, filePath),
	
	// File Dialog
	showOpenImageDialog: () => ipcRenderer.invoke('dialog:showOpenImage'),
});

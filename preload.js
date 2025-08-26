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
	updateProseSettings: (data) => ipcRenderer.invoke('novels:updateProseSettings', data),
	
	updateNovelMeta: (data) => ipcRenderer.invoke('novels:updateMeta', data),
	// MODIFIED: Replaced specific cover actions with a generic update handler and new AI helpers.
	updateNovelCover: (data) => ipcRenderer.invoke('novels:updateCover', data),
	deleteNovel: (novelId) => ipcRenderer.invoke('novels:delete', novelId),
	
	// NEW: Added API points for the new AI cover generation flow.
	aiGenerateCoverPrompt: (novelId) => ipcRenderer.invoke('ai:generateCoverPrompt', novelId),
	aiGenerateImageFromPrompt: (prompt) => ipcRenderer.invoke('ai:generateImageFromPrompt', prompt),
	
	getStructureFiles: () => ipcRenderer.invoke('files:getStructureFiles'),
	generateStructure: (data) => ipcRenderer.invoke('novels:generateStructure', data),
	
	onCoverUpdated: (callback) => ipcRenderer.on('novels:cover-updated', callback),
	
	// --- Editor Specific APIs ---
	
	getTemplate: (templateName) => ipcRenderer.invoke('templates:get', templateName),
	
	// State Management
	saveEditorState: (novelId, state) => ipcRenderer.invoke('editor:saveState', novelId, state),
	
	// Window Content Fetching
	getChapterHtml: (chapterId) => ipcRenderer.invoke('chapters:getOneHtml', chapterId),
	getCodexEntryHtml: (entryId) => ipcRenderer.invoke('codex-entries:getOneHtml', entryId),
	
	// Chapter <-> Codex Linking
	attachCodexToChapter: (chapterId, codexEntryId) => ipcRenderer.invoke('chapters:codex:attach', chapterId, codexEntryId),
	detachCodexFromChapter: (chapterId, codexEntryId) => ipcRenderer.invoke('chapters:codex:detach', chapterId, codexEntryId),
	
	updateChapterContent: (chapterId, data) => ipcRenderer.invoke('chapters:updateContent', chapterId, data),
	
	// Codex Entry Management
	createCodexEntry: (novelId, formData) => ipcRenderer.invoke('codex-entries:store', novelId, formData),
	updateCodexEntry: (entryId, data) => ipcRenderer.invoke('codex-entries:update', entryId, data),
	
	// Codex <-> Codex Linking
	attachCodexToCodex: (parentEntryId, linkedEntryId) => ipcRenderer.invoke('codex-entries:link:attach', parentEntryId, linkedEntryId),
	detachCodexFromCodex: (parentEntryId, linkedEntryId) => ipcRenderer.invoke('codex-entries:link:detach', parentEntryId, linkedEntryId),
	
	// Codex AI & Image Actions
	processCodexTextStream: (data, onData) => {
		const channel = `ai-text-chunk-${Date.now()}-${Math.random()}`;
		
		const listener = (event, payload) => {
			onData(payload);
			if (payload.done || payload.error) {
				ipcRenderer.removeListener(channel, listener);
			}
		};
		
		ipcRenderer.on(channel, listener);
		ipcRenderer.send('codex-entries:process-text-stream', { data, channel });
		
		return () => {
			ipcRenderer.removeListener(channel, listener);
		};
	},
	getModels: () => ipcRenderer.invoke('ai:getModels'),
	generateCodexImage: (entryId, prompt) => ipcRenderer.invoke('codex-entries:generate-image', entryId, prompt),
	uploadCodexImage: (entryId, filePath) => ipcRenderer.invoke('codex-entries:upload-image', entryId, filePath),
	
	// File Dialog
	showOpenImageDialog: () => ipcRenderer.invoke('dialog:showOpenImage'),
});

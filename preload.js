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
	
	// NEW: Expose structure generation functions
	getStructureFiles: () => ipcRenderer.invoke('files:getStructureFiles'),
	generateStructure: (data) => ipcRenderer.invoke('novels:generateStructure', data),
	
	onCoverUpdated: (callback) => ipcRenderer.on('novels:cover-updated', callback),
	
	// --- Editor Specific APIs (to be implemented later) ---
	// ...
});

import WindowManager from './WindowManager.js';
import { setupCodexEntryHandler, setupChapterHandler, setupThemeToggle, setupOpenWindowsMenu, setupCanvasControls } from './eventHandlers.js';
import { setupChapterEditor } from './chapter-editor.js';
import { setupCodexContentEditor } from './codex-content-editor.js';
import { setupTopToolbar } from './toolbar.js';
import './codex-entry-editor.js'; // Import for side-effects (attaches event listeners)

/**
 * Initializes the novel editor's multi-window desktop environment.
 * This script acts as the main entry point, wiring together the WindowManager
 * and all related UI event handlers.
 */
document.addEventListener('DOMContentLoaded', async () => { // MODIFIED: Made async
	const viewport = document.getElementById('viewport');
	const desktop = document.getElementById('desktop');
	const taskbar = document.getElementById('taskbar');
	
	// MODIFIED: Get novelId from URL query parameters.
	const params = new URLSearchParams(window.location.search);
	const novelId = params.get('novelId');
	
	if (!viewport || !desktop || !taskbar || !novelId) {
		console.error('Essential novel editor elements or novelId are missing.');
		document.body.innerHTML = '<p class="text-red-500 p-8">Error: Could not load editor. Novel ID is missing.</p>';
		return;
	}
	
	// NEW: Set novelId on the body for other scripts to access.
	document.body.dataset.novelId = novelId;
	
	// NEW: Fetch initial novel data and populate templates.
	try {
		const novelData = await window.api.getOneNovel(novelId);
		if (!novelData) throw new Error('Novel not found.');
		
		// This is a simplified way to populate templates. A more robust solution
		// would involve a templating engine or more structured DOM manipulation.
		// For now, we'll just store the data for the WindowManager to use.
		window.initialNovelData = novelData;
		document.title = `Editing: ${novelData.title} - Novel Writer`;
		
	} catch (error) {
		console.error('Failed to load initial novel data:', error);
		document.body.innerHTML = `<p class="text-red-500 p-8">Error: Could not load novel data. ${error.message}</p>`;
		return;
	}
	
	const windowManager = new WindowManager(desktop, taskbar, novelId, viewport);
	
	windowManager.initCanvas();
	
	windowManager.loadState();
	
	// Initialize event handlers for various UI interactions.
	setupTopToolbar();
	setupCodexEntryHandler(desktop, windowManager);
	setupChapterHandler(desktop, windowManager);
	setupChapterEditor(desktop);
	setupCodexContentEditor(desktop);
	setupThemeToggle();
	setupOpenWindowsMenu(windowManager);
	setupCanvasControls(windowManager);
});

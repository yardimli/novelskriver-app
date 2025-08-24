import WindowManager from './WindowManager.js';
import { setupCodexEntryHandler, setupChapterHandler, setupOpenWindowsMenu, setupCanvasControls } from './eventHandlers.js';
import { setupChapterEditor } from './chapter-editor.js';
import { setupCodexContentEditor } from './codex-content-editor.js';
import { setupTopToolbar } from './toolbar.js';
import './codex-entry-editor.js'; // Import for side-effects (attaches event listeners)

/**
 * NEW: Populates the outline window template with novel data.
 * @param {string} template - The raw HTML template string.
 * @param {object} novelData - The full novel data object.
 * @returns {string} - The populated HTML string.
 */
function populateOutlineTemplate(template, novelData) {
	if (!novelData.sections || novelData.sections.length === 0) {
		return '<p class="text-center text-base-content/70 p-4">No sections found for this novel.</p>';
	}
	
	const sectionsHtml = novelData.sections.map(section => {
		const chaptersHtml = section.chapters && section.chapters.length > 0
			? section.chapters.map(chapter => `
                <button type="button"
                        class="js-open-chapter btn btn-ghost w-full justify-start text-left h-auto p-2"
                        data-chapter-id="${chapter.id}"
                        data-chapter-title="${chapter.title}">
                    <div class="flex flex-col">
                        <h4 class="font-semibold">${chapter.chapter_order}. ${chapter.title}</h4>
                        ${chapter.summary ? `<p class="text-xs text-base-content/70 mt-1 font-normal normal-case">${chapter.summary}</p>` : ''}
                    </div>
                </button>
            `).join('')
			: '<p class="text-sm text-base-content/70 px-2">No chapters in this section yet.</p>';
		
		return `
            <div class="p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors">
                <h3 class="text-lg font-bold text-indigo-500">${section.section_order}. ${section.title}</h3>
                ${section.description ? `<p class="text-sm italic text-base-content/70 mt-1">${section.description}</p>` : ''}
                <div class="mt-3 pl-4 border-l-2 border-base-300 space-y-2">${chaptersHtml}</div>
            </div>
        `;
	}).join('');
	
	return template.replace('<!-- SECTIONS_PLACEHOLDER -->', sectionsHtml);
}

/**
 * NEW: Populates the codex window template with novel data.
 * @param {string} template - The raw HTML template string.
 * @param {object} novelData - The full novel data object.
 * @returns {string} - The populated HTML string.
 */
function populateCodexTemplate(template, novelData) {
	if (!novelData.codexCategories || novelData.codexCategories.length === 0) {
		return '<p class="text-center text-base-content/70 p-4">No codex categories found.</p>';
	}
	
	const categoriesHtml = novelData.codexCategories.map(category => {
		const entriesHtml = category.entries && category.entries.length > 0
			? category.entries.map(entry => `
                <button type="button"
                        class="js-open-codex-entry js-draggable-codex btn btn-ghost w-full justify-start text-left h-auto p-2"
                        data-entry-id="${entry.id}"
                        data-entry-title="${entry.title}"
                        draggable="true">
                    <img src="${entry.thumbnail_url}" alt="Thumbnail for ${entry.title}" class="w-12 h-12 object-cover rounded flex-shrink-0 bg-base-300 pointer-events-none">
                    <div class="flex-grow min-w-0 pointer-events-none text-left">
                        <h4 class="font-semibold truncate normal-case">${entry.title}</h4>
                        ${entry.description ? `<p class="text-xs text-base-content/70 mt-1 font-normal normal-case">${entry.description}</p>` : ''}
                    </div>
                </button>
            `).join('')
			: '<p class="text-sm text-base-content/70 px-2">No entries in this category yet.</p>';
		
		const itemCount = category.entries_count || 0;
		return `
            <div id="codex-category-${category.id}">
                <h3 class="text-lg font-bold text-teal-500 sticky top-0 bg-base-100/90 backdrop-blur-sm py-2 -mx-1 px-1">
                    ${category.name}
                    <span class="js-codex-category-count text-sm font-normal text-base-content/70 ml-2">(${itemCount} ${itemCount === 1 ? 'item' : 'items'})</span>
                </h3>
                <div class="js-codex-entries-list mt-2 space-y-2">${entriesHtml}</div>
            </div>
        `;
	}).join('');
	
	return template.replace('<!-- CATEGORIES_PLACEHOLDER -->', categoriesHtml);
}

/**
 * Initializes the novel editor's multi-window desktop environment.
 */
document.addEventListener('DOMContentLoaded', async () => {
	const viewport = document.getElementById('viewport');
	const desktop = document.getElementById('desktop');
	const taskbar = document.getElementById('taskbar');
	
	const params = new URLSearchParams(window.location.search);
	const novelId = params.get('novelId');
	
	if (!viewport || !desktop || !taskbar || !novelId) {
		console.error('Essential novel editor elements or novelId are missing.');
		document.body.innerHTML = '<p class="text-error p-8">Error: Could not load editor. Novel ID is missing.</p>';
		return;
	}
	
	document.body.dataset.novelId = novelId;
	
	try {
		// MODIFIED: Fetch templates via IPC.
		const outlineTemplateHtml = await window.api.getTemplate('outline-window');
		const codexTemplateHtml = await window.api.getTemplate('codex-window');
		
		const novelData = await window.api.getOneNovel(novelId);
		if (!novelData) throw new Error('Novel not found.');
		
		// MODIFIED: Populate templates and store the result on the body element.
		document.body.dataset.outlineContent = populateOutlineTemplate(outlineTemplateHtml, novelData);
		document.body.dataset.codexContent = populateCodexTemplate(codexTemplateHtml, novelData);
		
		// Populate the "New Codex Entry" modal's category dropdown
		const categorySelect = document.getElementById('new-codex-category');
		novelData.codexCategories.forEach(category => {
			const option = new Option(category.name, category.id);
			// Insert before the "Create New" option
			categorySelect.insertBefore(option, categorySelect.options[categorySelect.options.length - 1]);
		});
		
		// Store the editor state on the body for the WindowManager to find
		document.body.dataset.editorState = JSON.stringify(novelData.editor_state || null);
		document.title = `Editing: ${novelData.title} - Novel Writer`;
		
	} catch (error) {
		console.error('Failed to load initial novel data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load novel data. ${error.message}</p>`;
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
	// The theme toggle is now handled by the universal theme.js script
	setupOpenWindowsMenu(windowManager);
	setupCanvasControls(windowManager);
});

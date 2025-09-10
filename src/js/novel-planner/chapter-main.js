// NEW: Entry point for the dedicated chapter editor window.
import { setupTopToolbar } from './toolbar.js';
import { getChapterEditorView, setupContentEditor } from './chapter-content-editor.js';
import { setupPromptEditor } from '../prompt-editor.js';

/**
 * Clears all validation error messages from a form.
 * @param {HTMLFormElement} form The form element.
 */
function clearFormErrors(form) {
	form.querySelectorAll('.js-error-message').forEach(el => {
		el.textContent = '';
		el.classList.add('hidden');
	});
}

document.addEventListener('DOMContentLoaded', async () => {
	const params = new URLSearchParams(window.location.search);
	const chapterId = params.get('chapterId');
	
	if (!chapterId) {
		document.body.innerHTML = '<p class="text-error p-8">Error: Chapter ID is missing.</p>';
		return;
	}
	
	document.body.dataset.chapterId = chapterId;
	
	try {
		const chapterData = await window.api.getOneChapterForEditor(chapterId);
		const novelData = await window.api.getOneNovel(chapterData.novel_id);
		document.body.dataset.novelId = chapterData.novel_id;
		
		// Populate header
		document.getElementById('js-novel-section-info').textContent = `${chapterData.novel_title} > ${chapterData.section_title}`;
		document.getElementById('js-chapter-title-input').value = chapterData.chapter_title;
		document.title = `Editing: ${chapterData.chapter_title}`;
		
		// Populate hidden divs for ProseMirror
		const sourceContainer = document.getElementById('js-pm-content-source');
		sourceContainer.querySelector('[data-name="content"]').innerHTML = chapterData.content || '';
		sourceContainer.querySelector('[data-name="summary"]').innerHTML = chapterData.summary || '';
		
		// Initialize editors and toolbar
		setupContentEditor(chapterId);
		// MODIFIED: Pass a configuration object to the toolbar setup.
		// This tells the toolbar it's in the chapter editor and provides a way to access specific editor panes.
		setupTopToolbar({
			isChapterEditor: true,
			getEditorView: getChapterEditorView,
		});
		setupPromptEditor();
		
	} catch (error) {
		console.error('Failed to load chapter data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load chapter data. ${error.message}</p>`;
	}
});

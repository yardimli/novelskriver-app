// NEW: Entry point for the dedicated chapter editor window.
import { setupTopToolbar } from './toolbar.js';
// MODIFIED: Corrected the import to use the editor setup function for the two-pane chapter window.
import { setupContentEditor } from './chapter-content-editor.js';
import { setupPromptEditor } from '../prompt-editor.js';

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
		
		// Populate the "New Codex Entry" modal's category dropdown
		const categorySelect = document.getElementById('new-codex-category');
		if(categorySelect && novelData && novelData.codexCategories) {
			novelData.codexCategories.forEach(category => {
				const option = new Option(category.name, category.id);
				categorySelect.insertBefore(option, categorySelect.options[categorySelect.options.length - 1]);
			});
		}
		
		// Initialize editors and toolbar
		setupContentEditor(chapterId);
		setupTopToolbar();
		setupPromptEditor();
		
	} catch (error) {
		console.error('Failed to load chapter data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load chapter data. ${error.message}</p>`;
	}
});

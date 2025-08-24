/**
 * This module sets up interactions for chapter windows, including
 * drag-and-drop for codex entries and linking/unlinking them.
 * @param {HTMLElement} desktop - The main desktop element to attach listeners to.
 */
export function setupChapterEditor(desktop) {
	// --- Drag and Drop for linking Codex Entries ---
	
	desktop.addEventListener('dragstart', (event) => {
		const draggable = event.target.closest('.js-draggable-codex');
		if (draggable) {
			event.dataTransfer.setData('application/x-codex-entry-id', draggable.dataset.entryId);
			event.dataTransfer.effectAllowed = 'link';
		}
	});
	
	desktop.addEventListener('dragover', (event) => {
		const dropZone = event.target.closest('.js-chapter-drop-zone');
		if (dropZone) {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'link';
		}
	});
	
	desktop.addEventListener('dragenter', (event) => {
		const dropZone = event.target.closest('.js-chapter-drop-zone');
		if (dropZone) dropZone.classList.add('bg-blue-100', 'dark:bg-blue-900/50');
	});
	
	desktop.addEventListener('dragleave', (event) => {
		const dropZone = event.target.closest('.js-chapter-drop-zone');
		if (dropZone && !dropZone.contains(event.relatedTarget)) {
			dropZone.classList.remove('bg-blue-100', 'dark:bg-blue-900/50');
		}
	});
	
	desktop.addEventListener('drop', async (event) => {
		const dropZone = event.target.closest('.js-chapter-drop-zone');
		if (!dropZone) return;
		
		event.preventDefault();
		dropZone.classList.remove('bg-blue-100', 'dark:bg-blue-900/50');
		
		const chapterId = dropZone.dataset.chapterId;
		const codexEntryId = event.dataTransfer.getData('application/x-codex-entry-id');
		
		if (!chapterId || !codexEntryId) return;
		if (dropZone.querySelector(`.js-codex-tag[data-entry-id="${codexEntryId}"]`)) return;
		
		try {
			const data = await window.api.attachCodexToChapter(chapterId, codexEntryId);
			if (!data.success) throw new Error(data.message || 'Failed to link codex entry.');
			
			const tagContainer = dropZone.querySelector('.js-codex-tags-container');
			if (tagContainer) {
				// MODIFIED: Await the async function call.
				const newTag = await createCodexTagElement(chapterId, data.codexEntry);
				tagContainer.appendChild(newTag);
				const tagsWrapper = dropZone.querySelector('.js-codex-tags-wrapper');
				if (tagsWrapper) tagsWrapper.classList.remove('hidden');
			}
		} catch (error) {
			console.error('Error linking codex entry:', error);
			alert(error.message);
		}
	});
	
	// --- Unlinking Codex Entries ---
	desktop.addEventListener('click', async (event) => {
		const removeBtn = event.target.closest('.js-remove-codex-link');
		if (!removeBtn) return;
		
		const tag = removeBtn.closest('.js-codex-tag');
		const chapterId = removeBtn.dataset.chapterId;
		const codexEntryId = removeBtn.dataset.entryId;
		const entryTitle = tag.querySelector('.js-codex-tag-title').textContent;
		
		if (!confirm(`Are you sure you want to unlink "${entryTitle}" from this chapter?`)) {
			return;
		}
		
		try {
			const data = await window.api.detachCodexFromChapter(chapterId, codexEntryId);
			if (!data.success) throw new Error(data.message || 'Failed to unlink codex entry.');
			
			const tagContainer = tag.parentElement;
			tag.remove();
			
			if (tagContainer && tagContainer.children.length === 0) {
				const tagsWrapper = tagContainer.closest('.js-codex-tags-wrapper');
				if (tagsWrapper) tagsWrapper.classList.add('hidden');
			}
		} catch (error) {
			console.error('Error unlinking codex entry:', error);
			alert(error.message);
		}
	});
}

/**
 * MODIFIED: Helper function to create the HTML for a new codex tag using a template.
 * @param {string} chapterId
 * @param {object} codexEntry
 * @returns {Promise<HTMLElement>}
 */
async function createCodexTagElement(chapterId, codexEntry) {
	// NEW: Fetch the template for a codex tag in a chapter window.
	let template = await window.api.getTemplate('chapter-codex-tag');
	
	// NEW: Populate the template with data.
	template = template.replace(/{{CHAPTER_ID}}/g, chapterId);
	template = template.replace(/{{ENTRY_ID}}/g, codexEntry.id);
	template = template.replace(/{{ENTRY_TITLE}}/g, codexEntry.title);
	template = template.replace(/{{THUMBNAIL_URL}}/g, codexEntry.thumbnail_url);
	
	// NEW: Create an element from the populated HTML string.
	const div = document.createElement('div');
	div.innerHTML = template.trim();
	return div.firstChild;
}

// NEW: Entry point for the dedicated chapter editor window.
import { setupTopToolbar } from './toolbar.js';
// MODIFIED: Import getChapterEditorView and pass it to the toolbar setup.
import { getChapterEditorView, setupContentEditor } from './chapter-content-editor.js';
import { setupPromptEditor } from '../prompt-editor.js';

// --- NEW: Logic for "New Codex Entry" Modal, adapted for this standalone editor ---

/**
 * Sets the loading state for a button, showing/hiding text and a spinner.
 * @param {HTMLButtonElement} button The button element.
 * @param {boolean} isLoading True to show the spinner, false to show the text.
 */
const setButtonLoadingState = (button, isLoading) => {
	const text = button.querySelector('.js-btn-text');
	const spinner = button.querySelector('.js-spinner');
	if (isLoading) {
		button.disabled = true;
		if (text) text.classList.add('hidden');
		if (spinner) spinner.classList.remove('hidden');
	} else {
		button.disabled = false;
		if (text) text.classList.remove('hidden');
		if (spinner) spinner.classList.add('hidden');
	}
};

/**
 * Clears all validation error messages from a form.
 * @param {HTMLFormElement} form The form element.
 */
function clearFormErrors(form) {
	form.querySelectorAll('.js-error-message').forEach(el => {
		el.textContent = '';
		el.classList.add('hidden');
	});
	const genericErrorContainer = form.querySelector('#new-codex-error-container');
	if (genericErrorContainer) {
		genericErrorContainer.classList.add('hidden');
		genericErrorContainer.textContent = '';
	}
}

/**
 * Displays a generic error message at the top of the form.
 * @param {HTMLFormElement} form The form element.
 * @param {string} message The error message to display.
 */
function displayGenericError(form, message) {
	const genericErrorContainer = form.querySelector('#new-codex-error-container');
	if (genericErrorContainer) {
		genericErrorContainer.textContent = message;
		genericErrorContainer.classList.remove('hidden');
	}
}

/**
 * Resets and closes the "New Codex Entry" modal.
 * @param {HTMLDialogElement} modal The modal element.
 * @param {HTMLFormElement} form The form element inside the modal.
 */
function resetAndCloseNewCodexModal(modal, form) {
	if (modal) {
		modal.close();
		if (form) {
			form.reset();
			clearFormErrors(form);
			form.querySelector('#new-category-wrapper').classList.add('hidden');
		}
	}
}

/**
 * Sets up all event listeners for the "New Codex Entry" modal.
 */
function setupNewCodexHandler() {
	const newCodexModal = document.getElementById('new-codex-entry-modal');
	const newCodexForm = document.getElementById('new-codex-entry-form');
	if (!newCodexModal || !newCodexForm) return;
	
	const categorySelect = newCodexForm.querySelector('#new-codex-category');
	const newCategoryWrapper = newCodexForm.querySelector('#new-category-wrapper');
	const newCategoryInput = newCodexForm.querySelector('#new-category-name');
	
	// Show/hide the "New Category Name" input field.
	categorySelect.addEventListener('change', () => {
		if (categorySelect.value === 'new') {
			newCategoryWrapper.classList.remove('hidden');
		} else {
			newCategoryWrapper.classList.add('hidden');
			newCategoryInput.value = '';
		}
	});
	
	// Handle the modal's close button.
	newCodexModal.addEventListener('click', (event) => {
		if (event.target.closest('.js-close-new-codex-modal')) {
			resetAndCloseNewCodexModal(newCodexModal, newCodexForm);
		}
	});
	
	// Handle the form submission.
	newCodexForm.addEventListener('submit', async (event) => {
		event.preventDefault(); // This is the critical fix to prevent page reload.
		
		const submitBtn = newCodexForm.querySelector('.js-new-codex-submit-btn');
		setButtonLoadingState(submitBtn, true);
		clearFormErrors(newCodexForm);
		
		const formData = new FormData(newCodexForm);
		const data = Object.fromEntries(formData.entries());
		
		try {
			const novelId = document.body.dataset.novelId;
			if (!novelId) {
				throw new Error('Could not determine the Novel ID for this operation.');
			}
			
			const result = await window.api.createCodexEntry(novelId, data);
			
			if (!result.success) {
				throw new Error(result.message || 'Form submission failed');
			}
			
			resetAndCloseNewCodexModal(newCodexModal, newCodexForm);
			
			// If a new category was created, add it to the dropdown for future use.
			if (result.newCategory) {
				const newOption = new Option(result.newCategory.name, result.newCategory.id);
				categorySelect.insertBefore(newOption, categorySelect.options[categorySelect.options.length - 1]);
			}
			
		} catch (error) {
			console.error('Error creating codex entry:', error);
			displayGenericError(newCodexForm, error.message);
		} finally {
			setButtonLoadingState(submitBtn, false);
		}
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
		// MODIFIED: Pass a configuration object to the toolbar setup.
		// This tells the toolbar it's in the chapter editor and provides a way to access specific editor panes.
		setupTopToolbar({
			isChapterEditor: true,
			getEditorView: getChapterEditorView,
		});
		setupPromptEditor();
		setupNewCodexHandler(); // MODIFIED: Initialize the new codex modal handler.
		
	} catch (error) {
		console.error('Failed to load chapter data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load chapter data. ${error.message}</p>`;
	}
});

/**
 * Codex Entry Window Interaction Manager
 */

/**
 * Creates an HTMLElement from an HTML string.
 * @param {string} htmlString The HTML string.
 * @returns {HTMLElement | null} The first element created from the string.
 */
function createElementFromHTML(htmlString) {
	const div = document.createElement('div');
	div.innerHTML = htmlString.trim();
	// Use firstElementChild to correctly handle templates that may start with comment nodes.
	return div.firstElementChild;
}

document.addEventListener('DOMContentLoaded', () => {
	const desktop = document.getElementById('desktop');
	if (!desktop) return;
	
	// --- Modal Management ---
	const openModal = (modal) => {
		if (modal) modal.showModal();
	};
	
	const closeModal = (modal) => {
		if (modal) {
			modal.close();
			const form = modal.querySelector('form');
			if (form) {
				form.reset();
				const previewContainer = form.querySelector('.js-image-preview-container');
				if (previewContainer) previewContainer.classList.add('hidden');
				const fileNameSpan = form.querySelector('.js-file-name');
				if (fileNameSpan) fileNameSpan.textContent = 'Click to select a file';
				const submitBtn = form.querySelector('button[type="submit"]');
				if (submitBtn) submitBtn.disabled = true;
			}
		}
	};
	
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
	
	// --- Event Delegation for Modal Triggers and Closers ---
	document.body.addEventListener('click', (event) => {
		const target = event.target;
		
		const openTrigger = target.closest('.js-codex-generate-ai, .js-codex-upload-image');
		if (openTrigger) {
			const windowEl = openTrigger.closest('.codex-entry-window-content');
			if (!windowEl) return;
			
			const entryId = windowEl.dataset.entryId;
			
			if (openTrigger.matches('.js-codex-generate-ai')) {
				const modal = document.getElementById(`ai-modal-${entryId}`);
				const textarea = modal.querySelector('textarea');
				textarea.value = `A detailed portrait of ${windowEl.dataset.entryTitle}, fantasy art.`;
				openModal(modal);
			}
			
			if (openTrigger.matches('.js-codex-upload-image')) {
				const modal = document.getElementById(`upload-modal-${entryId}`);
				openModal(modal);
			}
			return;
		}
		
		const closeTrigger = target.closest('.js-close-modal');
		if (closeTrigger) {
			const modal = closeTrigger.closest('dialog.modal');
			closeModal(modal);
		}
	});
	
	// --- AI Generation Form Submission ---
	document.body.addEventListener('submit', async (event) => {
		if (!event.target.matches('.js-ai-form')) return;
		event.preventDefault();
		
		const form = event.target;
		const modal = form.closest('.js-ai-modal');
		const entryId = modal.id.replace('ai-modal-', '');
		const windowEl = document.querySelector(`.codex-entry-window-content[data-entry-id="${entryId}"]`);
		const submitBtn = form.querySelector('.js-ai-submit-btn');
		const prompt = new FormData(form).get('prompt');
		
		if (!prompt || prompt.trim() === '') {
			alert('Please enter a prompt.');
			return;
		}
		
		setButtonLoadingState(submitBtn, true);
		const imageContainer = windowEl.querySelector('.codex-image-container');
		const imgEl = imageContainer.querySelector('img');
		imageContainer.classList.add('opacity-50');
		
		try {
			const data = await window.api.generateCodexImage(entryId, prompt);
			if (!data.success) throw new Error(data.message || 'An unknown error occurred.');
			
			imgEl.src = data.image_url;
			closeModal(modal);
			
		} catch (error) {
			console.error('AI Image Generation Error:', error);
			alert('Failed to generate image: ' + error.message);
		} finally {
			setButtonLoadingState(submitBtn, false);
			imageContainer.classList.remove('opacity-50');
		}
	});
	
	// --- Manual Upload Form Submission ---
	document.body.addEventListener('submit', async (event) => {
		if (!event.target.matches('.js-upload-form')) return;
		event.preventDefault();
		
		const form = event.target;
		const modal = form.closest('.js-upload-modal');
		const entryId = modal.id.replace('upload-modal-', '');
		const windowEl = document.querySelector(`.codex-entry-window-content[data-entry-id="${entryId}"]`);
		const submitBtn = form.querySelector('.js-upload-submit-btn');
		
		const filePath = form.dataset.filePath;
		if (!filePath) {
			alert('No file selected.');
			return;
		}
		
		setButtonLoadingState(submitBtn, true);
		const imageContainer = windowEl.querySelector('.codex-image-container');
		const imgEl = imageContainer.querySelector('img');
		imageContainer.classList.add('opacity-50');
		
		try {
			const data = await window.api.uploadCodexImage(entryId, filePath);
			if (!data.success) {
				throw new Error(data.message || 'Upload failed.');
			}
			
			imgEl.src = data.image_url;
			closeModal(modal);
			
		} catch (error) {
			console.error('Image Upload Error:', error);
			alert('Failed to upload image: ' + error.message);
		} finally {
			setButtonLoadingState(submitBtn, false);
			imageContainer.classList.remove('opacity-50');
		}
	});
	
	document.body.addEventListener('click', async (event) => {
		if (!event.target.matches('.js-trigger-file-input')) return;
		
		const button = event.target;
		const form = button.closest('form');
		
		const filePath = await window.api.showOpenImageDialog();
		if (filePath) {
			const previewContainer = form.querySelector('.js-image-preview-container');
			const previewImg = form.querySelector('.js-image-preview');
			const fileNameSpan = form.querySelector('.js-file-name');
			const submitBtn = form.querySelector('button[type="submit"]');
			
			// Store the path on the form for submission
			form.dataset.filePath = filePath;
			
			// Use data URL for preview
			const reader = new FileReader();
			const response = await fetch(`file://${filePath}`);
			const blob = await response.blob();
			reader.readAsDataURL(blob);
			reader.onloadend = () => {
				previewImg.src = reader.result;
				previewContainer.classList.remove('hidden');
			};
			
			fileNameSpan.textContent = filePath.split(/[\\/]/).pop();
			submitBtn.disabled = false;
		}
	});
	
	// --- Drag and Drop for linking Codex Entries to other Codex Entries ---
	
	desktop.addEventListener('dragover', (event) => {
		const dropZone = event.target.closest('.js-codex-drop-zone');
		if (dropZone) {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'link';
		}
	});
	
	desktop.addEventListener('dragenter', (event) => {
		const dropZone = event.target.closest('.js-codex-drop-zone');
		if (dropZone) dropZone.classList.add('bg-blue-100', 'dark:bg-blue-900/50');
	});
	
	desktop.addEventListener('dragleave', (event) => {
		const dropZone = event.target.closest('.js-codex-drop-zone');
		if (dropZone && !dropZone.contains(event.relatedTarget)) {
			dropZone.classList.remove('bg-blue-100', 'dark:bg-blue-900/50');
		}
	});
	
	desktop.addEventListener('drop', async (event) => {
		const dropZone = event.target.closest('.js-codex-drop-zone');
		if (!dropZone) return;
		
		event.preventDefault();
		dropZone.classList.remove('bg-blue-100', 'dark:bg-blue-900/50');
		
		const parentEntryId = dropZone.dataset.entryId;
		const linkedEntryId = event.dataTransfer.getData('application/x-codex-entry-id');
		
		if (!parentEntryId || !linkedEntryId || parentEntryId === linkedEntryId) return;
		if (dropZone.querySelector(`.js-codex-tag[data-entry-id="${linkedEntryId}"]`)) return;
		
		try {
			const data = await window.api.attachCodexToCodex(parentEntryId, linkedEntryId);
			if (!data.success) throw new Error(data.message || 'Failed to link codex entry.');
			
			const tagContainer = dropZone.querySelector('.js-codex-tags-container');
			if (tagContainer) {
				const newTag = await createCodexLinkTagElement(parentEntryId, data.codexEntry);
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
		const removeBtn = event.target.closest('.js-remove-codex-codex-link');
		if (!removeBtn) return;
		
		const tag = removeBtn.closest('.js-codex-tag');
		const parentEntryId = removeBtn.dataset.parentEntryId;
		const linkedEntryId = removeBtn.dataset.entryId;
		const entryTitle = tag.querySelector('.js-codex-tag-title').textContent;
		
		if (!confirm(`Are you sure you want to unlink "${entryTitle}" from this entry?`)) return;
		
		try {
			const data = await window.api.detachCodexFromCodex(parentEntryId, linkedEntryId);
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
	
	async function createCodexLinkTagElement(parentEntryId, codexEntry) {
		let template = await window.api.getTemplate('planner/codex-link-tag');
		template = template.replace(/{{PARENT_ENTRY_ID}}/g, parentEntryId);
		template = template.replace(/{{ENTRY_ID}}/g, codexEntry.id);
		template = template.replace(/{{ENTRY_TITLE}}/g, codexEntry.title);
		template = template.replace(/{{THUMBNAIL_URL}}/g, codexEntry.thumbnail_url);
		
		return createElementFromHTML(template);
	}
	
	// --- Create New Codex Entry ---
	
	const newCodexModal = document.getElementById('new-codex-entry-modal');
	const newCodexForm = document.getElementById('new-codex-entry-form');
	
	document.body.addEventListener('click', (event) => {
		if (event.target.closest('.js-open-new-codex-modal')) {
			if (newCodexModal) newCodexModal.showModal();
		}
	});
	
	if (newCodexModal) {
		newCodexModal.addEventListener('click', (event) => {
			if (event.target.closest('.js-close-new-codex-modal')) {
				resetAndCloseNewCodexModal();
			}
		});
	}
	
	if (newCodexForm) {
		const categorySelect = newCodexForm.querySelector('#new-codex-category');
		const newCategoryWrapper = newCodexForm.querySelector('#new-category-wrapper');
		const newCategoryInput = newCodexForm.querySelector('#new-category-name');
		
		categorySelect.addEventListener('change', () => {
			if (categorySelect.value === 'new') {
				newCategoryWrapper.classList.remove('hidden');
			} else {
				newCategoryWrapper.classList.add('hidden');
				newCategoryInput.value = '';
			}
		});
	}
	
	if (newCodexForm) {
		newCodexForm.addEventListener('submit', async (event) => {
			event.preventDefault();
			
			const submitBtn = newCodexForm.querySelector('.js-new-codex-submit-btn');
			setButtonLoadingState(submitBtn, true);
			clearFormErrors(newCodexForm);
			
			const formData = new FormData(newCodexForm);
			const data = Object.fromEntries(formData.entries());
			
			const imageInput = newCodexForm.querySelector('#new-codex-image');
			if (imageInput.files[0]) {
				data.imagePath = imageInput.files[0].path;
			}
			delete data.image; // Remove the file object itself
			
			try {
				// Get novelId just-in-time from the body dataset to avoid race conditions.
				const novelId = document.body.dataset.novelId;
				if (!novelId) {
					throw new Error('Could not determine the Novel ID for this operation.');
				}
				
				const result = await window.api.createCodexEntry(novelId, data);
				
				if (!result.success) {
					throw new Error(result.message || 'Form submission failed');
				}
				
				resetAndCloseNewCodexModal();
				
				if (result.newCategory) {
					await addNewCategoryToCodexWindow(result.newCategory);
				}
				const newEntryButton = await addNewEntryToCategoryList(result.codexEntry);
				
				if (newEntryButton) {
					newEntryButton.click();
				}
				
			} catch (error) {
				console.error('Error creating codex entry:', error);
				displayGenericError(newCodexForm, error.message);
			} finally {
				setButtonLoadingState(submitBtn, false);
			}
		});
	}
	
	function resetAndCloseNewCodexModal() {
		if (newCodexModal) {
			newCodexModal.close();
			if (newCodexForm) {
				newCodexForm.reset();
				clearFormErrors(newCodexForm);
				newCodexForm.querySelector('#new-category-wrapper').classList.add('hidden');
			}
		}
	}
	
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
	
	function displayGenericError(form, message) {
		const genericErrorContainer = form.querySelector('#new-codex-error-container');
		if (genericErrorContainer) {
			genericErrorContainer.textContent = message;
			genericErrorContainer.classList.remove('hidden');
		}
	}
	
	async function addNewEntryToCategoryList(entryData) {
		const codexWindowContent = document.querySelector('#codex-window .p-4');
		if (!codexWindowContent) return null;
		
		const categoryContainer = codexWindowContent.querySelector(`#codex-category-${entryData.category_id}`);
		if (!categoryContainer) return null;
		
		const listContainer = categoryContainer.querySelector('.js-codex-entries-list');
		if (!listContainer) return null;
		
		const emptyMsg = listContainer.querySelector('p');
		if (emptyMsg) emptyMsg.remove();
		
		let template = await window.api.getTemplate('planner/codex-list-item');
		template = template.replace(/{{ENTRY_ID}}/g, entryData.id);
		template = template.replace(/{{ENTRY_TITLE}}/g, entryData.title);
		template = template.replace(/{{THUMBNAIL_URL}}/g, entryData.thumbnail_url);
		
		const button = createElementFromHTML(template);
		if (!button) return null;
		
		listContainer.appendChild(button);
		
		const countSpan = categoryContainer.querySelector('.js-codex-category-count');
		if (countSpan) {
			const currentCount = listContainer.children.length;
			const itemText = currentCount === 1 ? 'item' : 'items';
			countSpan.textContent = `(${currentCount} ${itemText})`;
		}
		
		return button;
	}
	
	async function addNewCategoryToCodexWindow(categoryData) {
		const codexWindowContent = document.querySelector('#codex-window .p-4');
		if (!codexWindowContent) return;
		if (document.getElementById(`codex-category-${categoryData.id}`)) return;
		
		let template = await window.api.getTemplate('planner/codex-category-item');
		template = template.replace(/{{CATEGORY_ID}}/g, categoryData.id);
		template = template.replace(/{{CATEGORY_NAME}}/g, categoryData.name);
		
		const div = createElementFromHTML(template);
		if (!div) return;
		
		codexWindowContent.appendChild(div);
		
		const categorySelect = document.getElementById('new-codex-category');
		if (categorySelect) {
			const newOption = new Option(categoryData.name, categoryData.id);
			categorySelect.insertBefore(newOption, categorySelect.options[categorySelect.options.length - 1]);
		}
	}
});

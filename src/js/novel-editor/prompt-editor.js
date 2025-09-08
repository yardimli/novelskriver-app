/**
 * Manages the AI Prompt Editor window.
 * @param {HTMLElement} windowEl - The root element of the prompt editor window.
 */
export function setupPromptEditor(windowEl) {
	const contentEl = windowEl.querySelector('.js-prompt-editor-content');
	const listContainer = contentEl.querySelector('.js-prompt-list-container');
	const editorPane = contentEl.querySelector('.js-prompt-editor-pane');
	const placeholder = contentEl.querySelector('.js-prompt-placeholder');
	const form = contentEl.querySelector('.js-prompt-form');
	const saveBtn = contentEl.querySelector('.js-save-prompt-btn');
	const resetBtn = contentEl.querySelector('.js-reset-prompt-btn');
	const modal = document.getElementById('prompt-editor-modal');
	const closeBtn = windowEl.querySelector('.js-close-prompt-modal');
	
	let currentPrompt = null;
	
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
	
	const autosizeTextarea = (textarea) => {
		setTimeout(() => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight + 50}px`;
		}, 0);
	};
	
	form.querySelectorAll('.js-autosize').forEach(textarea => {
		textarea.addEventListener('input', () => autosizeTextarea(textarea));
	});
	
	const loadPromptList = async () => {
		try {
			const prompts = await window.api.listPrompts();
			listContainer.innerHTML = '';
			if (prompts.length === 0) {
				listContainer.innerHTML = '<p class="p-4 text-sm text-base-content/70">No prompts found.</p>';
				return;
			}
			
			prompts.forEach(prompt => {
				const button = document.createElement('button');
				button.className = 'js-prompt-item btn btn-ghost w-full justify-start text-left';
				button.dataset.promptId = prompt.id;
				button.textContent = prompt.name;
				listContainer.appendChild(button);
			});
		} catch (error) {
			console.error('Failed to load prompt list:', error);
			listContainer.innerHTML = `<p class="p-4 text-sm text-error">${error.message}</p>`;
		}
	};
	
	const loadPrompt = async (promptId) => {
		// Update active item in the list
		listContainer.querySelectorAll('.js-prompt-item').forEach(btn => {
			btn.classList.toggle('btn-active', btn.dataset.promptId === promptId);
		});
		
		// Show editor, hide placeholder
		editorPane.classList.remove('hidden');
		placeholder.classList.add('hidden');
		
		try {
			const promptData = await window.api.getPrompt(promptId);
			currentPrompt = promptData; // Store the full prompt data.
			
			form.elements.system.value = promptData.system || '';
			form.elements.user.value = promptData.user || '';
			form.elements.ai.value = promptData.ai || '';
			
			form.querySelectorAll('.js-autosize').forEach(autosizeTextarea);
			
		} catch (error) {
			console.error(`Failed to load prompt ${promptId}:`, error);
			alert(error.message);
		}
	};
	
	listContainer.addEventListener('click', (event) => {
		const button = event.target.closest('.js-prompt-item');
		if (button) {
			loadPrompt(button.dataset.promptId);
		}
	});
	
	saveBtn.addEventListener('click', async () => {
		if (!currentPrompt) return;
		
		setButtonLoadingState(saveBtn, true);
		
		const dataToSave = {
			name: currentPrompt.name, // Get name from the stored prompt object
			system: form.elements.system.value,
			user: form.elements.user.value,
			ai: form.elements.ai.value,
		};
		
		try {
			await window.api.savePrompt(currentPrompt.id, dataToSave);
		} catch (error) {
			console.error(`Failed to save prompt ${currentPrompt.id}:`, error);
			alert(error.message);
		} finally {
			setButtonLoadingState(saveBtn, false);
		}
	});
	
	resetBtn.addEventListener('click', async () => {
		if (!currentPrompt) return;
		
		if (confirm(`Are you sure you want to reset the "${currentPrompt.name}" prompt to its default state? Any customizations will be lost.`)) {
			try {
				const result = await window.api.resetPrompt(currentPrompt.id);
				if (result.success) {
					currentPrompt = result.data; // Update stored data with reset version
					// Repopulate the form with the reset data
					form.elements.system.value = result.data.system || '';
					form.elements.user.value = result.data.user || '';
					form.elements.ai.value = result.data.ai || '';
					
					form.querySelectorAll('.js-autosize').forEach(autosizeTextarea);
					
					alert('Prompt has been reset to default.');
				}
			} catch (error) {
				console.error(`Failed to reset prompt ${currentPrompt.id}:`, error);
				alert(error.message);
			}
		}
	});
	
	if (closeBtn && modal) {
		closeBtn.addEventListener('click', () => {
			modal.close();
		});
	}
	
	// Initial load
	loadPromptList();
}

// MODIFIED: This file now controls the prompt editor modal within the novel editor.

import { init as initExpandEditor } from './prompt-editors/expand-editor.js';
import { init as initRephraseEditor } from './prompt-editors/rephrase-editor.js';
import { init as initShortenEditor } from './prompt-editors/shorten-editor.js';
import { init as initSceneBeatEditor } from './prompt-editors/scene-beat-editor.js';
import { init as initSceneSummarizationEditor } from './prompt-editors/scene-summarization-editor.js';

// Configuration mapping prompt IDs to their respective builder modules.
const editors = {
	'expand': { name: 'Expand', init: initExpandEditor },
	'rephrase': { name: 'Rephrase', init: initRephraseEditor },
	'shorten': { name: 'Shorten', init: initShortenEditor },
	'scene-beat': { name: 'Scene Beat', init: initSceneBeatEditor },
	'scene-summarization': { name: 'Scene Summarization', init: initSceneSummarizationEditor },
};

let modalEl;
let currentContext;

/**
 * Loads a specific prompt builder into the editor pane.
 * @param {string} promptId - The ID of the prompt to load.
 */
const loadPrompt = async (promptId) => {
	if (!modalEl) return;
	
	const placeholder = modalEl.querySelector('.js-prompt-placeholder');
	const customEditorPane = modalEl.querySelector('.js-custom-editor-pane');
	const customPromptTitle = customEditorPane.querySelector('.js-custom-prompt-title');
	const customFormContainer = customEditorPane.querySelector('.js-custom-form-container');
	
	const editorConfig = editors[promptId];
	if (!editorConfig) {
		console.error(`No editor configured for promptId: ${promptId}`);
		placeholder.classList.remove('hidden');
		customEditorPane.classList.add('hidden');
		placeholder.innerHTML = `<p class="text-error">No editor found for prompt: ${promptId}</p>`;
		return;
	}
	
	// Update active item in the list
	modalEl.querySelectorAll('.js-prompt-item').forEach(btn => {
		btn.classList.toggle('btn-active', btn.dataset.promptId === promptId);
	});
	
	// Show editor, hide placeholder
	placeholder.classList.add('hidden');
	customEditorPane.classList.remove('hidden');
	
	// Set the title and initialize the specific editor module.
	customPromptTitle.textContent = `Prompt Builder: ${editorConfig.name}`;
	customFormContainer.innerHTML = `<div class="p-4 text-center"><span class="loading loading-spinner"></span></div>`;
	
	// The init function from the module will load its template and set up logic.
	await editorConfig.init(customFormContainer, currentContext);
};

/**
 * Handles clicks within the prompt list container.
 * @param {MouseEvent} event
 */
const handleListClick = (event) => {
	const button = event.target.closest('.js-prompt-item');
	if (button) {
		loadPrompt(button.dataset.promptId);
	}
};

/**
 * Initializes the prompt editor modal logic once, attaching the necessary event listener.
 */
export function setupPromptEditor() {
	modalEl = document.getElementById('prompt-editor-modal');
	if (!modalEl) return;
	
	const listContainer = modalEl.querySelector('.js-prompt-list-container');
	if (listContainer) {
		// Attach a single, delegated event listener for the lifetime of the app.
		listContainer.addEventListener('click', handleListClick);
	}
}

/**
 * Opens the prompt editor modal with fresh context.
 * @param {object} context
 */
export async function openPromptEditor(context) {
	if (!modalEl) {
		console.error('Prompt editor modal element not found.');
		return;
	}
	currentContext = context;
	
	const listContainer = modalEl.querySelector('.js-prompt-list-container');
	const placeholder = modalEl.querySelector('.js-prompt-placeholder');
	const customEditorPane = modalEl.querySelector('.js-custom-editor-pane');
	
	// Reset view to its initial state
	placeholder.classList.remove('hidden');
	customEditorPane.classList.add('hidden');
	listContainer.innerHTML = `<div class="p-4 text-center"><span class="loading loading-spinner"></span></div>`;
	
	// Load the list of available prompts
	try {
		const prompts = await window.api.listPrompts();
		listContainer.innerHTML = '';
		if (prompts.length === 0) {
			listContainer.innerHTML = '<p class="p-4 text-sm text-base-content/70">No prompts found.</p>';
			return;
		}
		
		prompts.forEach(prompt => {
			const button = document.createElement('button');
			button.className = 'js-prompt-item btn btn-ghost w-full justify-start text-left normal-case';
			button.dataset.promptId = prompt.id;
			button.textContent = prompt.name;
			listContainer.appendChild(button);
		});
	} catch (error) {
		console.error('Failed to load prompt list:', error);
		listContainer.innerHTML = `<div class="alert alert-error m-2">${error.message}</div>`;
	}
	
	modalEl.showModal();
}

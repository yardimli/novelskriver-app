// MODIFIED: This file is now a controller that loads specialized editor modules.

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

// NEW: This will hold the context passed from the novel editor window.
let promptBuilderContext = null;

document.addEventListener('DOMContentLoaded', async () => {
	const listContainer = document.querySelector('.js-prompt-list-container');
	const placeholder = document.querySelector('.js-prompt-placeholder');
	
	// A single pane is now used for all custom editors.
	const customEditorPane = document.querySelector('.js-custom-editor-pane');
	const customPromptTitle = customEditorPane.querySelector('.js-custom-prompt-title');
	const customFormContainer = customEditorPane.querySelector('.js-custom-form-container');
	
	// NEW: Fetch the context from the main process when the window loads.
	try {
		promptBuilderContext = await window.api.getPromptContext();
	} catch (error) {
		console.error('Failed to get prompt builder context:', error);
		placeholder.innerHTML = `<p class="text-error">Could not load context from the editor.</p>`;
	}
	
	const loadPromptList = async () => {
		try {
			// This now gets a static list from the main process.
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
	};
	
	const loadPrompt = async (promptId) => {
		const editorConfig = editors[promptId];
		if (!editorConfig) {
			console.error(`No editor configured for promptId: ${promptId}`);
			placeholder.classList.remove('hidden');
			customEditorPane.classList.add('hidden');
			placeholder.innerHTML = `<p class="text-error">No editor found for prompt: ${promptId}</p>`;
			return;
		}
		
		// Update active item in the list
		listContainer.querySelectorAll('.js-prompt-item').forEach(btn => {
			btn.classList.toggle('btn-active', btn.dataset.promptId === promptId);
		});
		
		// Show editor, hide placeholder
		placeholder.classList.add('hidden');
		customEditorPane.classList.remove('hidden');
		
		// Set the title and initialize the specific editor module.
		customPromptTitle.textContent = `Prompt Builder: ${editorConfig.name}`;
		customFormContainer.innerHTML = `<div class="p-4 text-center"><span class="loading loading-spinner"></span></div>`;
		
		// MODIFIED: The init function from the module will load its template and set up logic,
		// now with the context from the novel editor.
		await editorConfig.init(customFormContainer, promptBuilderContext);
	};
	
	listContainer.addEventListener('click', (event) => {
		const button = event.target.closest('.js-prompt-item');
		if (button) {
			loadPrompt(button.dataset.promptId);
		}
	});
	
	// Initial load
	loadPromptList();
});

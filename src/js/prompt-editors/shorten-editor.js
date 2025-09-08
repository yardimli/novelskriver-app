// NEW: This file contains the logic for the "Shorten" prompt builder.

const defaultState = {
	shorten_length: 'half',
	instructions: '',
	use_surrounding_text: true,
	use_pov: true,
};

const buildPromptJson = (formData) => {
	let lengthInstruction = '';
	switch (formData.length) {
		case 'half':
			lengthInstruction = 'Halve the length of the given prose. Your current word target is {round(divide(wordCount(message), 2))} words. Do not return more.';
			break;
		case 'quarter':
			lengthInstruction = 'Quarter the length of the given prose. Your current word target is {round(divide(wordCount(message), 4))} words. Do not return more.';
			break;
		case 'paragraph':
			lengthInstruction = 'Shorten the given text into a single paragraph. Don\'t just join the sentences together, rewrite them into a coherent part of the story, summarizing the action/story accordingly.';
			break;
	}
	
	const system = `You are an expert prose editor.

Whenever you're given text, rewrite it to condense it into fewer words without losing meaning. Imitiate the current writing style perfectly, keeping mannerisms, word choice and sentence structure intact.
You are free to remove redundant lines of speech. Keep the same tense and stylistic choices. Use {novel.language} spelling and grammar.

${lengthInstruction}

If the original text contained dialogue, keep the matter of the dialogue intact, but change the wording to hit the target length.

${formData.instructions ? `Additional instructions have been provided to tweak your role, behavior and capabilities. Follow them closely:
<instructions>
${formData.instructions}
</instructions>
` : ''}
Only return the condensed text, nothing else.`;
	
	const user = `${formData.use_pov ? `{pov}\n\n` : ''}${formData.use_surrounding_text ? `{#if either(hasTextAfter, hasTextBefore)}
 For contextual information, refer to surrounding words in the scene, DO NOT REPEAT THEM:
 {#if hasTextBefore}
 <textBefore>
 {wordsBefore(200)}
 </textBefore>
 {#endif}
 {#if hasTextAfter}
 <textAfter>
 {wordsAfter(200)}
 </textAfter>
 {#endif}
{#endif}

` : ''}Text to rewrite:
<text words="{wordCount(message)}">
{message}
</text>`;
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ''
	};
};

const updatePreview = (container) => {
	const form = container.querySelector('#shorten-editor-form');
	if (!form) return;
	
	const formData = {
		shorten_length: form.elements.shorten_length.value,
		instructions: form.elements.instructions.value.trim(),
		use_surrounding_text: form.elements.use_surrounding_text.checked,
		use_pov: form.elements.use_pov.checked,
	};
	
	const systemPreview = container.querySelector('.js-preview-system');
	const userPreview = container.querySelector('.js-preview-user');
	const aiPreview = container.querySelector('.js-preview-ai');
	
	if (!systemPreview || !userPreview || !aiPreview) return;
	
	try {
		const promptJson = buildPromptJson(formData);
		systemPreview.textContent = promptJson.system;
		userPreview.textContent = promptJson.user;
		aiPreview.textContent = promptJson.ai || '(Empty)';
	} catch (error) {
		systemPreview.textContent = `Error building preview: ${error.message}`;
		userPreview.textContent = '';
		aiPreview.textContent = '';
	}
};

const populateForm = (container, state) => {
	const form = container.querySelector('#shorten-editor-form');
	if (!form) return;
	
	// MODIFIED: Use bracket notation here as well to prevent the error.
	form.elements.shorten_length.value = state.shorten_length;
	form.elements.instructions.value = state.instructions;
	form.elements.use_surrounding_text.checked = state.use_surrounding_text;
	form.elements.use_pov.checked = state.use_pov;
};

export const init = async (container) => {
	try {
		const templateHtml = await window.api.getTemplate('shorten-editor');
		container.innerHTML = templateHtml;
		
		populateForm(container, defaultState);
		
		const form = container.querySelector('#shorten-editor-form');
		const resetButton = container.querySelector('.js-reset-btn');
		
		if (form) {
			form.addEventListener('input', () => updatePreview(container));
		}
		
		if (resetButton) {
			resetButton.addEventListener('click', () => {
				if (confirm('Are you sure you want to reset the form to its default settings?')) {
					populateForm(container, defaultState);
					updatePreview(container);
				}
			});
		}
		
		updatePreview(container);
	} catch (error) {
		container.innerHTML = `<p class="p-4 text-error">Could not load editor form.</p>`;
		console.error(error);
	}
};

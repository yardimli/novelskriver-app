// NEW: This file contains the logic for the "Rephrase" prompt builder.

const defaultState = {
	instructions: '',
	use_codex: true,
	use_surrounding_text: true,
	use_pov: true,
};

const buildPromptJson = (formData) => {
	const system = `You are an expert prose editor.

Whenever you're given text, rephrase it using the following instructions: <instructions>${formData.instructions || 'Rephrase the given text.'}</instructions>

Imitiate and keep the current writing style, and leave mannerisms, word choice and sentence structure intact.
You are free to remove redundant lines of speech. Keep the same tense and stylistic choices. Use {novel.language} spelling and grammar.

Only return the rephrased text, nothing else.`;
	
	const user = `${formData.use_codex ? `{#if codex.context}
Take into account the following glossary of characters/locations/items/lore... when writing your response:
<codex>
{codex.context}
</codex>
{#endif}

` : ''}{! We don't want to include codex entries twice in the additional context !}
{! As such, we store this in the local context and use it here !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Here is some additional information to help you with your answer:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}

${formData.use_pov ? `{pov}\n\n` : ''}${formData.use_surrounding_text ? `{#if either(hasTextAfter, hasTextBefore)}
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
	const form = container.querySelector('#rephrase-editor-form');
	if (!form) return;
	
	const formData = {
		instructions: form.elements.instructions.value.trim(),
		use_codex: form.elements.use_codex.checked,
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
	const form = container.querySelector('#rephrase-editor-form');
	if (!form) return;
	
	form.elements.instructions.value = state.instructions;
	form.elements.use_codex.checked = state.use_codex;
	form.elements.use_surrounding_text.checked = state.use_surrounding_text;
	form.elements.use_pov.checked = state.use_pov;
};

export const init = async (container) => {
	try {
		const templateHtml = await window.api.getTemplate('rephrase-editor');
		container.innerHTML = templateHtml;
		
		populateForm(container, defaultState);
		
		const form = container.querySelector('#rephrase-editor-form');
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

// NEW: This file contains the logic for the "Expand" prompt builder.

// Default state for the expand form.
const defaultState = {
	focus: 'generic',
	expand_length: 'default',
	instructions: '',
	use_codex: true,
	use_surrounding_text: true,
	use_pov: true,
};

// Builds the final prompt JSON based on form data.
const buildPromptJson = (formData) => {
	// Build Instructions Block
	let instructionsBlock = '';
	const mainInstruction = {
		'sensory': 'Expand the text by adding/highlighting sensory details (e.g. smell, touch, sound, ...) that fit the context.',
		'feelings': 'Go in depth about their feelings.',
		'introspection': 'Add more inner thoughts/dialogue about what\'s happening. We want to really be in their head!',
		'generic': 'Expand the text further by fleshing out the details, descriptions, and add more context to the scene.'
	}[formData.focus];
	
	if (formData.instructions) {
		instructionsBlock = `<instructions>\n ${mainInstruction}\n ${formData.instructions}\n</instructions>`;
	} else {
		instructionsBlock = `<instructions>\n ${mainInstruction}\n</instructions>`;
	}
	
	// Build Length Block
	let lengthBlock = '';
	if (formData.expand_length !== 'default') {
		const lengthInstruction = {
			'double': `Double the length of the given prose. Your current word target is {multiply(wordCount(message), 2)} words.`,
			'triple': `Triple the length of the given prose. Your current word target is {multiply(wordCount(message), 3)} words.`
		}[formData.expand_length];
		lengthBlock = `\n\n<targetWordCount>\n ${lengthInstruction}\n</targetWordCount>`;
	}
	
	const system = `You are an expert prose editor.

Whenever you're given text, expand it according to the instructions. Imitiate the current writing style perfectly, keeping mannerisms, word choice and sentence structure intact.
Keep the same tense and stylistic choices. Use {novel.language} spelling and grammar.

${instructionsBlock}
${lengthBlock}

If the original text contains dialogue, keep the matter of the dialogue intact, but change the wording to hit the target length.

If needed, split the expanded text into more paragraphs (add new ones as needed). Split them where it makes sense, e.g.:
- when a new character enters the scene or when the location changes
- a new thought or action starts, or we switch from thoughts to action (and vice-versa)
- someone starts talking

Only return the expanded text, nothing else.`;
	
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
		system: system.replace(/\n\n\n/g, '\n\n'), // Clean up extra newlines
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ''
	};
};

// Updates the live preview area in the UI.
const updatePreview = (container) => {
	const form = container.querySelector('#expand-editor-form');
	if (!form) return;
	
	const formData = {
		focus: form.elements.focus.value,
		expand_length: form.elements.expand_length.value,
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

// Populates the form with a given state.
const populateForm = (container, state) => {
	const form = container.querySelector('#expand-editor-form');
	if (!form) return;
	
	form.elements.focus.value = state.focus;
	// MODIFIED: Use bracket notation here as well to prevent the error.
	console.log(state);
	form.elements.expand_length.value = state.expand_length;
	form.elements.instructions.value = state.instructions;
	form.elements.use_codex.checked = state.use_codex;
	form.elements.use_surrounding_text.checked = state.use_surrounding_text;
	form.elements.use_pov.checked = state.use_pov;
};

// Main initialization function for this editor.
export const init = async (container) => {
	try {
		const templateHtml = await window.api.getTemplate('expand-editor');
		container.innerHTML = templateHtml;
		
		populateForm(container, defaultState);
		
		const form = container.querySelector('#expand-editor-form');
		const resetButton = container.querySelector('.js-reset-expand-btn');
		
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

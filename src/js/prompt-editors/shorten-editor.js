// NEW: This file contains the logic for the "Shorten" prompt builder.

const defaultState = {
	shorten_length: 'half',
	instructions: '',
	// NEW: Added selectedCodexIds to default state.
	selectedCodexIds: [],
	use_surrounding_text: true,
	use_pov: true,
};

// NEW: Renders the list of codex entries as checkboxes.
const renderCodexList = (container, context) => {
	const codexContainer = container.querySelector('.js-codex-selection-container');
	if (!codexContainer) return;
	
	const { allCodexEntries, linkedCodexEntryIds } = context;
	
	if (!allCodexEntries || allCodexEntries.length === 0) {
		codexContainer.innerHTML = '<p class="text-sm text-base-content/60">No codex entries found for this novel.</p>';
		return;
	}
	
	const listHtml = allCodexEntries.map(entry => {
		const isChecked = linkedCodexEntryIds.includes(entry.id);
		return `
            <div class="form-control">
                <label class="label cursor-pointer justify-start gap-4 py-1">
                    <input type="checkbox" name="codex_entry" value="${entry.id}" ${isChecked ? 'checked' : ''} class="checkbox checkbox-sm" />
                    <span class="label-text">${entry.title}</span>
                </label>
            </div>
        `;
	}).join('');
	
	codexContainer.innerHTML = `<h4 class="label-text font-semibold mb-1">Use Codex Entries</h4>${listHtml}`;
};

// NEW: Updates the word count previews in the length dropdown.
const updateLengthPreviews = (container, wordCount) => {
	if (wordCount === 0) return;
	
	const halfOption = container.querySelector('select[name="shorten_length"] option[value="half"] span');
	const quarterOption = container.querySelector('select[name="shorten_length"] option[value="quarter"] span');
	
	if (halfOption) halfOption.textContent = `(approx. ${Math.round(wordCount / 2)} words)`;
	if (quarterOption) quarterOption.textContent = `(approx. ${Math.round(wordCount / 4)} words)`;
};

// MODIFIED: Builds the final prompt JSON based on form data and editor context.
const buildPromptJson = (formData, context) => {
	const { selectedText, wordCount } = context;
	
	let lengthInstruction = '';
	// MODIFIED: Use actual word count for a more accurate preview.
	switch (formData.shorten_length) {
		case 'half':
			lengthInstruction = `Halve the length of the given prose. Your current word target is ${Math.round(wordCount / 2)} words. Do not return more.`;
			break;
		case 'quarter':
			lengthInstruction = `Quarter the length of the given prose. Your current word target is ${Math.round(wordCount / 4)} words. Do not return more.`;
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
	
	const useCodex = formData.selectedCodexIds.length > 0;
	const truncatedText = selectedText.length > 300 ? selectedText.substring(0, 300) + '...' : selectedText;
	
	// NEW: Added codex block to user prompt.
	const user = `${useCodex ? `{#if codex.context}
Take into account the following glossary of characters/locations/items/lore... when writing your response:
<codex>
{codex.context}
</codex>
{#endif}

` : ''}${formData.use_pov ? `{pov}\n\n` : ''}${formData.use_surrounding_text ? `{#if either(hasTextAfter, hasTextBefore)}
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
<text words="${wordCount}">
${wordCount > 0 ? truncatedText : '{message}'}
</text>`;
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ''
	};
};

// MODIFIED: Updates the live preview area in the UI using context.
const updatePreview = (container, context) => {
	const form = container.querySelector('#shorten-editor-form');
	if (!form) return;
	
	const formData = {
		shorten_length: form.elements.shorten_length.value,
		instructions: form.elements.instructions.value.trim(),
		selectedCodexIds: Array.from(form.elements.codex_entry).filter(cb => cb.checked).map(cb => cb.value),
		use_surrounding_text: form.elements.use_surrounding_text.checked,
		use_pov: form.elements.use_pov.checked,
	};
	
	const systemPreview = container.querySelector('.js-preview-system');
	const userPreview = container.querySelector('.js-preview-user');
	const aiPreview = container.querySelector('.js-preview-ai');
	
	if (!systemPreview || !userPreview || !aiPreview) return;
	
	try {
		const promptJson = buildPromptJson(formData, context);
		systemPreview.textContent = promptJson.system;
		userPreview.textContent = promptJson.user;
		aiPreview.textContent = promptJson.ai || '(Empty)';
	} catch (error) {
		systemPreview.textContent = `Error building preview: ${error.message}`;
		userPreview.textContent = '';
		aiPreview.textContent = '';
	}
};

// MODIFIED: Populates the form with a given state.
const populateForm = (container, state) => {
	const form = container.querySelector('#shorten-editor-form');
	if (!form) return;
	
	form.elements.shorten_length.value = state.shorten_length;
	form.elements.instructions.value = state.instructions;
	// Note: Codex checkboxes are populated by renderCodexList, not here.
	form.elements.use_surrounding_text.checked = state.use_surrounding_text;
	form.elements.use_pov.checked = state.use_pov;
};

// MODIFIED: Main initialization function now accepts context.
export const init = async (container, context) => {
	try {
		const templateHtml = await window.api.getTemplate('shorten-editor');
		container.innerHTML = templateHtml;
		
		const wordCount = context.selectedText ? context.selectedText.trim().split(/\s+/).filter(Boolean).length : 0;
		const fullContext = { ...context, wordCount };
		
		populateForm(container, defaultState);
		renderCodexList(container, fullContext);
		updateLengthPreviews(container, wordCount);
		
		const form = container.querySelector('#shorten-editor-form');
		const resetButton = container.querySelector('.js-reset-btn');
		
		if (form) {
			form.addEventListener('input', () => updatePreview(container, fullContext));
		}
		
		if (resetButton) {
			resetButton.addEventListener('click', () => {
				if (confirm('Are you sure you want to reset the form to its default settings?')) {
					populateForm(container, defaultState);
					// Uncheck all codex entries on reset
					container.querySelectorAll('input[name="codex_entry"]').forEach(cb => cb.checked = false);
					updatePreview(container, fullContext);
				}
			});
		}
		
		updatePreview(container, fullContext);
	} catch (error) {
		container.innerHTML = `<p class="p-4 text-error">Could not load editor form.</p>`;
		console.error(error);
	}
};

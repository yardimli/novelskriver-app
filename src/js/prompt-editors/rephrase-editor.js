// This file contains the logic for the "Rephrase" prompt builder.

const defaultState = {
	instructions: '',
	selectedCodexIds: [],
	use_surrounding_text: true,
	use_pov: true,
};

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

// NEW: Helper function to build the surrounding text block for prompts.
const buildSurroundingTextBlock = (use, wordsBefore, wordsAfter) => {
	if (!use || (!wordsBefore && !wordsAfter)) {
		return '';
	}
	let block = 'For contextual information, refer to surrounding words in the scene, DO NOT REPEAT THEM:\n';
	if (wordsBefore) {
		block += `<textBefore>\n${wordsBefore}\n</textBefore>\n`;
	}
	if (wordsAfter) {
		block += `<textAfter>\n${wordsAfter}\n</textAfter>\n`;
	}
	return block;
};

// Export this function for use in the main prompt editor module.
export const buildPromptJson = (formData, context) => {
	// MODIFIED: Destructure new context properties.
	const { selectedText, wordCount, allCodexEntries, novelLanguage, povString, wordsBefore, wordsAfter } = context;
	
	// MODIFIED: System prompt now uses the dynamic novel language.
	const system = `You are an expert prose editor.

Whenever you're given text, rephrase it using the following instructions: <instructions>${formData.instructions || 'Rephrase the given text.'}</instructions>

Imitiate and keep the current writing style, and leave mannerisms, word choice and sentence structure intact.
You are free to remove redundant lines of speech. Keep the same tense and stylistic choices. Use ${novelLanguage || 'English'} spelling and grammar.

Only return the rephrased text, nothing else.`;
	
	let codexBlock = '';
	if (formData.selectedCodexIds && formData.selectedCodexIds.length > 0) {
		const selectedEntries = allCodexEntries.filter(entry => formData.selectedCodexIds.includes(String(entry.id)));
		if (selectedEntries.length > 0) {
			const codexContent = selectedEntries.map(entry => {
				// Strip HTML from content for a cleaner preview.
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = entry.content || '';
				const plainContent = tempDiv.textContent || tempDiv.innerText || '';
				return `Title: ${entry.title}\nContent: ${plainContent.trim()}`;
			}).join('\n\n');
			
			codexBlock = `Take into account the following glossary of characters/locations/items/lore... when writing your response:
<codex>
${codexContent}
</codex>`;
		}
	}
	
	const truncatedText = selectedText.length > 4096 ? selectedText.substring(0, 4096) + '...' : selectedText;
	
	// MODIFIED: User prompt is built dynamically with new context.
	const surroundingText = buildSurroundingTextBlock(formData.use_surrounding_text, wordsBefore, wordsAfter);
	
	const userParts = [codexBlock];
	if (formData.use_pov && povString) {
		userParts.push(povString);
	}
	if (surroundingText) {
		userParts.push(surroundingText);
	}
	userParts.push(`Text to rewrite:\n<text words="${wordCount}">\n${wordCount > 0 ? truncatedText : '{message}'}\n</text>`);
	
	const user = userParts.filter(Boolean).join('\n\n');
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user,
		ai: '',
	};
};

const updatePreview = (container, context) => {
	const form = container.querySelector('#rephrase-editor-form');
	if (!form) return;
	
	const formData = {
		instructions: form.elements.instructions.value.trim(),
		selectedCodexIds: form.elements.codex_entry ? Array.from(form.elements.codex_entry).filter(cb => cb.checked).map(cb => cb.value) : [],
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

const populateForm = (container, state) => {
	const form = container.querySelector('#rephrase-editor-form');
	if (!form) return;
	
	form.elements.instructions.value = state.instructions;
	// Note: Codex checkboxes are populated by renderCodexList, not here.
	form.elements.use_surrounding_text.checked = state.use_surrounding_text;
	form.elements.use_pov.checked = state.use_pov;
};

export const init = async (container, context) => {
	try {
		const templateHtml = await window.api.getTemplate('rephrase-editor');
		container.innerHTML = templateHtml;
		
		const wordCount = context.selectedText ? context.selectedText.trim().split(/\s+/).filter(Boolean).length : 0;
		const fullContext = { ...context, wordCount };
		
		populateForm(container, defaultState);
		renderCodexList(container, fullContext);
		
		const form = container.querySelector('#rephrase-editor-form');
		
		if (form) {
			form.addEventListener('input', () => updatePreview(container, fullContext));
		}
		
		updatePreview(container, fullContext);
	} catch (error) {
		container.innerHTML = `<p class="p-4 text-error">Could not load editor form.</p>`;
		console.error(error);
	}
};

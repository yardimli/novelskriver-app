// This file contains the logic for the "Scene Beat" prompt builder.

const defaultState = {
	words: 250,
	instructions: '',
	selectedCodexIds: [],
	use_story_so_far: true,
};

// MODIFIED: Renders codex entries grouped by category into a multi-column layout.
const renderCodexList = (container, context, initialState = null) => {
	const codexContainer = container.querySelector('.js-codex-selection-container');
	if (!codexContainer) return;
	
	const { allCodexEntries, linkedCodexEntryIds } = context; // allCodexEntries is now categories
	
	if (!allCodexEntries || allCodexEntries.length === 0) {
		codexContainer.innerHTML = '<p class="text-sm text-base-content/60">No codex entries found for this novel.</p>';
		return;
	}
	
	const selectedIds = initialState ? initialState.selectedCodexIds : linkedCodexEntryIds.map(String);
	
	const categoriesHtml = allCodexEntries.map(category => {
		if (!category.entries || category.entries.length === 0) {
			return '';
		}
		
		const entriesHtml = category.entries.map(entry => {
			const isChecked = selectedIds.includes(String(entry.id));
			return `
                <div class="form-control">
                    <label class="label cursor-pointer justify-start gap-2 py-0.5">
                        <input type="checkbox" name="codex_entry" value="${entry.id}" ${isChecked ? 'checked' : ''} class="checkbox checkbox-xs" />
                        <span class="label-text text-sm">${entry.title}</span>
                    </label>
                </div>
            `;
		}).join('');
		
		return `
            <div class="break-inside-avoid mb-4">
                <h4 class="label-text font-semibold mb-1 text-base-content/80 border-b border-base-300 pb-1">${category.name}</h4>
                <div class="space-y-1 pt-1">
                    ${entriesHtml}
                </div>
            </div>
        `;
	}).join('');
	
	// NEW: Renders a heading and a multi-column, scrollable container for the categories.
	codexContainer.innerHTML = `
        <h4 class="label-text font-semibold mb-2">Use Codex Entries</h4>
        <div class="max-h-72 overflow-y-auto pr-2" style="column-count: 2; column-gap: 1.5rem;">
            ${categoriesHtml}
        </div>
    `;
};

// Export this function for use in the main prompt editor module.
export const buildPromptJson = (formData, context) => {
	const { allCodexEntries, novelLanguage, novelTense, povString, wordsBefore } = context;
	
	const system = `You are an expert fiction writer.

Always keep the following rules in mind:
- Write in ${novelTense || 'past tense'} and use ${novelLanguage || 'English'} spelling, grammar, and colloquialisms/slang.
- Write in active voice
- Always follow the "show, don't tell" principle.
- Avoid adverbs and cliches and overused/commonly used phrases. Aim for fresh and original descriptions.
- Convey events and story through dialogue.
- Mix short, punchy sentences with long, descriptive ones. Drop fill words to add variety.
- Skip "he/she said said" dialogue tags and convey people's actions or face expressions through their speech
- Avoid mushy dialog and descriptions, have dialogue always continue the action, never stall or add unnecessary fluff. Vary the descriptions to not repeat yourself.
- Put dialogue on its own paragraph to separate scene and action.
- Reduce indicators of uncertainty like "trying" or "maybe"

When writing text:
- NEVER conclude the scene on your own, follow the beat instructions very closely.
- NEVER end with foreshadowing.
- NEVER write further than what I prompt you with.
- AVOID imagining possible endings, NEVER deviate from the instructions.
- STOP EARLY if the continuation contains what was required in the instructions. You do not need to fill out the full amount of words possible.`;
	
	let codexBlock = '';
	// MODIFIED: Flatten the categorized codex entries to search for selected ones.
	const allEntriesFlat = allCodexEntries.flatMap(category => category.entries);
	if (formData.selectedCodexIds && formData.selectedCodexIds.length > 0) {
		const selectedEntries = allEntriesFlat.filter(entry => formData.selectedCodexIds.includes(String(entry.id)));
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
</codex>

`;
		}
	}
	
	const user = `${codexBlock}
	${formData.use_story_so_far ? `{! Include all scene summaries up until, but excluding, this scene !}
{#if storySoFar}
 The story so far:
 {storySoFar}
{#endif}

` : ''}`;
	
	const ai = `

{! If no text is before this beat, include text from the previous scene, but only if told from the same character. This helps with matching your writing style across scenes. !}
{#if and(
 isStartOfText,
 pov.character is pov.character(scene.previous)
)}
 {lastWords(scene.fullText(scene.previous), 650)}
{#endif}

{! Otherwise, include recent text before this beat within this scene !}
${wordsBefore || ''}

User
Write ${formData.words || 250} words that continue the story, using the following instructions:
<instructions>
 {! This will use the novel's POV, or any scene override !}
 ${povString || ''}

 ${formData.instructions || 'Continue the story.'}
</instructions>

`;
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ai.replace(/\n\n\n/g, '\n\n'),
	};
};

const updatePreview = (container, context) => {
	const form = container.querySelector('#scene-beat-editor-form');
	if (!form) return;
	
	const formData = {
		words: form.elements.words.value,
		instructions: form.elements.instructions.value.trim(),
		selectedCodexIds: form.elements.codex_entry ? Array.from(form.elements.codex_entry).filter(cb => cb.checked).map(cb => cb.value) : [],
		use_story_so_far: form.elements.use_story_so_far.checked,
	};
	
	const systemPreview = container.querySelector('.js-preview-system');
	const userPreview = container.querySelector('.js-preview-user');
	const aiPreview = container.querySelector('.js-preview-ai');
	
	if (!systemPreview || !userPreview || !aiPreview) return;
	
	try {
		const promptJson = buildPromptJson(formData, context);
		systemPreview.textContent = promptJson.system;
		userPreview.textContent = promptJson.user || '(Empty)';
		aiPreview.textContent = promptJson.ai;
	} catch (error) {
		systemPreview.textContent = `Error building preview: ${error.message}`;
		userPreview.textContent = '';
		aiPreview.textContent = '';
	}
};

const populateForm = (container, state) => {
	const form = container.querySelector('#scene-beat-editor-form');
	if (!form) return;
	
	form.elements.words.value = state.words;
	form.elements.instructions.value = state.instructions;
	form.elements.use_story_so_far.checked = state.use_story_so_far;
};

export const init = async (container, context) => {
	try {
		const templateHtml = await window.api.getTemplate('scene-beat-editor');
		container.innerHTML = templateHtml;
		
		const wordCount = context.selectedText ? context.selectedText.trim().split(/\s+/).filter(Boolean).length : 0;
		const fullContext = { ...context, wordCount };
		
		// MODIFIED: Populate form with initial state from context if it exists, otherwise use defaults.
		populateForm(container, context.initialState || defaultState);
		// MODIFIED: Pass initial state to renderCodexList to check the correct boxes.
		renderCodexList(container, fullContext, context.initialState);
		
		const form = container.querySelector('#scene-beat-editor-form');
		
		if (form) {
			form.addEventListener('input', () => updatePreview(container, fullContext));
		}
		
		updatePreview(container, fullContext);
	} catch (error) {
		container.innerHTML = `<p class="p-4 text-error">Could not load editor form.</p>`;
		console.error(error);
	}
};

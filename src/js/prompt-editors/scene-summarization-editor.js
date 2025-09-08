// NEW: This file contains the logic for the "Scene Summarization" prompt builder.

const defaultState = {
	words: 100,
	instructions: '',
	// NEW: Added selectedCodexIds to default state.
	selectedCodexIds: [],
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

// MODIFIED: Builds the final prompt JSON based on form data and editor context.
const buildPromptJson = (formData, context) => {
	const { selectedText, allCodexEntries } = context; // MODIFIED: Destructure allCodexEntries.
	
	const system = `You are an expert novel summarizer.
Whenever you're given text, summarize it into a concise, condensed version.

Keep the following rules in mind:
- Don't write more than ${formData.words || 100} words.
- Always write in {novel.language} spelling and grammar.
- Only return the summary in running text, don't abbreviate to bullet points.
- Don't start with "In this scene..." or "Here is...". Only write the summary itself.
- Mention characters by name and never by their role (e.g. protagonist, mentor, friend, author).
- Assume the reader is familiar with character or location profiles, so don't explain who everyone is.
- Use third person, regardless of the POV of the scene itself.
- Write in present tense.
- Use nouns instead of pronouns (Don't use he, she, they, etc. instead use actual names).
- If a sequence of events gets too long, or there's a major shift in location, always start a new paragraph within the summary.

A strong summary consists of the following:
- Knowing when and where things happen (don't leave out location or time changes within the scene - remember to start them on a new paragraph).
- No talking about backstory, previous summaries already covered these parts.
- Not talking about day-to-day or mundane actions, unless they're important to the plot and its development.
- No talking about background activities or people/happenings. Only characters/locations/etc. mentioned by name are significant.
- No introspection - neither at the start nor end of the summary.
- Keeping only the most important key details, leaving out sensory details, descriptions and dialogue:
 1. <bad>X met Y, they had coffee and later visited Z.</bad>
 <good>Over coffee, X argued with Y about... W comes by and leads them to Z.</good>
 2. <bad>X walks through Y, seeking Z.</bad>
 <good>At Y, X attempts to get Z to....</good>
 3. <bad>As they have coffee, X talks about Y their plans to do Z.</bad>
 <good>X and Y discuss their plans for Z.</good>

${formData.instructions ? `Additional instructions have been provided to tweak your role, behavior and capabilities. Follow them closely:
<instructions>
${formData.instructions}
</instructions>
` : ''}`;
	
	// NEW: Build the codex block for the preview.
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
</codex>

`;
		}
	}
	
	const truncatedText = selectedText.length > 300 ? selectedText.substring(0, 300) + '...' : selectedText;
	
	const user = `${codexBlock}

${formData.use_pov ? `{! Give a hint about the POV, if specified !}
{#if pov}
 <scenePointOfView>
 This scene is written in {pov.type} point of view{ifs(pov.character, " from the perspective of " + pov.character)}.
 </scenePointOfView>
{#endif}

` : ''}

{! Make sure that we don't get something like 'I walked...' !}
Write the summary in third person, and use present tense.

Text to summarize:
<scene>
${selectedText ? truncatedText : '{removeWhitespace(scene.fullText)}'}
</scene>`;
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ''
	};
};

// MODIFIED: Updates the live preview area in the UI using context.
const updatePreview = (container, context) => {
	const form = container.querySelector('#scene-summarization-editor-form');
	if (!form) return;
	
	const formData = {
		words: form.elements.words.value,
		instructions: form.elements.instructions.value.trim(),
		// MODIFIED: Handle cases where no codex entries exist.
		selectedCodexIds: form.elements.codex_entry ? Array.from(form.elements.codex_entry).filter(cb => cb.checked).map(cb => cb.value) : [],
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
	const form = container.querySelector('#scene-summarization-editor-form');
	if (!form) return;
	
	form.elements.words.value = state.words;
	form.elements.instructions.value = state.instructions;
	// Note: Codex checkboxes are populated by renderCodexList, not here.
	form.elements.use_pov.checked = state.use_pov;
};

// MODIFIED: Main initialization function now accepts context.
export const init = async (container, context) => {
	try {
		const templateHtml = await window.api.getTemplate('scene-summarization-editor');
		container.innerHTML = templateHtml;
		
		const wordCount = context.selectedText ? context.selectedText.trim().split(/\s+/).filter(Boolean).length : 0;
		const fullContext = { ...context, wordCount };
		
		populateForm(container, defaultState);
		renderCodexList(container, fullContext);
		
		const form = container.querySelector('#scene-summarization-editor-form');
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

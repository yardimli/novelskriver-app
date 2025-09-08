// NEW: This file contains the logic for the "Scene Beat" prompt builder.

const defaultState = {
	words: 250,
	instructions: '',
	use_codex: true,
	use_story_so_far: true,
};

const buildPromptJson = (formData) => {
	const system = `You are an expert fiction writer.

Always keep the following rules in mind:
- Write in {novel.tense} and use {novel.language} spelling, grammar, and colloquialisms/slang.
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
	
	const user = `${formData.use_codex ? `{#if codex.context}
Take into account the following glossary of characters/locations/items/lore... when writing your response:
<codex>
{codex.context}
</codex>
{#endif}

` : ''}${formData.use_story_so_far ? `{! Include all scene summaries up until, but excluding, this scene !}
{#if storySoFar}
 The story so far:
 {storySoFar}
{#endif}

` : ''}`;
	
	const ai = `{! This message has been set to "AI", so it can mimic your writing style because it thinks it wrote this. !}

{! If no text is before this beat, include text from the previous scene, but only if told from the same character. This helps with matching your writing style across scenes. !}
{#if and(
 isStartOfText,
 pov.character is pov.character(scene.previous)
)}
 {lastWords(scene.fullText(scene.previous), 650)}
{#endif}

{! Otherwise, include recent text before this beat within this scene !}
{textBefore}

User
Write ${formData.words || 250} words that continue the story, using the following instructions:
<instructions>
 {! This will use the novel's POV, or any scene override !}
 {pov}

 ${formData.instructions || 'Continue the story.'}
</instructions>

{! We don't want to include codex entries twice in the additional context !}
{! As such, we store this in the local context and use it here !}
{local('context', without(input("Additional Context"), codex.context))}

{#if local('context')}
Here is some additional information to help you with your answer:
<additionalContext>
{asXml(local('context'))}
</additionalContext>
{#endif}`;
	
	return {
		system: system.replace(/\n\n\n/g, '\n\n'),
		user: user.replace(/\n\n\n/g, '\n\n'),
		ai: ai.replace(/\n\n\n/g, '\n\n')
	};
};

const updatePreview = (container) => {
	const form = container.querySelector('#scene-beat-editor-form');
	if (!form) return;
	
	const formData = {
		words: form.elements.words.value,
		instructions: form.elements.instructions.value.trim(),
		use_codex: form.elements.use_codex.checked,
		use_story_so_far: form.elements.use_story_so_far.checked,
	};
	
	const systemPreview = container.querySelector('.js-preview-system');
	const userPreview = container.querySelector('.js-preview-user');
	const aiPreview = container.querySelector('.js-preview-ai');
	
	if (!systemPreview || !userPreview || !aiPreview) return;
	
	try {
		const promptJson = buildPromptJson(formData);
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
	form.elements.use_codex.checked = state.use_codex;
	form.elements.use_story_so_far.checked = state.use_story_so_far;
};

export const init = async (container) => {
	try {
		const templateHtml = await window.api.getTemplate('scene-beat-editor');
		container.innerHTML = templateHtml;
		
		populateForm(container, defaultState);
		
		const form = container.querySelector('#scene-beat-editor-form');
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

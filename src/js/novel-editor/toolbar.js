import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';

let activeEditorView = null;
const toolbar = document.getElementById('top-toolbar');
const wordCountEl = document.getElementById('js-word-count');

let isAiActionActive = false;
let originalFragment = null;
let aiActionRange = null;
let currentAiParams = null;
let floatingToolbar = null;

function isNodeActive(state, type) {
	const { $from } = state.selection;
	for (let i = $from.depth; i > 0; i--) {
		if ($from.node(i).type === type) {
			return true;
		}
	}
	return false;
}

// MODIFIED: Opens and populates the "New Codex Entry" modal, now with AI suggestions.
async function handleCreateCodexFromSelection() { // MODIFIED: Make function async
	if (!activeEditorView) return;
	const { state } = activeEditorView;
	if (state.selection.empty) return;
	
	const selectedText = state.doc.textBetween(state.selection.from, state.selection.to, ' ');
	
	const modal = document.getElementById('new-codex-entry-modal');
	const form = document.getElementById('new-codex-entry-form');
	if (!modal || !form) return;
	
	// Reset form in case it was used before
	form.reset();
	form.querySelector('#new-category-wrapper').classList.add('hidden');
	// Clear any previous errors
	form.querySelectorAll('.js-error-message').forEach(el => {
		el.textContent = '';
		el.classList.add('hidden');
	});
	const genericErrorContainer = form.querySelector('#new-codex-error-container');
	if (genericErrorContainer) {
		genericErrorContainer.classList.add('hidden');
		genericErrorContainer.textContent = '';
	}
	
	// Populate fields with selection as a fallback
	const titleInput = form.querySelector('#new-codex-title');
	const contentTextarea = form.querySelector('#new-codex-content');
	const categorySelect = form.querySelector('#new-codex-category'); // NEW
	const spinner = document.getElementById('new-codex-ai-spinner'); // NEW
	
	if (titleInput) titleInput.value = selectedText.trim();
	if (contentTextarea) contentTextarea.value = selectedText;
	
	modal.showModal();
	
	// NEW: AI-powered suggestion logic
	if (spinner) spinner.classList.remove('hidden');
	try {
		const novelId = document.body.dataset.novelId;
		const result = await window.api.suggestCodexDetails(novelId, selectedText);
		
		if (result.success) {
			if (result.title && titleInput) {
				titleInput.value = result.title;
			}
			if (result.categoryId && categorySelect) {
				categorySelect.value = result.categoryId;
			}
		} else {
			console.warn('AI suggestion for codex entry failed:', result.message);
		}
	} catch (error) {
		console.error('Error getting AI suggestion for codex entry:', error);
	} finally {
		if (spinner) spinner.classList.add('hidden');
	}
}


export function updateToolbarState(view) {
	activeEditorView = view;
	const allBtns = toolbar.querySelectorAll('.js-toolbar-btn, .js-ai-action-btn');
	
	const isMarkActive = (state, type) => {
		if (!type) return false;
		const { from, $from, to, empty } = state.selection;
		if (empty) {
			return !!(state.storedMarks || $from.marks()).some(mark => mark.type === type);
		}
		return state.doc.rangeHasMark(from, to, type);
	};
	
	if (view && view.state) {
		const { state } = view;
		const { schema } = state;
		const { from, to, empty, $from } = state.selection;
		
		const isTextSelected = !empty;
		
		allBtns.forEach(btn => {
			const cmd = btn.dataset.command;
			let commandFn, markType;
			
			switch (cmd) {
				case 'undo': btn.disabled = !undo(state); return;
				case 'redo': btn.disabled = !redo(state); return;
				// NEW: Enable/disable the "Create Codex" button based on text selection.
				case 'create_codex':
					btn.disabled = empty;
					return;
				case 'bold': markType = schema.marks.strong; commandFn = toggleMark(markType); break;
				case 'italic': markType = schema.marks.em; commandFn = toggleMark(markType); break;
				case 'underline': markType = schema.marks.underline; commandFn = toggleMark(markType); break;
				case 'strike': markType = schema.marks.strike; commandFn = toggleMark(markType); break;
				case 'blockquote':
					commandFn = isNodeActive(state, schema.nodes.blockquote) ? lift : wrapIn(schema.nodes.blockquote);
					btn.classList.toggle('active', isNodeActive(state, schema.nodes.blockquote));
					break;
				case 'bullet_list':
					commandFn = isNodeActive(state, schema.nodes.bullet_list) ? liftListItem(schema.nodes.list_item) : wrapInList(schema.nodes.bullet_list);
					btn.classList.toggle('active', isNodeActive(state, schema.nodes.bullet_list));
					break;
				case 'ordered_list':
					commandFn = isNodeActive(state, schema.nodes.ordered_list) ? liftListItem(schema.nodes.list_item) : wrapInList(schema.nodes.ordered_list);
					btn.classList.toggle('active', isNodeActive(state, schema.nodes.ordered_list));
					break;
				case 'horizontal_rule':
					btn.disabled = !((state, dispatch) => {
						if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()));
						return true;
					})(state);
					return;
			}
			
			if (btn.closest('.js-dropdown-container') || btn.classList.contains('js-ai-action-btn')) {
				btn.disabled = !isTextSelected || isAiActionActive;
			}
			
			if (commandFn) {
				btn.disabled = !commandFn(state);
			}
			
			if (markType) {
				btn.classList.toggle('active', isMarkActive(state, markType));
			}
		});
		
		const headingBtn = toolbar.querySelector('.js-heading-btn');
		if (headingBtn) {
			const parent = $from.parent;
			if (parent.type.name === 'heading') {
				headingBtn.textContent = `Heading ${parent.attrs.level}`;
			} else {
				headingBtn.textContent = 'Paragraph';
			}
			headingBtn.disabled = !setBlockType(schema.nodes.paragraph)(state) && !setBlockType(schema.nodes.heading, { level: 1 })(state);
		}
		
		if (isTextSelected) {
			const text = state.doc.textBetween(from, to, ' ');
			const words = text.trim().split(/\s+/).filter(Boolean);
			wordCountEl.textContent = `${words.length} word${words.length !== 1 ? 's' : ''} selected`;
		} else {
			wordCountEl.textContent = 'No text selected';
		}
		
	} else {
		allBtns.forEach(btn => { btn.disabled = true; btn.classList.remove('active'); });
		const headingBtn = toolbar.querySelector('.js-heading-btn');
		if (headingBtn) headingBtn.textContent = 'Paragraph';
		wordCountEl.textContent = 'No text selected';
	}
}

function applyCommand(command, attrs = {}) {
	if (!activeEditorView) return;
	
	const { state, dispatch } = activeEditorView;
	const { schema } = state;
	let cmd;
	
	switch (command) {
		case 'bold': cmd = toggleMark(schema.marks.strong); break;
		case 'italic': cmd = toggleMark(schema.marks.em); break;
		case 'underline': cmd = toggleMark(schema.marks.underline); break;
		case 'strike': cmd = toggleMark(schema.marks.strike); break;
		case 'blockquote':
			cmd = isNodeActive(state, schema.nodes.blockquote) ? lift : wrapIn(schema.nodes.blockquote);
			break;
		case 'bullet_list':
			cmd = isNodeActive(state, schema.nodes.bullet_list) ? liftListItem(schema.nodes.list_item) : wrapInList(schema.nodes.bullet_list);
			break;
		case 'ordered_list':
			cmd = isNodeActive(state, schema.nodes.ordered_list) ? liftListItem(schema.nodes.list_item) : wrapInList(schema.nodes.ordered_list);
			break;
		case 'horizontal_rule':
			dispatch(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()));
			break;
		case 'heading':
			const { level } = attrs;
			cmd = (level === 0)
				? setBlockType(schema.nodes.paragraph)
				: setBlockType(schema.nodes.heading, { level });
			break;
	}
	
	if (cmd) {
		cmd(state, dispatch);
	}
}

function applyHighlight(color) {
	if (!activeEditorView) return;
	
	const { state } = activeEditorView;
	const { schema } = state;
	const { from, to } = state.selection;
	let tr = state.tr;
	
	Object.keys(schema.marks).forEach(markName => {
		if (markName.startsWith('highlight_')) {
			tr = tr.removeMark(from, to, schema.marks[markName]);
		}
	});
	
	if (color !== 'transparent') {
		const markType = schema.marks[`highlight_${color}`];
		if (markType) {
			tr = tr.addMark(from, to, markType.create());
		}
	}
	
	activeEditorView.dispatch(tr);
}

// --- NEW: AI Action Review Workflow ---

/**
 * Toggles the editable state of the active ProseMirror editor.
 * @param {EditorView} view The editor view instance.
 * @param {boolean} isEditable Whether the editor should be editable.
 */
function setEditorEditable(view, isEditable) {
	view.setProps({
		editable: () => isEditable,
	});
}

/**
 * Cleans up the editor state after an AI action is completed (applied or discarded).
 */
function cleanupAiAction() {
	if (floatingToolbar) {
		floatingToolbar.remove();
		floatingToolbar = null;
	}
	
	if (activeEditorView) {
		setEditorEditable(activeEditorView, true);
		const { state, dispatch } = activeEditorView;
		const { schema } = state;
		// Remove the suggestion mark from the entire document to be safe.
		const tr = state.tr.removeMark(0, state.doc.content.size, schema.marks.ai_suggestion);
		dispatch(tr);
		activeEditorView.focus();
	}
	
	isAiActionActive = false;
	originalFragment = null;
	aiActionRange = null;
	currentAiParams = null;
	updateToolbarState(activeEditorView);
}

/** Handles the 'Apply' action from the floating toolbar. */
function handleApply() {
	if (!isAiActionActive || !activeEditorView) return;
	cleanupAiAction();
}

/** Handles the 'Discard' action from the floating toolbar. */
function handleDiscard() {
	if (!isAiActionActive || !activeEditorView || !originalFragment) return;
	
	const { state, dispatch } = activeEditorView;
	// Replace the AI suggestion with the stored original text fragment.
	const tr = state.tr.replace(aiActionRange.from, aiActionRange.to, originalFragment);
	dispatch(tr);
	
	cleanupAiAction();
}

/** Handles the 'Retry' action from the floating toolbar. */
async function handleRetry() {
	if (!isAiActionActive || !activeEditorView || !currentAiParams) return;
	
	const { state, dispatch } = activeEditorView;
	
	// First, discard the current changes to reset the editor state.
	const tr = state.tr.replace(aiActionRange.from, aiActionRange.to, originalFragment);
	dispatch(tr);
	
	if (floatingToolbar) {
		floatingToolbar.remove();
		floatingToolbar = null;
	}
	
	// This is the key fix for the retry functionality.
	isAiActionActive = false;
	
	// Now, re-run the AI action with the stored parameters.
	await handleAiAction(null, currentAiParams);
}

/**
 * Creates and displays the floating toolbar for reviewing AI suggestions.
 * @param {EditorView} view The editor view instance.
 * @param {number} from The starting position of the suggestion.
 * @param {number} to The ending position of the suggestion.
 * @param {string} model The AI model used for generation.
 */
function createFloatingToolbar(view, from, to, model) {
	if (floatingToolbar) floatingToolbar.remove();
	
	const text = view.state.doc.textBetween(from, to, ' ');
	const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
	const modelName = model.split('/').pop() || model;
	
	const toolbarEl = document.createElement('div');
	toolbarEl.id = 'ai-floating-toolbar';
	toolbarEl.innerHTML = `
        <button data-action="apply" title="Apply"><i class="bi bi-check-lg"></i> Apply</button>
        <button data-action="retry" title="Retry"><i class="bi bi-arrow-repeat"></i> Retry</button>
        <button data-action="discard" title="Discard"><i class="bi bi-x-lg"></i> Discard</button>
        <div class="divider-vertical"></div>
        <span class="text-gray-400">${wordCount} Words, ${modelName}</span>
    `;
	
	const viewport = document.getElementById('viewport');
	if (!viewport) {
		console.error('Could not find viewport element for floating toolbar.');
		document.body.appendChild(toolbarEl);
	} else {
		viewport.appendChild(toolbarEl);
	}
	floatingToolbar = toolbarEl;
	
	const toolbarWidth = toolbarEl.offsetWidth;
	const toolbarHeight = toolbarEl.offsetHeight;
	const viewportRect = viewport.getBoundingClientRect();
	
	// Get coordinates for the start of the selection.
	const startCoords = view.coordsAtPos(from);
	
	// --- Horizontal Positioning ---
	const padding = { left: 100, right: 400, top: 100, bottom: 100 };
	let desiredLeft = startCoords.left - viewportRect.left;
	const minLeft = padding.left;
	const maxLeft = viewport.clientWidth - toolbarWidth - padding.right;
	const finalLeft = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
	
	// --- Vertical Positioning (try above first, then below) ---
	let desiredTop = startCoords.top - viewportRect.top - toolbarHeight - 5; // Attempt to place above selection
	
	// If placing it above pushes it past the top boundary, place it below instead.
	if (desiredTop < padding.top) {
		desiredTop = startCoords.bottom - viewportRect.top + 5;
	}
	
	const minTop = padding.top;
	const maxTop = viewport.clientHeight - toolbarHeight - padding.bottom;
	const finalTop = Math.max(minTop, Math.min(desiredTop, maxTop));
	
	toolbarEl.style.left = `${finalLeft}px`;
	toolbarEl.style.top = `${finalTop}px`;
	
	// Add event listeners for the toolbar buttons.
	toolbarEl.addEventListener('mousedown', (e) => e.preventDefault()); // Prevent editor from losing focus
	toolbarEl.addEventListener('click', (e) => {
		const button = e.target.closest('button');
		if (!button) return;
		const action = button.dataset.action;
		if (action === 'apply') handleApply();
		if (action === 'discard') handleDiscard();
		if (action === 'retry') handleRetry();
	});
}

/**
 * Initiates and manages the AI text processing stream and review workflow.
 * @param {HTMLButtonElement | null} button The button that triggered the action, or null for a retry.
 * @param {object | null} params The parameters for a retry action.
 */
async function handleAiAction(button, params = null) {
	if (!activeEditorView || isAiActionActive) return;
	
	let action, model, text, from, to;
	
	if (params) { // This is a retry action.
		action = params.action;
		model = params.model;
		text = params.text;
		from = aiActionRange.from;
		to = aiActionRange.from + originalFragment.size;
	} else { // This is a new action from the main toolbar.
		action = button.dataset.action;
		const dropdown = button.closest('.js-dropdown-container').querySelector('.js-dropdown');
		const modelSelect = dropdown.querySelector('.js-llm-model-select');
		model = modelSelect.value;
		
		const { state } = activeEditorView;
		from = state.selection.from;
		to = state.selection.to;
		text = state.doc.textBetween(from, to, ' ');
		
		if (!action || !model || !text || state.selection.empty) {
			alert('Could not perform AI action. Please select text and choose a model.');
			return;
		}
		
		// Store original state for potential discard/retry.
		originalFragment = state.doc.slice(from, to);
		aiActionRange = { from, to };
		currentAiParams = { text, action, model };
		
		button.disabled = true;
		button.textContent = 'Processing...';
	}
	
	isAiActionActive = true;
	updateToolbarState(activeEditorView);
	setEditorEditable(activeEditorView, false);
	
	let isFirstChunk = true;
	let currentInsertionPos = from;
	let justCreatedParagraph = false;
	
	const onData = (payload) => {
		if (payload.chunk) {
			const { schema } = activeEditorView.state;
			const mark = schema.marks.ai_suggestion.create();
			let tr = activeEditorView.state.tr;
			
			if (isFirstChunk) {
				// On the first chunk, replace the entire user selection with an empty space
				// where the new content will be streamed.
				tr.replaceWith(from, to, []);
				isFirstChunk = false;
				// We are now at the start of a paragraph, so we haven't just created one via a split.
				justCreatedParagraph = false;
			}
			
			// Split the incoming text chunk by newlines to handle paragraph breaks.
			const parts = payload.chunk.split('\n');
			
			parts.forEach((part, index) => {
				// If the part has content, insert it into the editor.
				if (part) {
					const textNode = schema.text(part, [mark]);
					tr.insert(currentInsertionPos, textNode);
					currentInsertionPos += part.length;
					// Since we've added text, the next newline should create a new paragraph.
					justCreatedParagraph = false;
				}
				
				// A newline was detected if this is not the last part of the split array.
				if (index < parts.length - 1) {
					// Only create a new paragraph if we haven't just done so.
					// This collapses multiple newlines into a single paragraph break.
					if (!justCreatedParagraph) {
						tr.split(currentInsertionPos);
						currentInsertionPos += 2; // Account for the new paragraph's start/end tags.
						// Set the flag to true to ignore subsequent, consecutive newlines.
						justCreatedParagraph = true;
					}
				}
			});
			
			aiActionRange.to = currentInsertionPos; // Update the end of the suggestion range.
			activeEditorView.dispatch(tr);
			
		} else if (payload.done) {
			// Stream finished successfully.
			if (button) {
				button.disabled = false;
				button.textContent = 'Apply';
			}
			createFloatingToolbar(activeEditorView, aiActionRange.from, aiActionRange.to, model);
			
		} else if (payload.error) {
			// An error occurred during the stream.
			console.error('AI Action Error:', payload.error);
			alert(`Error: ${payload.error}`);
			if (button) {
				button.disabled = false;
				button.textContent = 'Apply';
			}
			handleDiscard(); // Revert changes on error.
		}
	};
	
	try {
		window.api.processCodexTextStream({ text, action, model }, onData);
	} catch (error) {
		console.error('AI Action Error:', error);
		alert(`Error: ${error.message}`);
		if (button) {
			button.disabled = false;
			button.textContent = 'Apply';
		}
		handleDiscard();
	}
}

async function handleToolbarAction(button) {
	if (!activeEditorView && !button.closest('.js-dropdown-container')) {
		return;
	}
	
	const command = button.dataset.command;
	
	if (command) {
		if (command === 'undo') {
			undo(activeEditorView.state, activeEditorView.dispatch);
		} else if (command === 'redo') {
			redo(activeEditorView.state, activeEditorView.dispatch);
			// NEW: Handle the "Create Codex" button click.
		} else if (command === 'create_codex') {
			await handleCreateCodexFromSelection();
		} else {
			applyCommand(command);
		}
	} else if (button.classList.contains('js-highlight-option')) {
		applyHighlight(button.dataset.bg.replace('highlight-', ''));
		closeAllDropdowns();
	} else if (button.classList.contains('js-ai-apply-btn')) {
		await handleAiAction(button);
		closeAllDropdowns();
	} else if (button.classList.contains('js-heading-option')) {
		const level = parseInt(button.dataset.level, 10);
		applyCommand('heading', { level });
		closeAllDropdowns();
	}
	
	if (activeEditorView && !isAiActionActive) {
		activeEditorView.focus();
	}
}

function closeAllDropdowns() {
	toolbar.querySelectorAll('.js-dropdown').forEach(d => {
		if (document.activeElement) document.activeElement.blur();
	});
}

/**
 * NEW: Fetches AI models and populates the dropdowns in the toolbar.
 */
async function populateModelDropdowns() {
	const selects = toolbar.querySelectorAll('.js-llm-model-select');
	if (selects.length === 0) return;
	
	try {
		const result = await window.api.getModels();
		if (!result.success || !result.models || result.models.length === 0) {
			throw new Error(result.message || 'No models returned from API.');
		}
		
		const models = result.models;
		const defaultModel = 'openai/gpt-4o-mini';
		
		selects.forEach(select => {
			select.innerHTML = ''; // Clear "Loading..."
			
			models.forEach(model => {
				const option = document.createElement('option');
				option.value = model.id;
				option.textContent = model.name;
				select.appendChild(option);
			});
			
			// Set the default value if it exists in the list
			if (models.some(m => m.id === defaultModel)) {
				select.value = defaultModel;
			} else if (models.length > 0) {
				// Otherwise, select the first model in the list
				select.value = models[0].id;
			}
		});
		
	} catch (error) {
		console.error('Failed to populate AI model dropdowns:', error);
		selects.forEach(select => {
			select.innerHTML = '<option value="" disabled selected>Error loading</option>';
		});
	}
}

export function setupTopToolbar() {
	if (!toolbar) return;
	
	toolbar.addEventListener('mousedown', event => {
		const target = event.target;
		const dropdownTrigger = target.closest('button[tabindex="0"]');
		const inDropdownContent = target.closest('.dropdown-content');
		
		// If the click is on a dropdown trigger or inside a dropdown's content,
		// allow the default browser action. This is necessary for the dropdowns
		// (and selects/buttons inside them) to work correctly.
		if ((dropdownTrigger && dropdownTrigger.closest('.dropdown')) || inDropdownContent) {
			return;
		}
		
		// For all other toolbar interactions, prevent the default action to avoid
		// the editor losing focus.
		event.preventDefault();
	});
	
	toolbar.addEventListener('click', event => {
		const button = event.target.closest('button');
		if (!button || button.disabled) return;
		
		if (button.closest('.js-dropdown-container')) {
			// This check is correct: it prevents the dropdown trigger itself from being
			// processed as a command, letting DaisyUI handle the open/close.
			if (button.classList.contains('js-toolbar-btn')) return;
		}
		
		handleToolbarAction(button);
	});
	
	updateToolbarState(null);
	populateModelDropdowns();
}

/**
 * Manages the top toolbar for text editing within ProseMirror editors.
 */

import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';

let activeEditorView = null;
const toolbar = document.getElementById('top-toolbar');
const wordCountEl = document.getElementById('js-word-count');

function isNodeActive(state, type) {
	const { $from } = state.selection;
	for (let i = $from.depth; i > 0; i--) {
		if ($from.node(i).type === type) {
			return true;
		}
	}
	return false;
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
				btn.disabled = !isTextSelected;
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

// MODIFIED: This function is completely rewritten to handle streaming AI responses.
async function handleAiAction(button) {
	if (!activeEditorView) return;
	
	const action = button.dataset.action;
	const dropdown = button.closest('.js-dropdown-container').querySelector('.js-dropdown');
	const modelSelect = dropdown.querySelector('.js-llm-model-select');
	const model = modelSelect.value;
	
	const { state } = activeEditorView;
	const { from, to } = state.selection;
	const text = state.doc.textBetween(from, to, ' ');
	
	if (!action || !model || !text || state.selection.empty) {
		alert('Could not perform AI action. Please select text and choose a model.');
		return;
	}
	
	button.disabled = true;
	button.textContent = 'Processing...';
	
	let isFirstChunk = true;
	let currentInsertionPos = from;
	
	const onData = (payload) => {
		if (payload.chunk) {
			const { schema } = activeEditorView.state;
			let tr;
			if (isFirstChunk) {
				// On the first chunk, replace the entire user selection.
				tr = activeEditorView.state.tr.replaceWith(from, to, schema.text(payload.chunk));
				isFirstChunk = false;
			} else {
				// For subsequent chunks, insert text at the end of the last insertion.
				tr = activeEditorView.state.tr.insertText(payload.chunk, currentInsertionPos);
			}
			
			// Update the position for the next chunk.
			currentInsertionPos += payload.chunk.length;
			
			// Move the user's cursor to the end of the newly inserted text.
			const newSelection = activeEditorView.state.selection.constructor.create(tr.doc, currentInsertionPos);
			tr.setSelection(newSelection);
			
			activeEditorView.dispatch(tr);
			
		} else if (payload.done) {
			// Stream finished successfully.
			button.disabled = false;
			button.textContent = 'Apply';
			activeEditorView.focus();
			
		} else if (payload.error) {
			// An error occurred during the stream.
			console.error('AI Action Error:', payload.error);
			alert(`Error: ${payload.error}`);
			button.disabled = false;
			button.textContent = 'Apply';
			
			// Revert the changes by replacing the partially generated text with the original selection.
			const { schema } = activeEditorView.state;
			const tr = activeEditorView.state.tr.replaceWith(from, currentInsertionPos, schema.text(text));
			activeEditorView.dispatch(tr);
		}
	};
	
	try {
		// Call the new streaming API.
		window.api.processCodexTextStream({ text, action, model }, onData);
	} catch (error) {
		console.error('AI Action Error:', error);
		alert(`Error: ${error.message}`);
		button.disabled = false;
		button.textContent = 'Apply';
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
	
	if (activeEditorView) {
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
	
	// MODIFIED: The mousedown handler is updated to allow dropdowns and their contents to function.
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
	populateModelDropdowns(); // NEW: Call the function to populate models.
}

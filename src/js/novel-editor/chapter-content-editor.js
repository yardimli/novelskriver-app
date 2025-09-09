// NEW: Content editor manager specifically for the two-pane chapter editor window.
// It is adapted from the novel-editor's version to handle a fixed set of two editors.

import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser, DOMSerializer } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
// MODIFIED: Import the centralized active editor state setter.
import { schema, setActiveEditor } from './content-editor.js'; // Reuse the schema definition
import { updateToolbarState } from './toolbar.js';

const debounceTimers = new Map();
const editorInstances = {};
// REMOVED: The local activeEditorView state is no longer needed.

// REMOVED: getActiveEditor is no longer needed here; the toolbar will use the centralized version.

/**
 * Triggers a debounced save operation for the current chapter.
 * @param {string} chapterId - The ID of the chapter being edited.
 */
function triggerDebouncedSave(chapterId) {
	const key = `chapter-${chapterId}`;
	
	if (debounceTimers.has(key)) {
		clearTimeout(debounceTimers.get(key));
	}
	
	const timer = setTimeout(() => {
		saveWindowContent(chapterId);
		debounceTimers.delete(key);
	}, 2000); // 2-second debounce interval
	
	debounceTimers.set(key, timer);
}

/**
 * Collects content from the title input and both editors and saves it to the database.
 * @param {string} chapterId - The ID of the chapter to save.
 */
async function saveWindowContent(chapterId) {
	const serializeDocToHtml = (view) => {
		if (!view) return '';
		const serializer = DOMSerializer.fromSchema(view.state.schema);
		const fragment = serializer.serializeFragment(view.state.doc.content);
		const tempDiv = document.createElement('div');
		tempDiv.appendChild(fragment);
		return tempDiv.innerHTML;
	};
	
	const titleInput = document.getElementById('js-chapter-title-input');
	const content = serializeDocToHtml(editorInstances.contentView);
	const summary = serializeDocToHtml(editorInstances.summaryView);
	const data = {
		title: titleInput.value,
		content,
		summary,
	};
	
	try {
		const response = await window.api.updateChapterFull(chapterId, data);
		if (!response.success) throw new Error(response.message || 'Failed to save chapter.');
	} catch (error) {
		console.error('Error saving chapter:', error);
		alert('Error: Could not save changes to chapter.');
	}
}

/**
 * Initializes the ProseMirror editors for the content and summary panes.
 * @param {string} chapterId - The ID of the current chapter.
 */
export function setupContentEditor(chapterId) {
	const initialContentContainer = document.getElementById('js-pm-content-source');
	if (!initialContentContainer) return;
	
	const createEditor = (mount) => {
		const name = mount.dataset.name;
		const placeholder = mount.dataset.placeholder || '';
		const initialContentEl = initialContentContainer.querySelector(`[data-name="${name}"]`);
		
		const doc = DOMParser.fromSchema(schema).parse(initialContentEl);
		
		return new EditorView(mount, {
			state: EditorState.create({
				doc,
				plugins: [
					history(),
					keymap({'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo}),
					keymap(baseKeymap),
					new Plugin({
						props: {
							handleDOMEvents: {
								focus(view) {
									// MODIFIED: Set the global active editor instead of a local one.
									setActiveEditor(view);
									updateToolbarState(view);
								},
								// MODIFIED: Updated blur logic to correctly unset the active editor
								// when focus moves away from the editor and toolbar.
								blur(view, event) {
									const relatedTarget = event.relatedTarget;
									if (!relatedTarget || !relatedTarget.closest('#top-toolbar')) {
										setActiveEditor(null);
										updateToolbarState(null);
									}
								},
							},
							attributes: (state) => ({
								class: `ProseMirror ${state.doc.childCount === 1 && state.doc.firstChild.content.size === 0 ? 'is-editor-empty' : ''}`,
								'data-placeholder': placeholder,
							}),
						},
					}),
				],
			}),
			dispatchTransaction(transaction) {
				const newState = this.state.apply(transaction);
				this.updateState(newState);
				if (transaction.docChanged) {
					triggerDebouncedSave(chapterId);
				}
				if ((transaction.selectionSet || transaction.docChanged)) {
					if (this.hasFocus()) {
						updateToolbarState(this);
					}
				}
			},
		});
	};
	
	const contentMount = document.querySelector('.js-editable[data-name="content"]');
	const summaryMount = document.querySelector('.js-editable[data-name="summary"]');
	const titleInput = document.getElementById('js-chapter-title-input');
	
	if (contentMount) {
		editorInstances.contentView = createEditor(contentMount);
	}
	if (summaryMount) {
		editorInstances.summaryView = createEditor(summaryMount);
	}
	
	titleInput.addEventListener('input', () => triggerDebouncedSave(chapterId));
	
	// Set initial focus
	if (editorInstances.contentView) {
		editorInstances.contentView.focus();
	}
}

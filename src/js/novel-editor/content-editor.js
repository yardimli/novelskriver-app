/**
 * MODIFIED: Manages ProseMirror editor instances for codex and chapter windows.
 */

import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { updateToolbarState } from './toolbar.js';

const debounceTimers = new Map();
const editorInstances = new Map();
let activeEditorView = null;

const highlightMarkSpec = (colorClass) => ({
	attrs: {},
	parseDOM: [{ tag: `span.${colorClass}` }],
	toDOM: () => ['span', { class: colorClass }, 0],
});

const nodes = basicSchema.spec.nodes.update('blockquote', {
	content: 'paragraph+',
	group: 'block',
	defining: true,
	parseDOM: [{ tag: 'blockquote' }],
	toDOM() { return ['blockquote', 0]; },
});

export const schema = new Schema({
	nodes: addListNodes(nodes, 'paragraph+', 'block'),
	marks: {
		link: {
			attrs: { href: {}, title: { default: null } },
			inclusive: false,
			parseDOM: [{ tag: 'a[href]', getAttrs: dom => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title') }) }],
			toDOM: node => ['a', node.attrs, 0],
		},
		em: {
			parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
			toDOM: () => ['em', 0],
		},
		strong: {
			parseDOM: [
				{ tag: 'strong' },
				{ tag: 'b', getAttrs: node => node.style.fontWeight !== 'normal' && null },
				{ style: 'font-weight', getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
			],
			toDOM: () => ['strong', 0],
		},
		code: {
			parseDOM: [{ tag: 'code' }],
			toDOM: () => ['code', 0],
		},
		underline: {
			parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
			toDOM: () => ['u', 0],
		},
		strike: {
			parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
			toDOM: () => ['s', 0],
		},
		highlight_yellow: highlightMarkSpec('highlight-yellow'),
		highlight_green: highlightMarkSpec('highlight-green'),
		highlight_blue: highlightMarkSpec('highlight-blue'),
		highlight_red: highlightMarkSpec('highlight-red'),
		ai_suggestion: {
			parseDOM: [{ tag: 'span.ai-suggestion' }],
			toDOM: () => ['span', { class: 'ai-suggestion' }, 0],
		},
	},
});

const descriptionSchema = new Schema({
	nodes: {
		doc: { content: 'paragraph' },
		paragraph: { content: 'text*', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
		text: {},
	},
	marks: {},
});

export function getActiveEditor() {
	return activeEditorView;
}

// MODIFIED: This function now triggers a debounced save for any editable window.
function triggerSave(windowContent) {
	const entryId = windowContent.dataset.entryId;
	const chapterId = windowContent.dataset.chapterId;
	// NEW: Create a unique key for the debounce timer based on window type and ID.
	const key = entryId ? `codex-${entryId}` : `chapter-${chapterId}`;
	
	if (!key) return;
	
	if (debounceTimers.has(key)) {
		clearTimeout(debounceTimers.get(key));
	}
	
	const timer = setTimeout(() => {
		saveContent(windowContent);
		debounceTimers.delete(key);
	}, 2000);
	
	debounceTimers.set(key, timer);
}

// NEW: Generalized save function that handles both codex entries and chapters.
async function saveContent(windowContent) {
	const entryId = windowContent.dataset.entryId;
	const chapterId = windowContent.dataset.chapterId;
	
	if (entryId) {
		// --- Save Codex Entry ---
		const instances = editorInstances.get(`codex-${entryId}`);
		if (!instances) return;
		
		const titleInput = windowContent.querySelector('.js-codex-title-input');
		const description = instances.descriptionView.state.doc.textContent;
		
		const serializer = DOMSerializer.fromSchema(schema);
		const fragment = serializer.serializeFragment(instances.contentView.state.doc.content);
		const tempDiv = document.createElement('div');
		tempDiv.appendChild(fragment);
		const content = tempDiv.innerHTML;
		
		const data = {
			title: titleInput.value,
			description: description,
			content: content,
		};
		
		try {
			const response = await window.api.updateCodexEntry(entryId, data);
			if (!response.success) {
				throw new Error(response.message || 'Failed to save codex entry.');
			}
		} catch (error) {
			console.error('Error saving codex entry:', error);
			alert('Error: Could not save changes to codex entry.');
		}
		
	} else if (chapterId) {
		// --- Save Chapter Content ---
		const instances = editorInstances.get(`chapter-${chapterId}`);
		if (!instances || !instances.contentView) return;
		
		const serializer = DOMSerializer.fromSchema(schema);
		const fragment = serializer.serializeFragment(instances.contentView.state.doc.content);
		const tempDiv = document.createElement('div');
		tempDiv.appendChild(fragment);
		const content = tempDiv.innerHTML;
		
		const data = { content: content };
		
		try {
			const response = await window.api.updateChapterContent(chapterId, data);
			if (!response.success) {
				throw new Error(response.message || 'Failed to save chapter content.');
			}
		} catch (error) {
			console.error('Error saving chapter content:', error);
			alert('Error: Could not save changes to chapter.');
		}
	}
}

// MODIFIED: Generalized to initialize editors for any window with editable content.
function initEditorsForWindow(windowContent) {
	const entryId = windowContent.dataset.entryId;
	const chapterId = windowContent.dataset.chapterId;
	const key = entryId ? `codex-${entryId}` : `chapter-${chapterId}`;
	
	if (!key || editorInstances.has(key)) return;
	
	const initialContentContainer = windowContent.querySelector('.js-pm-content');
	if (!initialContentContainer) return;
	
	const createEditor = (mount, isDescription) => {
		const name = mount.dataset.name;
		const placeholder = mount.dataset.placeholder || '';
		const initialContentEl = initialContentContainer.querySelector(`[data-name="${name}"]`);
		const currentSchema = isDescription ? descriptionSchema : schema;
		
		const doc = DOMParser.fromSchema(currentSchema).parse(initialContentEl);
		
		const customKeymap = {
			...baseKeymap,
			'Mod-b': toggleMark(schema.marks.strong),
			'Mod-B': toggleMark(schema.marks.strong),
			'Mod-i': toggleMark(schema.marks.em),
			'Mod-I': toggleMark(schema.marks.em),
		};
		
		const view = new EditorView(mount, {
			state: EditorState.create({
				doc,
				plugins: [
					history(),
					keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
					keymap(customKeymap),
					isDescription ? keymap({ 'Enter': () => true }) : keymap({}),
					new Plugin({
						props: {
							handleDOMEvents: {
								focus(view) {
									activeEditorView = view;
									updateToolbarState(view);
								},
								blur(view, event) {
									const relatedTarget = event.relatedTarget;
									if (!relatedTarget || !relatedTarget.closest('#top-toolbar')) {
										activeEditorView = null;
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
				const newState = view.state.apply(transaction);
				view.updateState(newState);
				if (transaction.docChanged) {
					// MODIFIED: Call the generalized save trigger.
					triggerSave(windowContent);
				}
				if ((transaction.selectionSet || transaction.docChanged)) {
					updateToolbarState(view);
				}
			},
		});
		return view;
	};
	
	if (entryId) {
		// --- Initialize Codex Editors ---
		const titleInput = windowContent.querySelector('.js-codex-title-input');
		titleInput.addEventListener('input', () => triggerSave(windowContent));
		
		const descriptionMount = windowContent.querySelector('[data-name="description"]');
		const contentMount = windowContent.querySelector('[data-name="content"]');
		
		if (descriptionMount && contentMount) {
			const descriptionView = createEditor(descriptionMount, true);
			const contentView = createEditor(contentMount, false);
			editorInstances.set(key, { descriptionView, contentView });
		}
	} else if (chapterId) {
		// --- Initialize Chapter Editor ---
		const contentMount = windowContent.querySelector('[data-name="content"]');
		if (contentMount) {
			const contentView = createEditor(contentMount, false);
			editorInstances.set(key, { contentView });
		}
	}
}

// MODIFIED: Renamed function and updated observer to look for both window types.
export function setupContentEditor(desktop) {
	const observer = new MutationObserver((mutationsList) => {
		for (const mutation of mutationsList) {
			if (mutation.type === 'childList') {
				mutation.addedNodes.forEach(node => {
					if (node.nodeType !== Node.ELEMENT_NODE) return;
					// MODIFIED: Selector now includes chapter windows.
					const windowContent = node.querySelector('.codex-entry-window-content, .chapter-window-content') || (node.matches('.codex-entry-window-content, .chapter-window-content') ? node : null);
					if (windowContent) {
						initEditorsForWindow(windowContent);
					}
				});
				mutation.removedNodes.forEach(node => {
					if (node.nodeType !== Node.ELEMENT_NODE) return;
					// MODIFIED: Selector now includes chapter windows.
					const windowContent = node.querySelector('.codex-entry-window-content, .chapter-window-content') || (node.matches('.codex-entry-window-content, .chapter-window-content') ? node : null);
					if (windowContent) {
						const entryId = windowContent.dataset.entryId;
						const chapterId = windowContent.dataset.chapterId;
						const key = entryId ? `codex-${entryId}` : `chapter-${chapterId}`;
						
						if (editorInstances.has(key)) {
							const instances = editorInstances.get(key);
							// MODIFIED: Safely destroy editors that may or may not exist.
							if (instances.descriptionView) instances.descriptionView.destroy();
							if (instances.contentView) instances.contentView.destroy();
							editorInstances.delete(key);
							debounceTimers.delete(key);
						}
					}
				});
			}
		}
	});
	
	observer.observe(desktop, { childList: true, subtree: true });
	
	// MODIFIED: Initial scan includes chapter windows.
	desktop.querySelectorAll('.codex-entry-window-content, .chapter-window-content').forEach(initEditorsForWindow);
}

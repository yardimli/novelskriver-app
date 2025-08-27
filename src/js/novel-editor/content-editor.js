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

function triggerDebouncedSave(windowContent) {
	const isChapter = windowContent.matches('.chapter-window-content');
	const isCodex = windowContent.matches('.codex-entry-window-content');
	
	let id, key;
	
	if (isChapter) {
		id = windowContent.dataset.chapterId;
		key = `chapter-${id}`;
	} else if (isCodex) {
		id = windowContent.dataset.entryId;
		key = `codex-${id}`;
	} else {
		return;
	}
	
	if (!id) return;
	
	if (debounceTimers.has(key)) {
		clearTimeout(debounceTimers.get(key));
	}
	
	const timer = setTimeout(() => {
		saveWindowContent(windowContent);
		debounceTimers.delete(key);
	}, 2000);
	
	debounceTimers.set(key, timer);
}

async function saveWindowContent(windowContent) {
	const isChapter = windowContent.matches('.chapter-window-content');
	const isCodex = windowContent.matches('.codex-entry-window-content');
	
	const serializeDocToHtml = (view) => {
		const serializer = DOMSerializer.fromSchema(view.state.schema);
		const fragment = serializer.serializeFragment(view.state.doc.content);
		const tempDiv = document.createElement('div');
		tempDiv.appendChild(fragment);
		return tempDiv.innerHTML;
	};
	
	if (isCodex) {
		const entryId = windowContent.dataset.entryId;
		const instances = editorInstances.get(`codex-${entryId}`);
		if (!instances) return;
		
		const titleInput = windowContent.querySelector('.js-codex-title-input');
		// MODIFIED: Removed description serialization.
		const content = serializeDocToHtml(instances.contentView);
		
		// MODIFIED: Removed description from the saved data object.
		const data = { title: titleInput.value, content };
		
		try {
			const response = await window.api.updateCodexEntry(entryId, data);
			if (!response.success) throw new Error(response.message || 'Failed to save codex entry.');
		} catch (error) {
			console.error('Error saving codex entry:', error);
			alert('Error: Could not save changes to codex entry.');
		}
	} else if (isChapter) {
		const chapterId = windowContent.dataset.chapterId;
		const instances = editorInstances.get(`chapter-${chapterId}`);
		if (!instances) return;
		
		const titleInput = windowContent.querySelector('.js-chapter-title-input');
		const summary = serializeDocToHtml(instances.summaryView);
		const content = serializeDocToHtml(instances.contentView);
		
		const data = { title: titleInput.value, summary, content };
		
		try {
			const response = await window.api.updateChapterContent(chapterId, data);
			if (!response.success) throw new Error(response.message || 'Failed to save chapter.');
		} catch (error) {
			console.error('Error saving chapter:', error);
			alert('Error: Could not save changes to chapter.');
		}
	}
}

function initEditorsForWindow(windowContent) {
	const isChapter = windowContent.matches('.chapter-window-content');
	const isCodex = windowContent.matches('.codex-entry-window-content');
	
	let id, key;
	
	if (isChapter) {
		id = windowContent.dataset.chapterId;
		key = `chapter-${id}`;
	} else if (isCodex) {
		id = windowContent.dataset.entryId;
		key = `codex-${id}`;
	} else {
		return;
	}
	
	if (!id || editorInstances.has(key)) return;
	
	const initialContentContainer = windowContent.querySelector('.js-pm-content');
	if (!initialContentContainer) return;
	
	const createEditor = (mount, isSimpleSchema) => {
		const name = mount.dataset.name;
		const placeholder = mount.dataset.placeholder || '';
		const initialContentEl = initialContentContainer.querySelector(`[data-name="${name}"]`);
		const currentSchema = isSimpleSchema ? descriptionSchema : schema;
		
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
					isSimpleSchema ? keymap({ 'Enter': () => true }) : keymap({}),
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
					triggerDebouncedSave(windowContent);
				}
				if ((transaction.selectionSet || transaction.docChanged)) {
					updateToolbarState(view);
				}
			},
		});
		return view;
	};
	
	if (isCodex) {
		const titleInput = windowContent.querySelector('.js-codex-title-input');
		titleInput.addEventListener('input', () => triggerDebouncedSave(windowContent));
		
		// MODIFIED: Removed description editor initialization.
		const contentMount = windowContent.querySelector('.js-codex-editable[data-name="content"]');
		
		if (!contentMount) return;
		
		const contentView = createEditor(contentMount, false);
		
		// MODIFIED: Storing only the content view for codex entries.
		editorInstances.set(key, { contentView });
	} else if (isChapter) {
		const titleInput = windowContent.querySelector('.js-chapter-title-input');
		titleInput.addEventListener('input', () => triggerDebouncedSave(windowContent));
		
		const summaryMount = windowContent.querySelector('.js-editable[data-name="summary"]');
		const contentMount = windowContent.querySelector('.js-editable[data-name="content"]');
		
		if (!summaryMount || !contentMount) return;
		
		const summaryView = createEditor(summaryMount, false);
		const contentView = createEditor(contentMount, false);
		
		editorInstances.set(key, { summaryView, contentView });
	}
}

export function setupContentEditor(desktop) {
	const observer = new MutationObserver((mutationsList) => {
		for (const mutation of mutationsList) {
			if (mutation.type === 'childList') {
				mutation.addedNodes.forEach(node => {
					if (node.nodeType !== Node.ELEMENT_NODE) return;
					const windowContent = node.querySelector('.codex-entry-window-content, .chapter-window-content') || (node.matches('.codex-entry-window-content, .chapter-window-content') ? node : null);
					if (windowContent) {
						initEditorsForWindow(windowContent);
					}
				});
				mutation.removedNodes.forEach(node => {
					if (node.nodeType !== Node.ELEMENT_NODE) return;
					const windowContent = node.querySelector('.codex-entry-window-content, .chapter-window-content') || (node.matches('.codex-entry-window-content, .chapter-window-content') ? node : null);
					if (windowContent) {
						let key;
						if (windowContent.matches('.codex-entry-window-content')) {
							key = `codex-${windowContent.dataset.entryId}`;
						} else if (windowContent.matches('.chapter-window-content')) {
							key = `chapter-${windowContent.dataset.chapterId}`;
						}
						
						if (key && editorInstances.has(key)) {
							const views = editorInstances.get(key);
							Object.values(views).forEach(view => view.destroy());
							editorInstances.delete(key);
							debounceTimers.delete(key);
						}
					}
				});
			}
		}
	});
	
	observer.observe(desktop, { childList: true, subtree: true });
	
	desktop.querySelectorAll('.codex-entry-window-content, .chapter-window-content').forEach(initEditorsForWindow);
}

// MODIFIED: This file is completely rewritten to be the entry point for the new full-manuscript editor.
import { setupTopToolbar } from './toolbar.js';
import { setupPromptEditor } from '../prompt-editor.js';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { DOMParser, DOMSerializer } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { schema, setActiveEditor } from './content-editor.js';
import { updateToolbarState } from './toolbar.js';

const debounceTimers = new Map();
let activeChapterId = null;
let isScrollingProgrammatically = false;
let summaryEditorView = null;
const chapterEditorViews = new Map();

/**
 * Triggers a debounced save for a specific field of a chapter.
 * @param {string} chapterId - The ID of the chapter being edited.
 * @param {string} field - The field to save ('title', 'content', 'summary').
 * @param {string} value - The new value of the field.
 */
function triggerDebouncedSave(chapterId, field, value) {
	const key = `chapter-${chapterId}-${field}`;
	if (debounceTimers.has(key)) {
		clearTimeout(debounceTimers.get(key));
	}
	const timer = setTimeout(async () => {
		try {
			await window.api.updateChapterField({ chapterId, field, value });
		} catch (error) {
			console.error(`Error saving ${field} for chapter ${chapterId}:`, error);
			alert(`Error: Could not save ${field} changes.`);
		}
		debounceTimers.delete(key);
	}, 2000);
	debounceTimers.set(key, timer);
}

/**
 * Renders the entire manuscript into the container.
 * @param {HTMLElement} container - The manuscript container element.
 * @param {object} novelData - The full novel data.
 */
function renderManuscript(container, novelData) {
	const fragment = document.createDocumentFragment();
	let totalWordCount = 0;
	
	novelData.sections.forEach(section => {
		const sectionHeader = document.createElement('div');
		sectionHeader.className = 'px-8 py-6 sticky top-0 bg-base-100/90 backdrop-blur-sm z-10 border-b border-base-300';
		sectionHeader.innerHTML = `<h2 class="text-3xl font-bold text-indigo-500">${section.section_order}. ${section.title}</h2>`;
		fragment.appendChild(sectionHeader);
		
		section.chapters.forEach(chapter => {
			// MODIFIED: Use the pre-calculated word_count from the backend.
			totalWordCount += chapter.word_count || 0;
			
			const chapterWrapper = document.createElement('div');
			chapterWrapper.id = `chapter-scroll-target-${chapter.id}`;
			chapterWrapper.className = 'manuscript-chapter-item prose prose-sm dark:prose-invert max-w-none px-8 py-6';
			chapterWrapper.dataset.chapterId = chapter.id;
			
			// MODIFIED: Use chapter.chapter_order and add the word count.
			const chapterHeader = `<p class="text-base-content/50 font-semibold">Chapter ${chapter.chapter_order} &ndash; ${chapter.word_count.toLocaleString()} words</p>`;
			const titleInput = document.createElement('input');
			titleInput.type = 'text';
			titleInput.value = chapter.title;
			titleInput.className = 'js-chapter-title-input text-2xl font-bold w-full bg-transparent border-0 p-0 focus:ring-0 focus:border-b-2 focus:border-indigo-500 flex-shrink-0 not-prose';
			titleInput.placeholder = 'Chapter Title';
			
			const editorMount = document.createElement('div');
			editorMount.className = 'js-editable mt-4';
			editorMount.dataset.name = 'content';
			
			const hr = document.createElement('hr');
			
			chapterWrapper.innerHTML = chapterHeader;
			chapterWrapper.appendChild(titleInput);
			chapterWrapper.appendChild(editorMount);
			chapterWrapper.appendChild(hr);
			fragment.appendChild(chapterWrapper);
			
			titleInput.addEventListener('input', () => {
				triggerDebouncedSave(chapter.id, 'title', titleInput.value);
			});
			
			const doc = DOMParser.fromSchema(schema).parse(document.createRange().createContextualFragment(chapter.content || ''));
			const view = new EditorView(editorMount, {
				state: EditorState.create({
					doc,
					plugins: [
						history(),
						keymap({ 'Mod-z': undo, 'Mod-y': redo }),
						keymap(baseKeymap),
						new Plugin({
							props: {
								handleDOMEvents: {
									focus(view) {
										setActiveEditor(view);
										updateToolbarState(view);
									},
									blur(view, event) {
										const relatedTarget = event.relatedTarget;
										if (!relatedTarget || !relatedTarget.closest('#top-toolbar')) {
											setActiveEditor(null);
											updateToolbarState(null);
										}
									},
								},
							},
						}),
					],
				}),
				dispatchTransaction(transaction) {
					const newState = this.state.apply(transaction);
					this.updateState(newState);
					if (transaction.docChanged) {
						const serializer = DOMSerializer.fromSchema(this.state.schema);
						const fragmentContent = serializer.serializeFragment(this.state.doc.content);
						const tempDiv = document.createElement('div');
						tempDiv.appendChild(fragmentContent);
						triggerDebouncedSave(chapter.id, 'content', tempDiv.innerHTML);
						
						// NEW: Update the word count in the UI when the document changes.
						const wordCount = this.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length;
						const headerP = chapterWrapper.querySelector('p.font-semibold');
						if (headerP) {
							headerP.innerHTML = `Chapter ${chapter.chapter_order} &ndash; ${wordCount.toLocaleString()} words`;
						}
						// This could also update a total word count if needed.
					}
					if (transaction.selectionSet || transaction.docChanged) {
						if (this.hasFocus()) {
							updateToolbarState(this);
						}
					}
				},
			});
			chapterEditorViews.set(chapter.id.toString(), view);
		});
	});
	
	container.appendChild(fragment);
	document.getElementById('js-total-word-count').textContent = `Total: ${totalWordCount.toLocaleString()} words`;
}

/**
 * Updates the side panel with the active chapter's summary and codex links.
 * @param {string} chapterId - The ID of the currently active chapter.
 */
async function updateSidePanel(chapterId) {
	if (summaryEditorView) {
		summaryEditorView.destroy();
		summaryEditorView = null;
	}
	
	const wrapper = document.getElementById('js-summary-editor-wrapper');
	const sourceDiv = document.getElementById('js-summary-source').querySelector('[data-name="summary"]');
	const codexLinksContainer = document.getElementById('js-codex-links-container');
	const codexTagsWrapper = document.getElementById('js-codex-tags-wrapper');
	
	try {
		const data = await window.api.getChapterSidePanelData(chapterId);
		
		// Update Codex Links
		codexTagsWrapper.innerHTML = data.codexTagsHtml;
		codexLinksContainer.classList.toggle('hidden', !data.codexTagsHtml);
		
		// Update Summary Editor
		sourceDiv.innerHTML = data.summary || '';
		const doc = DOMParser.fromSchema(schema).parse(sourceDiv);
		wrapper.innerHTML = ''; // Clear previous editor mount
		const editorMount = document.createElement('div');
		editorMount.className = 'js-editable';
		editorMount.dataset.placeholder = 'Enter a short summary...';
		wrapper.appendChild(editorMount);
		
		summaryEditorView = new EditorView(editorMount, {
			state: EditorState.create({
				doc,
				plugins: [
					history(),
					keymap({ 'Mod-z': undo, 'Mod-y': redo }),
					keymap(baseKeymap),
					new Plugin({
						props: {
							handleDOMEvents: {
								focus(view) { setActiveEditor(view); updateToolbarState(view); },
								blur(view, event) {
									const relatedTarget = event.relatedTarget;
									if (!relatedTarget || !relatedTarget.closest('#top-toolbar')) {
										setActiveEditor(null); updateToolbarState(null);
									}
								},
							},
							attributes: (state) => ({
								class: `ProseMirror ${state.doc.childCount === 1 && state.doc.firstChild.content.size === 0 ? 'is-editor-empty' : ''}`,
								'data-placeholder': 'Enter a short summary...',
							}),
						},
					}),
				],
			}),
			dispatchTransaction(transaction) {
				const newState = this.state.apply(transaction);
				this.updateState(newState);
				if (transaction.docChanged) {
					const serializer = DOMSerializer.fromSchema(this.state.schema);
					const fragmentContent = serializer.serializeFragment(this.state.doc.content);
					const tempDiv = document.createElement('div');
					tempDiv.appendChild(fragmentContent);
					triggerDebouncedSave(chapterId, 'summary', tempDiv.innerHTML);
				}
				if (this.hasFocus()) updateToolbarState(this);
			},
		});
		
	} catch (error) {
		console.error('Failed to update side panel:', error);
		wrapper.innerHTML = '<p class="text-error">Could not load summary.</p>';
	}
}

/**
 * Sets up the intersection observer to track the active chapter during scrolling.
 */
function setupIntersectionObserver() {
	const container = document.getElementById('js-manuscript-container');
	const navDropdown = document.getElementById('js-chapter-nav-dropdown');
	
	const observer = new IntersectionObserver((entries) => {
		if (isScrollingProgrammatically) return;
		
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				const chapterId = entry.target.dataset.chapterId;
				if (chapterId && chapterId !== activeChapterId) {
					activeChapterId = chapterId;
					navDropdown.value = chapterId;
					updateSidePanel(chapterId);
				}
			}
		});
	}, {
		root: container,
		rootMargin: '-40% 0px -60% 0px', // Trigger when element is in the middle 20% of the viewport
		threshold: 0,
	});
	
	container.querySelectorAll('.manuscript-chapter-item').forEach(el => observer.observe(el));
}

/**
 * Populates and configures the navigation dropdown.
 * @param {object} novelData - The full novel data.
 */
function populateNavDropdown(novelData) {
	const navDropdown = document.getElementById('js-chapter-nav-dropdown');
	navDropdown.innerHTML = '';
	
	novelData.sections.forEach(section => {
		const optgroup = document.createElement('optgroup');
		optgroup.label = `${section.section_order}. ${section.title}`;
		section.chapters.forEach(chapter => {
			const option = new Option(`${chapter.chapter_order}. ${chapter.title}`, chapter.id);
			optgroup.appendChild(option);
		});
		navDropdown.appendChild(optgroup);
	});
	
	navDropdown.addEventListener('change', () => {
		scrollToChapter(navDropdown.value);
	});
}

/**
 * Scrolls the manuscript to a specific chapter.
 * @param {string} chapterId - The ID of the chapter to scroll to.
 */
function scrollToChapter(chapterId) {
	const target = document.getElementById(`chapter-scroll-target-${chapterId}`);
	const container = document.getElementById('js-manuscript-container');
	
	if (target && container) {
		isScrollingProgrammatically = true;
		
		const containerRect = container.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		
		// Calculate the target's position relative to the scroll container's top.
		const offsetTop = targetRect.top - containerRect.top;
		
		// Calculate the final scroll position, subtracting an offset for the header.
		// 100px should be enough for the section header + some breathing room.
		const scrollPosition = container.scrollTop + offsetTop - 100;
		
		container.scrollTo({
			top: scrollPosition,
			behavior: 'smooth'
		});
		
		// Update side panel immediately on programmatic scroll
		if (chapterId !== activeChapterId) {
			activeChapterId = chapterId;
			updateSidePanel(chapterId);
		}
		// Reset flag after scroll likely completes
		setTimeout(() => { isScrollingProgrammatically = false; }, 1000);
	}
}
// Main Initialization
document.addEventListener('DOMContentLoaded', async () => {
	const params = new URLSearchParams(window.location.search);
	const novelId = params.get('novelId');
	const initialChapterId = params.get('chapterId');
	
	if (!novelId) {
		document.body.innerHTML = '<p class="text-error p-8">Error: Novel ID is missing.</p>';
		return;
	}
	
	document.body.dataset.novelId = novelId;
	
	try {
		const novelData = await window.api.getFullManuscript(novelId);
		document.title = `Editing: ${novelData.title}`;
		document.getElementById('js-novel-title').textContent = novelData.title;
		
		const manuscriptContainer = document.getElementById('js-manuscript-container');
		renderManuscript(manuscriptContainer, novelData);
		populateNavDropdown(novelData);
		
		setupTopToolbar({
			isChapterEditor: true,
			getSummaryEditorView: () => summaryEditorView,
		});
		setupPromptEditor();
		setupIntersectionObserver();
		
		const chapterToLoad = initialChapterId || novelData.sections[0]?.chapters[0]?.id;
		if (chapterToLoad) {
			document.getElementById('js-chapter-nav-dropdown').value = chapterToLoad;
			// Use a short timeout to ensure the DOM is fully painted before scrolling.
			setTimeout(() => scrollToChapter(chapterToLoad), 100);
		}
		
		document.body.addEventListener('click', (event) => {
			const openBtn = event.target.closest('.js-open-codex-entry');
			if (openBtn) {
				window.api.openCodexEditor(openBtn.dataset.entryId);
			}
		});
		
		// MODIFIED: Safely add IPC listener if it exists.
		if (window.api && typeof window.api.onManuscriptScrollToChapter === 'function') {
			window.api.onManuscriptScrollToChapter((event, chapterId) => {
				if (chapterId) {
					scrollToChapter(chapterId);
					const navDropdown = document.getElementById('js-chapter-nav-dropdown');
					if (navDropdown) {
						navDropdown.value = chapterId;
					}
				}
			});
		}
		
		
	} catch (error) {
		console.error('Failed to load manuscript data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load manuscript. ${error.message}</p>`;
	}
});

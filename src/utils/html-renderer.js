const path = require('path');
const { IMAGES_DIR } = require('./image-handler');

/**
 * Sanitizes text to be safely included in HTML attributes.
 * @param {string | null} text
 * @returns {string}
 */
function escapeAttr(text) {
	if (text === null || typeof text === 'undefined') return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Renders the content for a Chapter window.
 * @param {object} chapter - The chapter data from the database.
 * @returns {string} - The rendered HTML string.
 */
function renderChapterWindow(chapter) {
	const codexTags = chapter.codexEntries.map(entry => `
        <div class="js-codex-tag group/tag relative inline-flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-full pr-2" data-entry-id="${entry.id}">
            <button type="button"
                    class="js-open-codex-entry flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    data-entry-id="${entry.id}"
                    data-entry-title="${escapeAttr(entry.title)}">
                <img src="${escapeAttr(entry.thumbnail_url)}" alt="Thumbnail for ${escapeAttr(entry.title)}" class="w-5 h-5 object-cover rounded-full flex-shrink-0">
                <span class="js-codex-tag-title text-xs font-medium">${escapeAttr(entry.title)}</span>
            </button>
            <button type="button"
                    class="js-remove-codex-link absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-opacity"
                    data-chapter-id="${chapter.id}"
                    data-entry-id="${entry.id}"
                    title="Unlink this entry">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
                </svg>
            </button>
        </div>
    `).join('');
	
	return `
        <div class="p-4 flex flex-col h-full chapter-window-content select-text js-chapter-drop-zone transition-colors duration-300" data-chapter-id="${chapter.id}">
            <div class="prose prose-sm dark:prose-invert max-w-none flex-shrink-0">
                ${chapter.section_order ? `<h3 class="text-sm font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Act ${chapter.section_order} &ndash; Chapter ${chapter.order}</h3>` : ''}
                <h2>${escapeAttr(chapter.title)}</h2>
                ${chapter.summary ? `<p class="lead">${escapeAttr(chapter.summary)}</p>` : ''}
            </div>
            <div class="js-codex-tags-wrapper mt-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-3 ${chapter.codexEntries.length === 0 ? 'hidden' : ''}">
                <div class="js-codex-tags-container flex flex-wrap gap-2">${codexTags}</div>
            </div>
            <div class="flex-grow"></div>
        </div>
    `;
}

/**
 * Renders the content for a Codex Entry window.
 * @param {object} codexEntry - The codex entry data from the database.
 * @returns {string} - The rendered HTML string.
 */
function renderCodexEntryWindow(codexEntry) {
	const linkedTags = codexEntry.linkedEntries.map(entry => `
        <div class="js-codex-tag group/tag relative inline-flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-full pr-2" data-entry-id="${entry.id}">
            <button type="button"
                    class="js-open-codex-entry flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    data-entry-id="${entry.id}"
                    data-entry-title="${escapeAttr(entry.title)}">
                <img src="${escapeAttr(entry.thumbnail_url)}" alt="Thumbnail for ${escapeAttr(entry.title)}" class="w-5 h-5 object-cover rounded-full flex-shrink-0">
                <span class="js-codex-tag-title text-xs font-medium">${escapeAttr(entry.title)}</span>
            </button>
            <button type="button"
                    class="js-remove-codex-codex-link absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-opacity"
                    data-parent-entry-id="${codexEntry.id}"
                    data-entry-id="${entry.id}"
                    title="Unlink this entry">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
            </button>
        </div>
    `).join('');
	
	// Note: The modals are now rendered as DaisyUI dialogs for better integration.
	return `
        <div class="p-4 flex flex-col h-full codex-entry-window-content select-text js-codex-drop-zone transition-colors duration-300" data-entry-id="${codexEntry.id}" data-entry-title="${escapeAttr(codexEntry.title)}">
            <div class="flex-grow flex gap-4 overflow-hidden">
                <div class="w-1/3 flex-shrink-0">
                    <div class="codex-image-container aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden transition-opacity duration-300">
                        <img src="${escapeAttr(codexEntry.image_url)}" alt="Image for ${escapeAttr(codexEntry.title)}" class="w-full h-full object-cover">
                    </div>
                    <div class="mt-2 space-y-2">
                        <button type="button" class="js-codex-upload-image btn btn-sm btn-block">Upload New Image</button>
                        <button type="button" class="js-codex-generate-ai btn btn-sm btn-accent btn-block">Generate with AI</button>
                    </div>
                </div>
                <div class="w-2/3 flex flex-col min-w-0">
                    <div class="flex-shrink-0 prose-sm dark:prose-invert max-w-none">
                        <input type="text" name="title" value="${escapeAttr(codexEntry.title)}" class="js-codex-title-input text-2xl font-bold w-full bg-transparent border-0 p-0 focus:ring-0 focus:border-b-2 focus:border-teal-500" placeholder="Codex Entry Title">
                        <div class="js-codex-editable lead mt-2 relative" data-name="description" data-placeholder="Enter a short summary..."></div>
                    </div>
                    <div class="mt-4 flex-grow overflow-y-auto prose prose-sm dark:prose-invert max-w-none js-codex-editable relative" data-name="content" data-placeholder="Enter detailed content here..."></div>
                </div>
            </div>
            <div class="js-pm-content hidden">
                <div data-name="description">${codexEntry.description || ''}</div>
                <div data-name="content">${codexEntry.content || ''}</div>
            </div>
            <div class="js-codex-tags-wrapper mt-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-3 ${codexEntry.linkedEntries.length === 0 ? 'hidden' : ''}">
                <h4 class="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 mb-2">Linked Entries</h4>
                <div class="js-codex-tags-container flex flex-wrap gap-2">${linkedTags}</div>
            </div>
            
            <!-- AI Generation Dialog -->
            <dialog id="ai-modal-${codexEntry.id}" class="js-ai-modal modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg">Generate Image with AI</h3>
                    <form class="js-ai-form py-4 space-y-4" novalidate>
                        <div class="form-control">
                            <label class="label"><span class="label-text">Prompt</span></label>
                            <textarea name="prompt" rows="4" class="textarea textarea-bordered" placeholder="A detailed portrait..."></textarea>
                        </div>
                        <div class="modal-action">
                            <button type="button" class="js-close-modal btn">Cancel</button>
                            <button type="submit" class="js-ai-submit-btn btn btn-accent w-28">
                                <span class="js-btn-text">Generate</span>
                                <span class="js-spinner hidden animate-spin"><i class="bi bi-arrow-repeat"></i></span>
                            </button>
                        </div>
                    </form>
                </div>
            </dialog>

            <!-- Image Upload Dialog -->
            <dialog id="upload-modal-${codexEntry.id}" class="js-upload-modal modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg">Upload New Image</h3>
                    <form class="js-upload-form py-4 space-y-4" novalidate>
                         <div class="js-image-preview-container hidden aspect-square w-1/2 mx-auto bg-base-300 rounded-md overflow-hidden">
                            <img src="" alt="Image preview" class="js-image-preview w-full h-full object-cover">
                        </div>
                        <button type="button" class="js-trigger-file-input btn btn-block btn-outline">
                            <span class="js-file-name">Click to select a file</span>
                        </button>
                        <p class="text-xs text-center text-base-content/70">PNG, JPG, GIF, WEBP up to 2MB.</p>
                        <div class="modal-action">
                            <button type="button" class="js-close-modal btn">Cancel</button>
                            <button type="submit" class="js-upload-submit-btn btn btn-primary w-28" disabled>
                                <span class="js-btn-text">Upload</span>
                                <span class="js-spinner hidden animate-spin"><i class="bi bi-arrow-repeat"></i></span>
                            </button>
                        </div>
                    </form>
                </div>
            </dialog>
        </div>
    `;
}

module.exports = { renderChapterWindow, renderCodexEntryWindow };

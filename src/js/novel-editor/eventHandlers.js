/**
 * This module contains functions to set up various event listeners for the novel editor UI.
 */

/**
 * Sets up the event listener for opening codex entry windows.
 * @param {HTMLElement} desktop - The main desktop element to attach the listener to.
 * @param {WindowManager} windowManager - The window manager instance.
 */
export function setupCodexEntryHandler(desktop, windowManager) {
	const entryIcon = `<i class="bi bi-journal-richtext text-lg"></i>`;
	
	desktop.addEventListener('click', async (event) => {
		const entryButton = event.target.closest('.js-open-codex-entry');
		if (!entryButton) return;
		
		const entryId = entryButton.dataset.entryId;
		const entryTitle = entryButton.dataset.entryTitle;
		const windowId = `codex-entry-${entryId}`;
		
		if (windowManager.windows.has(windowId)) {
			const win = windowManager.windows.get(windowId);
			if (win.isMinimized) {
				windowManager.restore(windowId);
			} else {
				windowManager.focus(windowId);
			}
			// MODIFIED: Scroll the existing window into view when it's opened/focused from the codex list.
			windowManager.scrollIntoView(windowId);
			return;
		}
		
		try {
			// MODIFIED: Replaced fetch with window.api call
			const content = await window.api.getCodexEntryHtml(entryId);
			if (!content) {
				throw new Error('Failed to load codex entry details.');
			}
			
			const openWindows = document.querySelectorAll('[id^="codex-entry-"]').length;
			const offsetX = 850 + (openWindows * 30);
			const offsetY = 120 + (openWindows * 30);
			
			windowManager.createWindow({
				id: windowId,
				title: entryTitle,
				content: content,
				x: offsetX,
				y: offsetY,
				width: 600,
				height: 450,
				icon: entryIcon,
				closable: true
			});
			
			// NEW: Scroll the newly created window into view.
			// A timeout ensures the browser has rendered the window and its dimensions are available for calculation.
			setTimeout(() => windowManager.scrollIntoView(windowId), 150);
		} catch (error) {
			console.error('Error opening codex entry window:', error);
			alert(error.message);
		}
	});
}

/**
 * Sets up the event listener for opening chapter windows.
 * @param {HTMLElement} desktop - The main desktop element to attach the listener to.
 * @param {WindowManager} windowManager - The window manager instance.
 */
export function setupChapterHandler(desktop, windowManager) {
	const chapterIcon = `<i class="bi bi-card-text text-lg"></i>`;
	
	desktop.addEventListener('click', async (event) => {
		const chapterButton = event.target.closest('.js-open-chapter');
		if (!chapterButton) return;
		
		const chapterId = chapterButton.dataset.chapterId;
		const chapterTitle = chapterButton.dataset.chapterTitle;
		const windowId = `chapter-${chapterId}`;
		
		if (windowManager.windows.has(windowId)) {
			const win = windowManager.windows.get(windowId);
			if (win.isMinimized) {
				windowManager.restore(windowId);
			} else {
				windowManager.focus(windowId);
			}
			// MODIFIED: Scroll the existing window into view when it's opened/focused from the outline.
			windowManager.scrollIntoView(windowId);
			return;
		}
		
		try {
			// MODIFIED: Replaced fetch with window.api call
			const content = await window.api.getChapterHtml(chapterId);
			if (!content) {
				throw new Error('Failed to load chapter details.');
			}
			
			const openWindows = document.querySelectorAll('[id^="chapter-"]').length;
			const offsetX = 100 + (openWindows * 30);
			const offsetY = 300 + (openWindows * 30);
			
			windowManager.createWindow({
				id: windowId,
				title: chapterTitle,
				content: content,
				x: offsetX,
				y: offsetY,
				width: 700,
				height: 500,
				icon: chapterIcon,
				closable: true
			});
			
			// NEW: Scroll the newly created window into view.
			// A timeout ensures the browser has rendered the window and its dimensions are available for calculation.
			setTimeout(() => windowManager.scrollIntoView(windowId), 150);
		} catch (error) {
			console.error('Error opening chapter window:', error);
			alert(error.message);
		}
	});
}

/**
 * Sets up the theme toggling functionality.
 * NOTE: This is now handled by the universal theme.js script, but kept for reference.
 */
export function setupThemeToggle() {
	// This function is now empty as theme.js handles this globally.
}

/**
 * Sets up the "Open Windows" menu functionality in the taskbar.
 * @param {WindowManager} windowManager - The window manager instance.
 */
export function setupOpenWindowsMenu(windowManager) {
	const openWindowsBtn = document.getElementById('open-windows-btn');
	const openWindowsMenu = document.getElementById('open-windows-menu');
	const openWindowsList = document.getElementById('open-windows-list');
	
	function populateOpenWindowsMenu() {
		openWindowsList.innerHTML = '';
		
		if (windowManager.windows.size === 0) {
			openWindowsList.innerHTML = `<li><span class="px-4 py-2 text-sm text-base-content/70">No open windows.</span></li>`;
			return;
		}
		
		const createMenuItem = (innerHTML, onClick) => {
			const li = document.createElement('li');
			const button = document.createElement('button');
			button.className = 'w-full text-left px-4 py-2 text-sm hover:bg-base-200 flex items-center gap-3';
			button.innerHTML = innerHTML;
			button.addEventListener('click', () => {
				if (onClick) onClick();
				if (document.activeElement) document.activeElement.blur(); // Close dropdown
			});
			li.appendChild(button);
			return li;
		};
		
		const specialOrder = ['outline-window', 'codex-window'];
		const sortedWindows = [];
		const otherWindows = [];
		
		windowManager.windows.forEach((win, windowId) => {
			if (!specialOrder.includes(windowId)) {
				otherWindows.push({ win, windowId });
			}
		});
		
		specialOrder.forEach(id => {
			if (windowManager.windows.has(id)) {
				sortedWindows.push({ win: windowManager.windows.get(id), windowId: id });
			}
		});
		
		otherWindows.sort((a, b) => a.win.title.localeCompare(b.win.title));
		
		const allSortedWindows = [...sortedWindows, ...otherWindows];
		
		allSortedWindows.forEach(({ win, windowId }) => {
			const innerHTML = `<div class="w-5 h-5 flex-shrink-0">${win.icon || ''}</div><span class="truncate">${win.title}</span>`;
			const li = createMenuItem(innerHTML, () => {
				if (win.isMinimized) {
					windowManager.restore(windowId);
				} else {
					windowManager.focus(windowId);
				}
			});
			openWindowsList.appendChild(li);
		});
	}
	
	// MODIFIED: DaisyUI dropdowns work on focus, so we populate on focusin.
	openWindowsBtn.addEventListener('focusin', () => {
		populateOpenWindowsMenu();
	});
}

/**
 * Sets up the canvas zoom controls.
 * @param {WindowManager} windowManager - The window manager instance.
 */
export function setupCanvasControls(windowManager) {
	const zoomInBtn = document.getElementById('zoom-in-btn');
	const zoomOutBtn = document.getElementById('zoom-out-btn');
	const zoom100Btn = document.getElementById('zoom-100-btn');
	const zoomFitBtn = document.getElementById('zoom-fit-btn');
	
	if (zoomInBtn) zoomInBtn.addEventListener('click', () => windowManager.zoomIn());
	if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => windowManager.zoomOut());
	if (zoom100Btn) zoom100Btn.addEventListener('click', () => windowManager.zoomTo(1));
	if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => windowManager.fitToView());
}

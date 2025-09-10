// NEW: Entry point for the dedicated codex entry editor window.
import { setupTopToolbar } from '../novel-planner/toolbar.js';
import { getCodexEditorView, setupContentEditor } from './codex-content-editor.js';
import { setupPromptEditor } from '../prompt-editor.js';

// --- Image Modal and Upload Logic (adapted from codex-entry-editor.js) ---
function setupImageHandlers(entryId) {
	const openModal = (modal) => {
		if (modal) modal.showModal();
	};
	
	const closeModal = (modal) => {
		if (modal) {
			modal.close();
			const form = modal.querySelector('form');
			if (form) {
				form.reset();
				const previewContainer = form.querySelector('.js-image-preview-container');
				if (previewContainer) previewContainer.classList.add('hidden');
				const fileNameSpan = form.querySelector('.js-file-name');
				if (fileNameSpan) fileNameSpan.textContent = 'Click to select a file';
				const submitBtn = form.querySelector('button[type="submit"]');
				if (submitBtn) submitBtn.disabled = true;
			}
		}
	};
	
	const setButtonLoadingState = (button, isLoading) => {
		const text = button.querySelector('.js-btn-text');
		const spinner = button.querySelector('.js-spinner');
		if (isLoading) {
			button.disabled = true;
			if (text) text.classList.add('hidden');
			if (spinner) spinner.classList.remove('hidden');
		} else {
			button.disabled = false;
			if (text) text.classList.remove('hidden');
			if (spinner) spinner.classList.add('hidden');
		}
	};
	
	document.body.addEventListener('click', (event) => {
		const target = event.target;
		const openTrigger = target.closest('.js-codex-generate-ai, .js-codex-upload-image');
		if (openTrigger) {
			const entryTitle = document.getElementById('js-codex-title-input').value;
			if (openTrigger.matches('.js-codex-generate-ai')) {
				const modal = document.getElementById('ai-modal');
				const textarea = modal.querySelector('textarea');
				textarea.value = `A detailed portrait of ${entryTitle}, fantasy art.`;
				openModal(modal);
			}
			if (openTrigger.matches('.js-codex-upload-image')) {
				const modal = document.getElementById('upload-modal');
				openModal(modal);
			}
			return;
		}
		const closeTrigger = target.closest('.js-close-modal');
		if (closeTrigger) {
			const modal = closeTrigger.closest('dialog.modal');
			closeModal(modal);
		}
	});
	
	document.body.addEventListener('submit', async (event) => {
		if (event.target.matches('.js-ai-form')) {
			event.preventDefault();
			const form = event.target;
			const modal = form.closest('.js-ai-modal');
			const submitBtn = form.querySelector('.js-ai-submit-btn');
			const prompt = new FormData(form).get('prompt');
			if (!prompt || prompt.trim() === '') {
				alert('Please enter a prompt.');
				return;
			}
			setButtonLoadingState(submitBtn, true);
			const imageContainer = document.getElementById('js-image-container');
			const imgEl = imageContainer.querySelector('img');
			imageContainer.classList.add('opacity-50');
			try {
				const data = await window.api.generateCodexImage(entryId, prompt);
				if (!data.success) throw new Error(data.message || 'An unknown error occurred.');
				imgEl.src = data.image_url;
				closeModal(modal);
			} catch (error) {
				console.error('AI Image Generation Error:', error);
				alert('Failed to generate image: ' + error.message);
			} finally {
				setButtonLoadingState(submitBtn, false);
				imageContainer.classList.remove('opacity-50');
			}
		} else if (event.target.matches('.js-upload-form')) {
			event.preventDefault();
			const form = event.target;
			const modal = form.closest('.js-upload-modal');
			const submitBtn = form.querySelector('.js-upload-submit-btn');
			const filePath = form.dataset.filePath;
			if (!filePath) {
				alert('No file selected.');
				return;
			}
			setButtonLoadingState(submitBtn, true);
			const imageContainer = document.getElementById('js-image-container');
			const imgEl = imageContainer.querySelector('img');
			imageContainer.classList.add('opacity-50');
			try {
				const data = await window.api.uploadCodexImage(entryId, filePath);
				if (!data.success) throw new Error(data.message || 'Upload failed.');
				imgEl.src = data.image_url;
				closeModal(modal);
			} catch (error) {
				console.error('Image Upload Error:', error);
				alert('Failed to upload image: ' + error.message);
			} finally {
				setButtonLoadingState(submitBtn, false);
				imageContainer.classList.remove('opacity-50');
			}
		}
	});
	
	document.body.addEventListener('click', async (event) => {
		if (!event.target.matches('.js-trigger-file-input')) return;
		const button = event.target;
		const form = button.closest('form');
		const filePath = await window.api.showOpenImageDialog();
		if (filePath) {
			const previewContainer = form.querySelector('.js-image-preview-container');
			const previewImg = form.querySelector('.js-image-preview');
			const fileNameSpan = form.querySelector('.js-file-name');
			const submitBtn = form.querySelector('button[type="submit"]');
			form.dataset.filePath = filePath;
			const response = await fetch(`file://${filePath}`);
			const blob = await response.blob();
			const reader = new FileReader();
			reader.readAsDataURL(blob);
			reader.onloadend = () => {
				previewImg.src = reader.result;
				previewContainer.classList.remove('hidden');
			};
			fileNameSpan.textContent = filePath.split(/[\\/]/).pop();
			submitBtn.disabled = false;
		}
	});
}

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
	const params = new URLSearchParams(window.location.search);
	const entryId = params.get('entryId');
	
	if (!entryId) {
		document.body.innerHTML = '<p class="text-error p-8">Error: Codex Entry ID is missing.</p>';
		return;
	}
	
	document.body.dataset.entryId = entryId;
	
	try {
		const entryData = await window.api.getOneCodexForEditor(entryId);
		document.body.dataset.novelId = entryData.novel_id;
		
		// Populate header and title
		document.getElementById('js-novel-info').textContent = `${entryData.novel_title} > Codex`;
		document.getElementById('js-codex-title-input').value = entryData.title;
		document.title = `Editing Codex: ${entryData.title}`;
		
		// Populate image
		document.querySelector('#js-image-container img').src = entryData.image_url;
		
		// Populate hidden div for ProseMirror
		const sourceContainer = document.getElementById('js-pm-content-source');
		sourceContainer.querySelector('[data-name="content"]').innerHTML = entryData.content || '';
		
		// Initialize editors and toolbar
		setupContentEditor(entryId);
		setupTopToolbar({
			isCodexEditor: true,
			getEditorView: getCodexEditorView,
		});
		setupPromptEditor();
		setupImageHandlers(entryId);
		
	} catch (error) {
		console.error('Failed to load codex entry data:', error);
		document.body.innerHTML = `<p class="text-error p-8">Error: Could not load codex entry data. ${error.message}</p>`;
	}
});

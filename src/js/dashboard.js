document.addEventListener('DOMContentLoaded', () => {
	const novelList = document.getElementById('novel-list');
	const loadingMessage = document.getElementById('loading-message');
	const openPromptsBtn = document.getElementById('open-prompts-btn'); // MODIFIED: Get the prompt editor button
	
	// Prose Modal Elements
	const proseModal = document.getElementById('prose-settings-modal');
	const proseForm = document.getElementById('prose-settings-form');
	const proseNovelIdInput = document.getElementById('prose-novel-id');
	const saveProseBtn = document.getElementById('save-prose-settings-btn');
	const languageSelect = document.getElementById('prose_language');
	
	// Meta Modal Elements
	const metaModal = document.getElementById('meta-settings-modal');
	const metaForm = document.getElementById('meta-settings-form');
	const metaNovelIdInput = document.getElementById('meta-novel-id');
	const metaSeriesSelect = document.getElementById('meta-series-id');
	const metaCoverPreview = document.getElementById('meta-cover-preview');
	const saveMetaBtn = document.getElementById('save-meta-settings-btn');
	const generateCoverBtn = document.getElementById('generate-cover-btn');
	const uploadCoverBtn = document.getElementById('upload-cover-btn');
	const deleteNovelBtn = document.getElementById('delete-novel-btn');
	
	// AI Cover Generation Modal Elements
	const genCoverModal = document.getElementById('generate-cover-modal');
	const genCoverPrompt = document.getElementById('generate-cover-prompt');
	const runGenCoverBtn = document.getElementById('run-generate-cover-btn');
	const genCoverPreview = document.getElementById('generate-cover-preview');
	const acceptGenCoverBtn = document.getElementById('accept-generated-cover-btn');
	
	let novelsData = [];
	let seriesData = [];
	let stagedCover = null; // To hold cover changes before saving
	
	const languages = [
		"English", "Spanish", "French", "German", "Mandarin Chinese", "Hindi", "Arabic", "Bengali", "Russian", "Portuguese", "Indonesian", "Urdu", "Japanese", "Swahili", "Marathi", "Telugu", "Turkish", "Korean", "Tamil", "Vietnamese", "Italian", "Javanese", "Thai", "Gujarati", "Polish", "Ukrainian", "Malayalam", "Kannada", "Oriya", "Burmese"
	];
	
	function populateLanguages() {
		languages.forEach(lang => languageSelect.add(new Option(lang, lang)));
	}
	
	function setButtonLoading(button, isLoading) {
		const content = button.querySelector('.js-btn-content');
		const spinner = button.querySelector('.js-btn-spinner');
		button.disabled = isLoading;
		if (content) content.classList.toggle('hidden', isLoading);
		if (spinner) spinner.classList.toggle('hidden', !isLoading);
	}
	
	function openProseSettingsModal(novel) {
		proseNovelIdInput.value = novel.id;
		proseForm.querySelector('#prose_tense').value = novel.prose_tense || 'past';
		proseForm.querySelector('#prose_language').value = novel.prose_language || 'English';
		proseForm.querySelector('#prose_pov').value = novel.prose_pov || 'third_person_limited';
		proseModal.showModal();
	}
	
	function openMetaSettingsModal(novel) {
		stagedCover = null; // Reset staged cover on modal open
		metaNovelIdInput.value = novel.id;
		metaForm.querySelector('#meta-title').value = novel.title;
		metaForm.querySelector('#meta-author').value = novel.author || '';
		metaForm.querySelector('#meta-series-index').value = novel.order_in_series || '';
		
		// Set initial preview to the current cover or placeholder
		const currentNovel = novelsData.find(n => n.id === novel.id);
		if (currentNovel && currentNovel.cover_path) {
			metaCoverPreview.innerHTML = `<img src="file://${currentNovel.cover_path}?t=${Date.now()}" alt="Current cover" class="w-full h-auto">`;
		} else {
			metaCoverPreview.innerHTML = `<img src="./assets/book-placeholder.png" alt="No Cover" class="w-full h-auto">`;
		}
		
		metaSeriesSelect.innerHTML = '<option value="">—</option>';
		seriesData.forEach(series => {
			const option = new Option(series.title, series.id);
			if (series.id === novel.series_id) option.selected = true;
			metaSeriesSelect.add(option);
		});
		
		metaModal.showModal();
	}
	
	function updateNovelCardUI(novelId) {
		const novel = novelsData.find(n => n.id === novelId);
		if (!novel) return;
		
		const card = novelList.querySelector(`[data-novel-id='${novelId}']`);
		if (card) {
			card.querySelector('.card-title').textContent = novel.title;
			card.querySelector('.text-base-content\\/80').textContent = novel.author || 'Unknown Author';
		}
	}
	
	async function loadInitialData() {
		try {
			seriesData = await window.api.getSeries();
			novelsData = await window.api.getNovelsWithCovers();
			renderNovels();
		} catch (error) {
			console.error('Failed to load initial data:', error);
			loadingMessage.textContent = 'Error loading novels.';
		}
	}
	
	function renderNovels() {
		loadingMessage.style.display = 'none';
		
		if (novelsData.length === 0) {
			novelList.innerHTML = '<p class="text-base-content/70 col-span-full text-center">You haven\'t created any novels yet.</p>';
			return;
		}
		
		novelList.innerHTML = '';
		novelsData.forEach(novel => {
			const novelCard = document.createElement('div');
			novelCard.className = 'card card-compact bg-base-200 shadow-xl transition-shadow';
			novelCard.dataset.novelId = novel.id;
			
			const coverHtml = novel.cover_path
				? `<img src="file://${novel.cover_path}" alt="Cover for ${novel.title}" class="w-full">`
				: `<img src="./assets/book-placeholder.png" alt="No Cover" class="w-full h-auto">`;
			
			const actionButtonHtml = novel.chapter_count > 0
				? `<button class="btn btn-primary js-open-editor">Open Editor</button>`
				: `<a href="generate-structure.html?novelId=${novel.id}" class="btn btn-accent js-fill-ai"><i class="bi bi-stars"></i> Fill with AI</a>`;
			
			novelCard.innerHTML = `
                <figure class="cursor-pointer js-open-editor">${coverHtml}</figure>
                <div class="card-body">
                    <h2 class="card-title">${novel.title}</h2>
                    <p class="text-base-content/80">${novel.author || 'Unknown Author'}</p>
                    <div class="card-actions justify-end items-center mt-2">
                        <button class="btn btn-ghost btn-sm js-meta-settings" title="Edit Meta">
                            <i class="bi bi-pencil-square text-lg"></i>
                        </button>
                        <button class="btn btn-ghost btn-sm js-prose-settings" title="Edit Prose">
                            <i class="bi bi-sliders text-lg"></i>
                        </button>
                        <div class="flex-grow"></div>
                        ${actionButtonHtml}
                    </div>
                </div>
            `;
			
			novelCard.querySelectorAll('.js-open-editor').forEach(el => el.addEventListener('click', () => window.api.openEditor(novel.id)));
			novelCard.querySelector('.js-prose-settings').addEventListener('click', () => openProseSettingsModal(novel));
			novelCard.querySelector('.js-meta-settings').addEventListener('click', () => openMetaSettingsModal(novel));
			
			novelList.appendChild(novelCard);
		});
	}
	
	// --- Event Listeners ---
	
	// MODIFIED: Add listener for the prompt editor window button
	if (openPromptsBtn) {
		openPromptsBtn.addEventListener('click', () => {
			window.api.openPromptEditor();
		});
	}
	
	saveProseBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		const novelId = parseInt(proseNovelIdInput.value, 10);
		const formData = new FormData(proseForm);
		const data = {
			novelId,
			prose_tense: formData.get('prose_tense'),
			prose_language: formData.get('prose_language'),
			prose_pov: formData.get('prose_pov'),
		};
		
		try {
			await window.api.updateProseSettings(data);
			const novelIndex = novelsData.findIndex(n => n.id === novelId);
			if (novelIndex !== -1) Object.assign(novelsData[novelIndex], data);
			proseModal.close();
		} catch (error) {
			console.error('Failed to save prose settings:', error);
		}
	});
	
	saveMetaBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		const novelId = parseInt(metaNovelIdInput.value, 10);
		
		// Save text fields
		const formData = new FormData(metaForm);
		const data = {
			novelId,
			title: formData.get('title'),
			author: formData.get('author'),
			series_id: formData.get('series_id') || null,
			order_in_series: formData.get('order_in_series') || null,
		};
		
		try {
			await window.api.updateNovelMeta(data);
			const novelIndex = novelsData.findIndex(n => n.id === novelId);
			if (novelIndex !== -1) Object.assign(novelsData[novelIndex], data);
			updateNovelCardUI(novelId);
			
			if (stagedCover) {
				await window.api.updateNovelCover({ novelId, coverInfo: stagedCover });
			}
			
			metaModal.close();
		} catch (error) {
			console.error('Failed to save meta settings:', error);
			alert('Error saving settings: ' + error.message);
		}
	});
	
	generateCoverBtn.addEventListener('click', async () => {
		const novelId = parseInt(metaNovelIdInput.value, 10);
		genCoverPrompt.value = '';
		genCoverPreview.innerHTML = `<p class="text-base-content/50">Image preview will appear here</p>`;
		acceptGenCoverBtn.disabled = true;
		genCoverModal.showModal();
		
		setButtonLoading(generateCoverBtn, true);
		try {
			const prompt = await window.api.aiGenerateCoverPrompt(novelId);
			if (prompt) genCoverPrompt.value = prompt;
		} catch (error) {
			console.error('Failed to generate prompt:', error);
			genCoverPrompt.placeholder = 'Could not generate a prompt automatically.';
		} finally {
			setButtonLoading(generateCoverBtn, false);
		}
	});
	
	uploadCoverBtn.addEventListener('click', async () => {
		const filePath = await window.api.showOpenImageDialog();
		if (filePath) {
			stagedCover = { type: 'local', data: filePath };
			metaCoverPreview.innerHTML = `<img src="file://${filePath}" alt="Staged cover" class="w-full h-auto">`;
		}
	});
	
	deleteNovelBtn.addEventListener('click', async () => {
		const novelId = parseInt(metaNovelIdInput.value, 10);
		const novel = novelsData.find(n => n.id === novelId);
		if (!novel) return;
		
		const confirmation = confirm(`Are you sure you want to permanently delete "${novel.title}"?\n\nThis action cannot be undone.`);
		if (confirmation) {
			try {
				await window.api.deleteNovel(novelId);
				novelsData = novelsData.filter(n => n.id !== novelId);
				metaModal.close();
				renderNovels();
			} catch (error) {
				console.error('Failed to delete novel:', error);
				alert('Error deleting novel.');
			}
		}
	});
	
	// --- Event Listeners for AI Cover Modal ---
	
	runGenCoverBtn.addEventListener('click', async () => {
		const prompt = genCoverPrompt.value.trim();
		if (!prompt) return;
		
		setButtonLoading(runGenCoverBtn, true);
		genCoverPreview.innerHTML = `<span class="loading loading-spinner loading-lg"></span>`;
		acceptGenCoverBtn.disabled = true;
		
		try {
			const imageUrl = await window.api.aiGenerateImageFromPrompt(prompt);
			if (imageUrl) {
				genCoverPreview.innerHTML = `<img src="${imageUrl}" alt="AI generated preview" class="w-full h-auto">`;
				acceptGenCoverBtn.disabled = false;
			} else {
				throw new Error('AI service did not return an image URL.');
			}
		} catch (error) {
			console.error('Image generation failed:', error);
			genCoverPreview.innerHTML = `<p class="text-error p-4">Error: ${error.message}</p>`;
		} finally {
			setButtonLoading(runGenCoverBtn, false);
		}
	});
	
	acceptGenCoverBtn.addEventListener('click', () => {
		const img = genCoverPreview.querySelector('img');
		if (img && img.src) {
			// Stage the remote URL for saving later.
			stagedCover = { type: 'remote', data: img.src };
			metaCoverPreview.innerHTML = `<img src="${img.src}" alt="Staged cover" class="w-full h-auto">`;
			genCoverModal.close();
		}
	});
	
	// --- IPC Listeners ---
	
	window.api.onCoverUpdated((event, { novelId, imagePath }) => {
		const novelIndex = novelsData.findIndex(n => n.id === novelId);
		if (novelIndex !== -1) {
			novelsData[novelIndex].cover_path = imagePath;
		}
		
		const card = novelList.querySelector(`[data-novel-id='${novelId}']`);
		if (card) {
			const figure = card.querySelector('figure');
			if (figure) {
				figure.innerHTML = `<img src="file://${imagePath}?t=${Date.now()}" alt="Cover for novel ${novelId}" class="w-full">`;
			}
		}
	});
	
	populateLanguages();
	loadInitialData();
});

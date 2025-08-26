document.addEventListener('DOMContentLoaded', () => {
	const novelList = document.getElementById('novel-list');
	const loadingMessage = document.getElementById('loading-message');
	// NEW: References for the prose settings modal and its form elements.
	const proseModal = document.getElementById('prose-settings-modal');
	const proseForm = document.getElementById('prose-settings-form');
	const proseNovelIdInput = document.getElementById('prose-novel-id');
	const saveProseBtn = document.getElementById('save-prose-settings-btn');
	const languageSelect = document.getElementById('prose_language');
	
	let novelsData = []; // NEW: Store novels data in a higher scope to allow in-memory updates.
	
	// NEW: List of top languages for the dropdown.
	const languages = [
		"English", "Spanish", "French", "German", "Mandarin Chinese",
		"Hindi", "Arabic", "Bengali", "Russian", "Portuguese",
		"Indonesian", "Urdu", "Japanese", "Swahili", "Marathi",
		"Telugu", "Turkish", "Korean", "Tamil", "Vietnamese",
		"Italian", "Javanese", "Thai", "Gujarati", "Polish",
		"Ukrainian", "Malayalam", "Kannada", "Oriya", "Burmese"
	];
	
	// NEW: Function to populate the language dropdown in the modal.
	function populateLanguages() {
		languages.forEach(lang => {
			languageSelect.add(new Option(lang, lang));
		});
	}
	
	// NEW: Function to open and populate the prose settings modal with a novel's data.
	function openProseSettingsModal(novel) {
		proseNovelIdInput.value = novel.id;
		proseForm.querySelector('#prose_tense').value = novel.prose_tense || 'past';
		proseForm.querySelector('#prose_language').value = novel.prose_language || 'English';
		proseForm.querySelector('#prose_pov').value = novel.prose_pov || 'third_person_limited';
		proseModal.showModal();
	}
	
	async function loadNovels() {
		try {
			const novels = await window.api.getNovelsWithCovers();
			novelsData = novels; // Store data for later use.
			loadingMessage.remove();
			
			if (novels.length === 0) {
				novelList.innerHTML = '<p class="text-base-content/70 col-span-full text-center">You haven\'t created any novels yet.</p>';
				return;
			}
			
			novelList.innerHTML = ''; // Clear previous content
			novels.forEach(novel => {
				const novelCard = document.createElement('div');
				novelCard.className = 'card card-compact bg-base-200 shadow-xl transition-shadow';
				novelCard.dataset.novelId = novel.id;
				
				const coverHtml = novel.cover_path
					? `<img src="file://${novel.cover_path}" alt="Cover for ${novel.title}" class="w-full h-56 object-cover">`
					: `<div class="bg-base-300 h-56 flex items-center justify-center"><span class="text-base-content/50">No Cover</span></div>`;
				
				const actionButtonHtml = novel.chapter_count > 0
					? `<button class="btn btn-primary js-open-editor">Open Editor</button>`
					: `<a href="generate-structure.html?novelId=${novel.id}" class="btn btn-accent js-fill-ai">
                         <i class="bi bi-stars"></i> Fill with AI
                       </a>`;
				
				// MODIFIED: Added a "Prose" settings button to the card actions.
				novelCard.innerHTML = `
                    <figure class="cursor-pointer js-open-editor">${coverHtml}</figure>
                    <div class="card-body">
                        <h2 class="card-title">${novel.title}</h2>
                        <p class="text-base-content/80">${novel.author || 'Unknown Author'}</p>
                        <div class="card-actions justify-end items-center mt-2">
                            <button class="btn btn-ghost btn-sm js-prose-settings gap-2">
                                <i class="bi bi-sliders"></i> Prose
                            </button>
                            ${actionButtonHtml}
                        </div>
                    </div>
                `;
				
				novelCard.querySelectorAll('.js-open-editor').forEach(el => {
					el.addEventListener('click', () => {
						window.api.openEditor(novel.id);
					});
				});
				
				// NEW: Add event listener for the new prose settings button.
				novelCard.querySelector('.js-prose-settings').addEventListener('click', () => {
					openProseSettingsModal(novel);
				});
				
				novelList.appendChild(novelCard);
			});
		} catch (error) {
			console.error('Failed to load novels:', error);
			loadingMessage.textContent = 'Error loading novels.';
		}
	}
	
	// NEW: Event listener for saving prose settings from the modal.
	saveProseBtn.addEventListener('click', async (e) => {
		e.preventDefault();
		const novelId = parseInt(proseNovelIdInput.value, 10);
		const formData = new FormData(proseForm);
		const data = {
			novelId: novelId,
			prose_tense: formData.get('prose_tense'),
			prose_language: formData.get('prose_language'),
			prose_pov: formData.get('prose_pov'),
		};
		
		try {
			await window.api.updateProseSettings(data);
			
			// Update the in-memory data to reflect the change without a full reload.
			const novelIndex = novelsData.findIndex(n => n.id === novelId);
			if (novelIndex !== -1) {
				novelsData[novelIndex].prose_tense = data.prose_tense;
				novelsData[novelIndex].prose_language = data.prose_language;
				novelsData[novelIndex].prose_pov = data.prose_pov;
			}
			
			proseModal.close();
		} catch (error) {
			console.error('Failed to save prose settings:', error);
			// Optionally show an error message to the user here.
		}
	});
	
	window.api.onCoverUpdated((event, { novelId, imagePath }) => {
		const card = novelList.querySelector(`[data-novel-id='${novelId}']`);
		if (card) {
			const figure = card.querySelector('figure');
			if (figure) {
				figure.innerHTML = `<img src="file://${imagePath}" alt="Cover for novel ${novelId}" class="w-full h-56 object-cover">`;
			}
		}
	});
	
	populateLanguages(); // Populate languages on initial load.
	loadNovels();
});

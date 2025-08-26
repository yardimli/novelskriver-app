document.addEventListener('DOMContentLoaded', () => {
	const createNovelForm = document.getElementById('createNovelForm');
	const surpriseMeBtn = document.getElementById('surprise-me-btn');
	const titleInput = document.getElementById('title');
	const authorInput = document.getElementById('author');
	const authorDropdownBtn = document.getElementById('author-dropdown-btn');
	const authorList = document.getElementById('author-list');
	const seriesSelect = document.getElementById('series_id');
	const newSeriesBtn = document.getElementById('new-series-btn');
	const newSeriesModal = document.getElementById('new-series-modal');
	const saveNewSeriesBtn = document.getElementById('save-new-series-btn');
	const newSeriesTitleInput = document.getElementById('new_series_title');
	const newSeriesError = document.getElementById('new-series-error');
	
	// --- NEW: Helper function to manage button loading state ---
	/**
	 * Toggles the loading state of a button.
	 * @param {HTMLButtonElement} button The button element.
	 * @param {boolean} isLoading Whether to show the loading state.
	 */
	function setButtonLoading(button, isLoading) {
		const content = button.querySelector('.js-btn-content');
		const spinner = button.querySelector('.js-btn-spinner');
		
		if (isLoading) {
			button.disabled = true;
			if (content) content.classList.add('hidden');
			if (spinner) spinner.classList.remove('hidden');
		} else {
			button.disabled = false;
			if (content) content.classList.remove('hidden');
			if (spinner) spinner.classList.add('hidden');
		}
	}
	
	// --- Load Initial Data ---
	
	async function loadSeries() {
		try {
			const seriesList = await window.api.getSeries();
			seriesList.forEach(series => {
				seriesSelect.add(new Option(series.title, series.id));
			});
		} catch (error) {
			console.error('Failed to load series:', error);
		}
	}
	
	async function loadAuthors() {
		try {
			const authors = await window.api.getAuthors();
			if (authors.length === 0) {
				authorList.innerHTML = '<li><span class="px-4 py-2 text-sm text-base-content/50">No previous authors</span></li>';
				return;
			}
			authors.forEach(author => {
				const li = document.createElement('li');
				const a = document.createElement('a');
				a.textContent = author;
				a.addEventListener('click', () => {
					authorInput.value = author;
					if (document.activeElement) document.activeElement.blur();
				});
				li.appendChild(a);
				authorList.appendChild(li);
			});
		} catch (error) {
			console.error('Failed to load authors:', error);
		}
	}
	
	// --- Event Listeners ---
	
	// "Surprise Me" Title Generation
	surpriseMeBtn.addEventListener('click', async () => {
		setButtonLoading(surpriseMeBtn, true);
		
		try {
			const data = await window.api.generateTitle();
			if (data.title) {
				titleInput.value = data.title;
			}
		} catch (error) {
			console.error('Title generation failed:', error);
			alert('Could not generate a title. Please check your API key and network connection.');
		} finally {
			setButtonLoading(surpriseMeBtn, false);
		}
	});
	
	newSeriesBtn.addEventListener('click', () => newSeriesModal.showModal());
	
	saveNewSeriesBtn.addEventListener('click', async () => {
		const title = newSeriesTitleInput.value.trim();
		if (!title) {
			newSeriesError.textContent = 'Series title cannot be empty.';
			newSeriesError.classList.remove('hidden');
			return;
		}
		newSeriesError.classList.add('hidden');
		
		setButtonLoading(saveNewSeriesBtn, true);
		
		try {
			const newSeries = await window.api.createSeries({ title });
			seriesSelect.add(new Option(newSeries.title, newSeries.id, true, true));
			newSeriesTitleInput.value = '';
			newSeriesModal.close();
		} catch (error) {
			console.error('Failed to create series:', error);
			newSeriesError.textContent = error.message;
			newSeriesError.classList.remove('hidden');
		} finally {
			setButtonLoading(saveNewSeriesBtn, false);
		}
	});
	
	// Main Form Submission
	createNovelForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitBtn = document.getElementById('create-novel-submit-btn');
		setButtonLoading(submitBtn, true);
		
		const formData = new FormData(createNovelForm);
		const data = Object.fromEntries(formData.entries());
		
		try {
			await window.api.createNovel(data);
			window.location.href = 'index.html';
		} catch (error) {
			console.error('Failed to create novel:', error);
			alert('Error: Could not create the novel. ' + error.message);
			setButtonLoading(submitBtn, false);
		}
	});
	
	// --- Initial Page Load ---
	loadSeries();
	loadAuthors();
});

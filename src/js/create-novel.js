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
					// Close dropdown by removing focus
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
		const originalText = surpriseMeBtn.textContent;
		surpriseMeBtn.disabled = true;
		// MODIFIED: Use DaisyUI loading class
		surpriseMeBtn.classList.add('loading');
		surpriseMeBtn.textContent = '';
		
		try {
			const data = await window.api.generateTitle();
			if (data.title) {
				titleInput.value = data.title;
			}
		} catch (error) {
			console.error('Title generation failed:', error);
			alert('Could not generate a title. Please check your API key and network connection.');
		} finally {
			surpriseMeBtn.disabled = false;
			// MODIFIED: Remove DaisyUI loading class
			surpriseMeBtn.classList.remove('loading');
			surpriseMeBtn.textContent = originalText;
		}
	});
	
	// MODIFIED: Dropdown is now handled by DaisyUI via CSS (:focus-within)
	// so the JS for toggling it is no longer needed.
	
	// New Series Modal Logic
	// MODIFIED: Use DaisyUI modal methods
	newSeriesBtn.addEventListener('click', () => newSeriesModal.showModal());
	
	saveNewSeriesBtn.addEventListener('click', async () => {
		const title = newSeriesTitleInput.value.trim();
		if (!title) {
			newSeriesError.textContent = 'Series title cannot be empty.';
			newSeriesError.classList.remove('hidden');
			return;
		}
		newSeriesError.classList.add('hidden');
		
		const originalText = saveNewSeriesBtn.textContent;
		saveNewSeriesBtn.disabled = true;
		// MODIFIED: Use DaisyUI loading class
		saveNewSeriesBtn.classList.add('loading');
		saveNewSeriesBtn.textContent = '';
		
		try {
			const newSeries = await window.api.createSeries({ title });
			seriesSelect.add(new Option(newSeries.title, newSeries.id, true, true));
			newSeriesTitleInput.value = '';
			newSeriesModal.close(); // Close the modal
		} catch (error) {
			console.error('Failed to create series:', error);
			newSeriesError.textContent = error.message;
			newSeriesError.classList.remove('hidden');
		} finally {
			saveNewSeriesBtn.disabled = false;
			// MODIFIED: Remove DaisyUI loading class
			saveNewSeriesBtn.classList.remove('loading');
			saveNewSeriesBtn.textContent = originalText;
		}
	});
	
	// Main Form Submission
	createNovelForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitBtn = document.getElementById('create-novel-submit-btn');
		const originalText = submitBtn.textContent;
		submitBtn.disabled = true;
		// MODIFIED: Use DaisyUI loading class
		submitBtn.classList.add('loading');
		submitBtn.textContent = '';
		
		const formData = new FormData(createNovelForm);
		const data = Object.fromEntries(formData.entries());
		
		try {
			await window.api.createNovel(data);
			window.location.href = 'index.html';
		} catch (error) {
			console.error('Failed to create novel:', error);
			alert('Error: Could not create the novel. ' + error.message);
			submitBtn.disabled = false;
			// MODIFIED: Remove DaisyUI loading class
			submitBtn.classList.remove('loading');
			submitBtn.textContent = originalText;
		}
	});
	
	// --- Initial Page Load ---
	loadSeries();
	loadAuthors();
});

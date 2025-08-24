document.addEventListener('DOMContentLoaded', () => {
	const createNovelForm = document.getElementById('createNovelForm');
	const surpriseMeBtn = document.getElementById('surprise-me-btn');
	const titleInput = document.getElementById('title');
	const authorInput = document.getElementById('author');
	const authorDropdownBtn = document.getElementById('author-dropdown-btn');
	const authorDropdownMenu = document.getElementById('author-dropdown-menu');
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
				authorList.innerHTML = '<li><span class="block px-4 py-2 text-sm text-gray-500">No previous authors</span></li>';
				return;
			}
			authors.forEach(author => {
				const li = document.createElement('li');
				const button = document.createElement('button');
				button.type = 'button';
				button.className = 'block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700';
				button.textContent = author;
				button.addEventListener('click', () => {
					authorInput.value = author;
					authorDropdownMenu.classList.add('hidden');
				});
				li.appendChild(button);
				authorList.appendChild(li);
			});
		} catch (error) {
			console.error('Failed to load authors:', error);
		}
	}
	
	// --- Event Listeners ---
	
	// "Surprise Me" Title Generation
	surpriseMeBtn.addEventListener('click', async () => {
		const originalText = surpriseMeBtn.innerHTML;
		surpriseMeBtn.disabled = true;
		surpriseMeBtn.innerHTML = '<div class="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>';
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
			surpriseMeBtn.innerHTML = originalText;
		}
	});
	
	// Author Dropdown Toggle
	authorDropdownBtn.addEventListener('click', () => {
		authorDropdownMenu.classList.toggle('hidden');
	});
	
	// Hide author dropdown when clicking elsewhere
	document.addEventListener('click', (event) => {
		if (!authorDropdownBtn.contains(event.target) && !authorDropdownMenu.contains(event.target)) {
			authorDropdownMenu.classList.add('hidden');
		}
	});
	
	// New Series Modal Logic
	newSeriesBtn.addEventListener('click', () => newSeriesModal.classList.remove('hidden'));
	newSeriesModal.querySelectorAll('.js-close-modal').forEach(btn => {
		btn.addEventListener('click', () => newSeriesModal.classList.add('hidden'));
	});
	
	saveNewSeriesBtn.addEventListener('click', async () => {
		const title = newSeriesTitleInput.value.trim();
		if (!title) {
			newSeriesError.textContent = 'Series title cannot be empty.';
			newSeriesError.classList.remove('hidden');
			return;
		}
		newSeriesError.classList.add('hidden');
		
		const originalText = saveNewSeriesBtn.innerHTML;
		saveNewSeriesBtn.disabled = true;
		saveNewSeriesBtn.innerHTML = '<div class="w-5 h-5 mx-auto border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
		
		try {
			const newSeries = await window.api.createSeries({ title });
			seriesSelect.add(new Option(newSeries.title, newSeries.id, true, true));
			newSeriesTitleInput.value = '';
			newSeriesModal.classList.add('hidden');
		} catch (error) {
			console.error('Failed to create series:', error);
			newSeriesError.textContent = error.message;
			newSeriesError.classList.remove('hidden');
		} finally {
			saveNewSeriesBtn.disabled = false;
			saveNewSeriesBtn.innerHTML = originalText;
		}
	});
	
	// Main Form Submission
	createNovelForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitBtn = document.getElementById('create-novel-submit-btn');
		const originalText = submitBtn.innerHTML;
		submitBtn.disabled = true;
		submitBtn.innerHTML = '<div class="w-5 h-5 mx-auto border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
		
		const formData = new FormData(createNovelForm);
		const data = Object.fromEntries(formData.entries());
		
		try {
			await window.api.createNovel(data);
			window.location.href = 'index.html';
		} catch (error) {
			console.error('Failed to create novel:', error);
			alert('Error: Could not create the novel. ' + error.message);
			submitBtn.disabled = false;
			submitBtn.innerHTML = originalText;
		}
	});
	
	// --- Initial Page Load ---
	loadSeries();
	loadAuthors();
});

document.addEventListener('DOMContentLoaded', () => {
	const form = document.getElementById('generate-structure-form');
	const novelIdInput = document.getElementById('novelId');
	const structureSelect = document.getElementById('book_structure');
	const generateBtn = document.getElementById('generate-btn');
	const errorContainer = document.getElementById('error-message');
	const errorText = document.getElementById('error-text');
	
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
	
	// 1. Get Novel ID from URL and populate hidden input
	const params = new URLSearchParams(window.location.search);
	const novelId = params.get('novelId');
	if (!novelId) {
		document.body.innerHTML = '<p class="text-error p-8">Error: No novel ID provided.</p>';
		return;
	}
	novelIdInput.value = novelId;
	
	// 2. Load structure files into the dropdown
	async function loadStructures() {
		try {
			const files = await window.api.getStructureFiles();
			structureSelect.innerHTML = ''; // Clear loading message
			if (files.length === 0) {
				structureSelect.add(new Option('No structures found', '', true, true));
				structureSelect.disabled = true;
			} else {
				files.forEach(file => {
					structureSelect.add(new Option(file.name, file.value));
				});
			}
		} catch (error) {
			console.error('Failed to load structure files:', error);
			structureSelect.innerHTML = '<option>Error loading</option>';
			structureSelect.disabled = true;
		}
	}
	
	// 3. Handle form submission
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		
		setButtonLoading(generateBtn, true);
		errorContainer.classList.add('hidden');
		
		const formData = new FormData(form);
		const data = Object.fromEntries(formData.entries());
		
		try {
			const result = await window.api.generateStructure(data);
			if (result.success) {
				window.api.openEditor(novelId);
			} else {
				throw new Error('The generation process failed without a specific error.');
			}
		} catch (error) {
			console.error('Structure generation failed:', error);
			errorText.textContent = error.message;
			errorContainer.classList.remove('hidden');
			
			setButtonLoading(generateBtn, false);
		}
	});
	
	// Initial load
	loadStructures();
});

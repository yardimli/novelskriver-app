document.addEventListener('DOMContentLoaded', () => {
	const novelList = document.getElementById('novel-list');
	const loadingMessage = document.getElementById('loading-message');
	
	async function loadNovels() {
		try {
			// MODIFIED: Fetch novels with their cover images.
			const novels = await window.api.getNovelsWithCovers();
			loadingMessage.remove();
			
			if (novels.length === 0) {
				novelList.innerHTML = '<p class="text-gray-500 col-span-full text-center">You haven\'t created any novels yet.</p>';
				return;
			}
			
			novelList.innerHTML = ''; // Clear previous content
			novels.forEach(novel => {
				const novelCard = document.createElement('div');
				novelCard.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-xl transition-shadow';
				novelCard.dataset.novelId = novel.id; // Add data-id for easy selection
				
				// MODIFIED: Display cover image if it exists.
				const coverHtml = novel.cover_path
					? `<img src="file://${novel.cover_path}" alt="Cover for ${novel.title}" class="w-full h-48 object-cover">`
					: `<div class="bg-gray-300 dark:bg-gray-700 h-48 flex items-center justify-center"><span class="text-gray-500">No Cover</span></div>`;
				
				novelCard.innerHTML = `
          ${coverHtml}
          <div class="p-4">
            <h3 class="font-bold text-lg truncate">${novel.title}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">${novel.author || 'Unknown Author'}</p>
          </div>
        `;
				novelCard.addEventListener('click', () => {
					window.api.openEditor(novel.id);
				});
				novelList.appendChild(novelCard);
			});
		} catch (error) {
			console.error('Failed to load novels:', error);
			loadingMessage.textContent = 'Error loading novels.';
		}
	}
	
	// NEW: Listen for cover update events from the main process.
	window.api.onCoverUpdated((event, { novelId, imagePath }) => {
		const card = novelList.querySelector(`[data-novel-id='${novelId}']`);
		if (card) {
			const imgContainer = card.querySelector('img, div'); // Selects either the img or the placeholder div
			const newImg = document.createElement('img');
			newImg.src = `file://${imagePath}`;
			newImg.alt = `Cover for novel ${novelId}`;
			newImg.className = 'w-full h-48 object-cover';
			imgContainer.replaceWith(newImg);
		}
	});
	
	
	loadNovels();
});

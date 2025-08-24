document.addEventListener('DOMContentLoaded', () => {
	const novelList = document.getElementById('novel-list');
	const loadingMessage = document.getElementById('loading-message');
	
	async function loadNovels() {
		try {
			const novels = await window.api.getNovelsWithCovers();
			loadingMessage.remove();
			
			if (novels.length === 0) {
				novelList.innerHTML = '<p class="text-base-content/70 col-span-full text-center">You haven\'t created any novels yet.</p>';
				return;
			}
			
			novelList.innerHTML = ''; // Clear previous content
			novels.forEach(novel => {
				// MODIFIED: Using DaisyUI card component classes
				const novelCard = document.createElement('div');
				novelCard.className = 'card card-compact bg-base-200 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow image-full before:!bg-black/30';
				novelCard.dataset.novelId = novel.id;
				
				const coverHtml = novel.cover_path
					? `<img src="file://${novel.cover_path}" alt="Cover for ${novel.title}" class="w-full h-56 object-cover">`
					: `<div class="bg-base-300 h-56 flex items-center justify-center"><span class="text-base-content/50">No Cover</span></div>`;
				
				novelCard.innerHTML = `
          <figure>${coverHtml}</figure>
          <div class="card-body justify-end">
            <h2 class="card-title text-white">${novel.title}</h2>
            <p class="text-white/80">${novel.author || 'Unknown Author'}</p>
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
	
	window.api.onCoverUpdated((event, { novelId, imagePath }) => {
		const card = novelList.querySelector(`[data-novel-id='${novelId}']`);
		if (card) {
			// MODIFIED: Update card to show the new image
			const figure = card.querySelector('figure');
			if (figure) {
				figure.innerHTML = `<img src="file://${imagePath}" alt="Cover for novel ${novelId}" class="w-full h-56 object-cover">`;
			}
			// Ensure the card has the image-full class if it didn't before
			card.classList.add('image-full', 'before:!bg-black/30');
		}
	});
	
	
	loadNovels();
});

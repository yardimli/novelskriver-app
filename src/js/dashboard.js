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
				const novelCard = document.createElement('div');
				// MODIFIED: Card is no longer a single clickable element to accommodate multiple buttons.
				novelCard.className = 'card card-compact bg-base-200 shadow-xl transition-shadow';
				novelCard.dataset.novelId = novel.id;
				
				const coverHtml = novel.cover_path
					? `<img src="file://${novel.cover_path}" alt="Cover for ${novel.title}" class="w-full h-56 object-cover">`
					: `<div class="bg-base-300 h-56 flex items-center justify-center"><span class="text-base-content/50">No Cover</span></div>`;
				
				// NEW: Conditional button for AI generation.
				const actionButtonHtml = novel.chapter_count > 0
					? `<button class="btn btn-primary js-open-editor">Open Editor</button>`
					: `<a href="generate-structure.html?novelId=${novel.id}" class="btn btn-accent js-fill-ai">
                         <i class="bi bi-stars"></i> Fill with AI
                       </a>`;
				
				// MODIFIED: Updated card structure with separate body and actions.
				novelCard.innerHTML = `
                    <figure class="cursor-pointer js-open-editor">${coverHtml}</figure>
                    <div class="card-body">
                        <h2 class="card-title">${novel.title}</h2>
                        <p class="text-base-content/80">${novel.author || 'Unknown Author'}</p>
                        <div class="card-actions justify-end mt-2">
                            ${actionButtonHtml}
                        </div>
                    </div>
                `;
				
				// MODIFIED: Add event listener to elements that should open the editor.
				novelCard.querySelectorAll('.js-open-editor').forEach(el => {
					el.addEventListener('click', () => {
						window.api.openEditor(novel.id);
					});
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
			const figure = card.querySelector('figure');
			if (figure) {
				figure.innerHTML = `<img src="file://${imagePath}" alt="Cover for novel ${novelId}" class="w-full h-56 object-cover">`;
			}
		}
	});
	
	loadNovels();
});

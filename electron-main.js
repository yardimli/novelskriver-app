const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fetch = require('node-fetch');
const fs = require('fs');

require('dotenv').config();

const { initializeDatabase } = require('./src/database/database.js');
const aiService = require('./src/ai/ai.js');
const imageHandler = require('./src/utils/image-handler.js');

let db;
let mainWindow;
let editorWindows = new Map();

// --- NEW: Template and HTML Helper Functions ---

/**
 * Reads an HTML template file from the public/templates directory.
 * @param {string} templateName - The name of the template file (without extension).
 * @returns {string} The content of the template file.
 */
function getTemplate(templateName) {
	const templatePath = path.join(__dirname, 'public', 'templates', `${templateName}.html`);
	try {
		return fs.readFileSync(templatePath, 'utf8');
	} catch (error) {
		console.error(`Failed to read template: ${templateName}`, error);
		return `<p class="text-error">Error: Could not load template ${templateName}.</p>`;
	}
}

/**
 * Sanitizes text to be safely included in HTML attributes.
 * @param {string | null} text
 * @returns {string}
 */
function escapeAttr(text) {
	if (text === null || typeof text === 'undefined') return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}


// --- Window Creation Functions ---

/**
 * Creates the main application window (Dashboard).
 */
function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 1000,
		icon: path.join(__dirname, 'assets/icon.png'),
		title: 'Novel Skriver',
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	
	mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data:;"]
			}
		});
	});
	
	mainWindow.loadFile('public/index.html');
	
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
	
	mainWindow.webContents.openDevTools();
	
}

/**
 * Creates a new novel editor window for a given novel.
 * @param {number} novelId - The ID of the novel to load.
 */
function createEditorWindow(novelId) {
	if (editorWindows.has(novelId)) {
		const existingWin = editorWindows.get(novelId);
		if (existingWin) {
			existingWin.focus();
			return;
		}
	}
	
	const editorWindow = new BrowserWindow({
		width: 1600,
		height: 900,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	
	editorWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data:;"]
			}
		});
	});
	
	editorWindow.loadFile('public/novel-editor.html', { query: { novelId: novelId } });
	editorWindows.set(novelId, editorWindow);
	
	editorWindow.on('closed', () => {
		editorWindows.delete(novelId);
	});
	
	editorWindow.webContents.openDevTools();
	
}


/**
 * Wraps all IPC handler registrations in a single function.
 */
function setupIpcHandlers() {
	// --- Novel Handlers ---
	
	ipcMain.handle('novels:getAllWithCovers', () => {
		// MODIFIED: The `n.*` in the query now automatically includes the new prose setting columns.
		const stmt = db.prepare(`
            SELECT
                n.*,
                i.image_local_path as cover_path,
                (SELECT COUNT(id) FROM chapters WHERE novel_id = n.id) as chapter_count
            FROM novels n
            LEFT JOIN (
                SELECT novel_id, image_local_path, ROW_NUMBER() OVER(PARTITION BY novel_id ORDER BY created_at DESC) as rn
                FROM images
            ) i ON n.id = i.novel_id AND i.rn = 1
            ORDER BY n.created_at DESC
        `);
		const novels = stmt.all();
		
		novels.forEach(novel => {
			if (novel.cover_path) {
				novel.cover_path = path.join(imageHandler.IMAGES_DIR, novel.cover_path);
			}
		});
		return novels;
	});
	
	ipcMain.handle('novels:getOne', (event, novelId) => {
		const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
		if (!novel) return null;
		
		novel.sections = db.prepare('SELECT * FROM sections WHERE novel_id = ? ORDER BY section_order').all(novelId);
		novel.sections.forEach(section => {
			section.chapters = db.prepare('SELECT * FROM chapters WHERE section_id = ? ORDER BY `chapter_order`').all(section.id);
		});
		
		novel.codexCategories = db.prepare(`
            SELECT cc.*, COUNT(ce.id) as entries_count FROM codex_categories cc
            LEFT JOIN codex_entries ce ON ce.codex_category_id = cc.id
            WHERE cc.novel_id = ? GROUP BY cc.id ORDER BY cc.name
        `).all(novelId);
		
		novel.codexCategories.forEach(category => {
			category.entries = db.prepare(`
                SELECT ce.*, i.thumbnail_local_path
                FROM codex_entries ce
                LEFT JOIN images i ON i.codex_entry_id = ce.id
                WHERE ce.codex_category_id = ? ORDER BY ce.title
            `).all(category.id);
			
			category.entries.forEach(entry => {
				entry.thumbnail_url = entry.thumbnail_local_path
					? `file://${path.join(imageHandler.IMAGES_DIR, entry.thumbnail_local_path)}`
					: './assets/codex-placeholder.png';
			});
		});
		
		if (novel.editor_state) {
			try {
				novel.editor_state = JSON.parse(novel.editor_state);
			} catch (e) {
				console.error('Failed to parse editor state for novel:', novelId);
				novel.editor_state = null;
			}
		}
		return novel;
	});
	
	ipcMain.handle('novels:store', async (event, data) => {
		const userId = 1;
		const stmt = db.prepare(`
            INSERT INTO novels (user_id, title, author, status, series_id, order_in_series)
            VALUES (?, ?, ?, 'draft', ?, ?)
        `);
		const result = stmt.run(userId, data.title, data.author, data.series_id || null, data.series_index || null);
		const novelId = result.lastInsertRowid;
		
		(async () => {
			try {
				const imagePrompt = await aiService.generateCoverPrompt(data.title);
				if (imagePrompt) {
					const imageUrl = await aiService.generateFalImage(imagePrompt);
					if (imageUrl) {
						const localPath = await imageHandler.storeImageFromUrl(imageUrl, novelId, 'cover');
						if (localPath) {
							db.prepare(`
                                INSERT INTO images (user_id, novel_id, image_local_path, remote_url, prompt, image_type)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `).run(userId, novelId, localPath, imageUrl, imagePrompt, 'generated');
							
							const absolutePath = path.join(imageHandler.IMAGES_DIR, localPath);
							if (mainWindow) {
								mainWindow.webContents.send('novels:cover-updated', { novelId, imagePath: absolutePath });
							}
						}
					}
				}
			} catch (e) {
				console.error('An error occurred during background cover generation:', e);
			}
		})();
		
		return { id: novelId, ...data };
	});
	
	// NEW: IPC handler to update prose settings for a specific novel.
	ipcMain.handle('novels:updateProseSettings', (event, { novelId, prose_tense, prose_language, prose_pov }) => {
		try {
			db.prepare(`
                UPDATE novels
                SET prose_tense = ?, prose_language = ?, prose_pov = ?
                WHERE id = ?
            `).run(prose_tense, prose_language, prose_pov, novelId);
			return { success: true };
		} catch (error) {
			console.error('Failed to update prose settings:', error);
			throw new Error('Failed to update prose settings.');
		}
	});
	
	ipcMain.on('novels:openEditor', (event, novelId) => {
		createEditorWindow(novelId);
	});
	
	ipcMain.handle('novels:generateTitle', async () => {
		const apiKey = process.env.OPEN_ROUTER_API_KEY;
		const modelId = process.env.OPEN_ROUTER_MODEL || 'openai/gpt-4o-mini';
		if (!apiKey) throw new Error('OpenRouter API key is not configured in .env file.');
		const prompt = `Generate a single, funny, compelling, and unique novel title of 3 words. Do not provide any explanation or surrounding text. Think about the random number ${Math.floor(Math.random() * 1000) + 1} for inspiration but dont mention the number in the title. Provide the response as a JSON object with a single key "title". Example: {"title": "The Last Donut"}`;
		try {
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: modelId,
					messages: [{ role: 'user', content: prompt }],
					response_format: { type: 'json_object' },
					temperature: 0.9,
				})
			});
			if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
			const data = await response.json();
			const parsed = JSON.parse(data.choices[0].message.content);
			if (parsed.title) return { title: parsed.title.trim().replace(/"/g, '') };
			throw new Error('Invalid response format from AI.');
		} catch (error) {
			console.error('Failed to generate novel title:', error);
			throw error;
		}
	});
	
	ipcMain.handle('novels:generateStructure', async (event, data) => {
		const { novelId, book_about, book_structure, language, llm_model } = data;
		
		const novel = db.prepare('SELECT id, title FROM novels WHERE id = ?').get(novelId);
		if (!novel) {
			throw new Error('Novel not found.');
		}
		const chapterCount = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE novel_id = ?').get(novelId).count;
		if (chapterCount > 0) {
			throw new Error('This novel already has chapters and cannot be auto-filled.');
		}
		
		const structurePath = path.join(__dirname, 'structures', book_structure);
		if (!fs.existsSync(structurePath)) {
			throw new Error('Selected structure file not found.');
		}
		const structureContent = fs.readFileSync(structurePath, 'utf8');
		
		const outlineResponse = await aiService.generateNovelOutline({
			title: novel.title,
			about: book_about,
			structure: structureContent,
			language: language,
			model: llm_model,
		});
		if (!outlineResponse || !outlineResponse.sections) {
			throw new Error('Failed to generate a valid novel structure from the LLM.');
		}
		
		const codexResponse = await aiService.generateNovelCodex({
			outlineJson: JSON.stringify(outlineResponse),
			language: language,
			model: llm_model,
		});
		
		const runTransaction = db.transaction(() => {
			db.prepare('UPDATE novels SET genre = ?, logline = ?, synopsis = ? WHERE id = ?')
				.run(outlineResponse.genre || null, outlineResponse.logline || null, outlineResponse.synopsis || null, novelId);
			
			let sectionOrder = 1;
			for (const sectionData of outlineResponse.sections) {
				const sectionResult = db.prepare('INSERT INTO sections (novel_id, title, description, section_order) VALUES (?, ?, ?, ?)')
					.run(novelId, sectionData.title, sectionData.description || null, sectionOrder++);
				const sectionId = sectionResult.lastInsertRowid;
				
				let chapterOrder = 1;
				for (const chapterData of sectionData.chapters) {
					db.prepare('INSERT INTO chapters (novel_id, section_id, title, summary, status, chapter_order) VALUES (?, ?, ?, ?, ?, ?)')
						.run(novelId, sectionId, chapterData.title, chapterData.summary || null, 'in_progress', chapterOrder++);
				}
			}
			
			if (codexResponse) {
				if (codexResponse.characters && codexResponse.characters.length > 0) {
					let charCategory = db.prepare('SELECT id FROM codex_categories WHERE novel_id = ? AND name = ?').get(novelId, 'Characters');
					if (!charCategory) {
						const result = db.prepare('INSERT INTO codex_categories (novel_id, name, description) VALUES (?, ?, ?)')
							.run(novelId, 'Characters', 'All major and minor characters in the story.');
						charCategory = { id: result.lastInsertRowid };
					}
					for (const charData of codexResponse.characters) {
						db.prepare('INSERT INTO codex_entries (novel_id, codex_category_id, title, description, content) VALUES (?, ?, ?, ?, ?)')
							.run(novelId, charCategory.id, charData.name, charData.description || null, charData.content || null);
					}
				}
				if (codexResponse.locations && codexResponse.locations.length > 0) {
					let locCategory = db.prepare('SELECT id FROM codex_categories WHERE novel_id = ? AND name = ?').get(novelId, 'Locations');
					if (!locCategory) {
						const result = db.prepare('INSERT INTO codex_categories (novel_id, name, description) VALUES (?, ?, ?)')
							.run(novelId, 'Locations', 'Key settings and places in the story.');
						locCategory = { id: result.lastInsertRowid };
					}
					for (const locData of codexResponse.locations) {
						db.prepare('INSERT INTO codex_entries (novel_id, codex_category_id, title, description, content) VALUES (?, ?, ?, ?, ?)')
							.run(novelId, locCategory.id, locData.name, locData.description || null, locData.content || null);
					}
				}
			}
		});
		
		runTransaction();
		return { success: true };
	});
	
	// --- File System Handlers ---
	ipcMain.handle('files:getStructureFiles', () => {
		try {
			const structuresDir = path.join(__dirname, 'structures');
			const files = fs.readdirSync(structuresDir);
			return files
				.filter(file => file.endsWith('.txt'))
				.map(file => {
					const name = path.basename(file, '.txt')
						.replace(/-/g, ' ')
						.replace(/\b\w/g, l => l.toUpperCase());
					return { name: name, value: file };
				});
		} catch (error) {
			console.error('Could not read structure files:', error);
			return [];
		}
	});
	
	// --- Author Handlers ---
	ipcMain.handle('authors:getDistinct', () => {
		const stmt = db.prepare('SELECT DISTINCT author FROM novels WHERE author IS NOT NULL ORDER BY author ASC');
		return stmt.all().map(row => row.author);
	});
	
	// --- Series Handlers ---
	ipcMain.handle('series:getAll', () => {
		return db.prepare('SELECT * FROM series ORDER BY title ASC').all();
	});
	
	ipcMain.handle('series:store', (event, data) => {
		const userId = 1;
		const existing = db.prepare('SELECT id FROM series WHERE title = ? AND user_id = ?').get(data.title, userId);
		if (existing) {
			throw new Error('A series with this title already exists.');
		}
		const stmt = db.prepare('INSERT INTO series (user_id, title) VALUES (?, ?)');
		const result = stmt.run(userId, data.title);
		return { id: result.lastInsertRowid, title: data.title };
	});
	
	// --- Editor IPC Handlers ---
	
	ipcMain.handle('templates:get', (event, templateName) => {
		return getTemplate(templateName);
	});
	
	ipcMain.handle('editor:saveState', (event, novelId, state) => {
		try {
			const jsonState = JSON.stringify(state);
			db.prepare('UPDATE novels SET editor_state = ? WHERE id = ?').run(jsonState, novelId);
			return { success: true };
		} catch (error) {
			console.error('Failed to save editor state:', error);
			throw error;
		}
	});
	
	ipcMain.handle('chapters:getOneHtml', (event, chapterId) => {
		const chapter = db.prepare(`
        SELECT
            c.*,
            s.title as section_title,
            s.section_order as section_order
        FROM
            chapters c
        LEFT JOIN
            sections s ON c.section_id = s.id
        WHERE
            c.id = ?
    `).get(chapterId);
		
		if (!chapter) throw new Error('Chapter not found');
		
		chapter.codexEntries = db.prepare(`
        SELECT ce.*, i.thumbnail_local_path
        FROM codex_entries ce
        JOIN chapter_codex_entry cce ON ce.id = cce.codex_entry_id
        LEFT JOIN images i ON ce.id = i.codex_entry_id
        WHERE cce.chapter_id = ?
        ORDER BY ce.title
    `).all(chapterId);
		
		chapter.codexEntries.forEach(entry => {
			entry.thumbnail_url = entry.thumbnail_local_path
				? `file://${path.join(imageHandler.IMAGES_DIR, entry.thumbnail_local_path)}`
				: './assets/codex-placeholder.png';
		});
		
		const chapterCodexTagTemplate = getTemplate('chapter-codex-tag');
		
		const codexTagsHtml = chapter.codexEntries.map(entry => {
			return chapterCodexTagTemplate
				.replace(/{{ENTRY_ID}}/g, entry.id)
				.replace(/{{ENTRY_TITLE}}/g, escapeAttr(entry.title))
				.replace(/{{THUMBNAIL_URL}}/g, escapeAttr(entry.thumbnail_url))
				.replace(/{{CHAPTER_ID}}/g, chapter.id);
		}).join('');
		
		const sectionInfoHtml = chapter.section_order ? `<h3 class="text-sm font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Act ${chapter.section_order}: ${escapeAttr(chapter.section_title)} &ndash; Chapter ${chapter.chapter_order}</h3>` : '';
		
		let template = getTemplate('chapter-window');
		template = template.replace('{{CHAPTER_ID}}', chapter.id);
		template = template.replace('{{SECTION_INFO_HTML}}', sectionInfoHtml);
		template = template.replace('{{CHAPTER_TITLE_ATTR}}', escapeAttr(chapter.title));
		template = template.replace('{{CHAPTER_SUMMARY_HTML}}', chapter.summary || '');
		template = template.replace('{{CONTENT_HTML}}', chapter.content || '');
		template = template.replace('{{TAGS_WRAPPER_HIDDEN}}', chapter.codexEntries.length === 0 ? 'hidden' : '');
		template = template.replace('{{CODEX_TAGS_HTML}}', codexTagsHtml);
		
		return template;
	});
	
	ipcMain.handle('chapters:updateContent', (event, chapterId, data) => {
		try {
			db.prepare('UPDATE chapters SET title = ?, summary = ?, content = ? WHERE id = ?')
				.run(data.title, data.summary, data.content, chapterId);
			return { success: true, message: 'Chapter content updated.' };
		} catch (error) {
			console.error(`Failed to update chapter ${chapterId}:`, error);
			return { success: false, message: 'Failed to save chapter content.' };
		}
	});
	
	ipcMain.handle('codex-entries:getOneHtml', (event, entryId) => {
		const codexEntry = db.prepare('SELECT * FROM codex_entries WHERE id = ?').get(entryId);
		if (!codexEntry) throw new Error('Codex Entry not found');
		
		const image = db.prepare('SELECT * FROM images WHERE codex_entry_id = ?').get(entryId);
		codexEntry.image_url = image
			? `file://${path.join(imageHandler.IMAGES_DIR, image.image_local_path)}`
			: './assets/codex-placeholder.png';
		
		codexEntry.linkedEntries = db.prepare(`
            SELECT ce.*, i.thumbnail_local_path
            FROM codex_entries ce
            JOIN codex_entry_links cel ON ce.id = cel.linked_codex_entry_id
            LEFT JOIN images i ON ce.id = i.codex_entry_id
            WHERE cel.codex_entry_id = ?
            ORDER BY ce.title
        `).all(entryId);
		
		codexEntry.linkedEntries.forEach(entry => {
			entry.thumbnail_url = entry.thumbnail_local_path
				? `file://${path.join(imageHandler.IMAGES_DIR, entry.thumbnail_local_path)}`
				: './assets/codex-placeholder.png';
		});
		
		const codexLinkTagTemplate = getTemplate('codex-link-tag');
		
		const linkedTagsHtml = codexEntry.linkedEntries.map(entry => {
			return codexLinkTagTemplate
				.replace(/{{ENTRY_ID}}/g, entry.id)
				.replace(/{{ENTRY_TITLE}}/g, escapeAttr(entry.title))
				.replace(/{{THUMBNAIL_URL}}/g, escapeAttr(entry.thumbnail_url))
				.replace(/{{PARENT_ENTRY_ID}}/g, codexEntry.id);
		}).join('');
		
		let template = getTemplate('codex-entry-window');
		template = template.replace(/{{ENTRY_ID}}/g, codexEntry.id);
		template = template.replace(/{{ENTRY_TITLE_ATTR}}/g, escapeAttr(codexEntry.title));
		template = template.replace('{{IMAGE_URL}}', escapeAttr(codexEntry.image_url));
		template = template.replace('{{DESCRIPTION_HTML}}', codexEntry.description || '');
		template = template.replace('{{CONTENT_HTML}}', codexEntry.content || '');
		template = template.replace('{{LINKED_TAGS_WRAPPER_HIDDEN}}', codexEntry.linkedEntries.length === 0 ? 'hidden' : '');
		template = template.replace('{{LINKED_TAGS_HTML}}', linkedTagsHtml);
		
		return template;
	});
	
	ipcMain.handle('chapters:codex:attach', (event, chapterId, codexEntryId) => {
		db.prepare('INSERT OR IGNORE INTO chapter_codex_entry (chapter_id, codex_entry_id) VALUES (?, ?)')
			.run(chapterId, codexEntryId);
		
		const codexEntry = db.prepare('SELECT ce.*, i.thumbnail_local_path FROM codex_entries ce LEFT JOIN images i ON ce.id = i.codex_entry_id WHERE ce.id = ?')
			.get(codexEntryId);
		
		codexEntry.thumbnail_url = codexEntry.thumbnail_local_path
			? `file://${path.join(imageHandler.IMAGES_DIR, codexEntry.thumbnail_local_path)}`
			: './assets/codex-placeholder.png';
		
		return {
			success: true,
			message: 'Codex entry linked successfully.',
			codexEntry: {
				id: codexEntry.id,
				title: codexEntry.title,
				thumbnail_url: codexEntry.thumbnail_url,
			}
		};
	});
	
	ipcMain.handle('chapters:codex:detach', (event, chapterId, codexEntryId) => {
		db.prepare('DELETE FROM chapter_codex_entry WHERE chapter_id = ? AND codex_entry_id = ?')
			.run(chapterId, codexEntryId);
		return { success: true, message: 'Codex entry unlinked.' };
	});
	
	ipcMain.handle('codex-entries:store', async (event, novelId, formData) => {
		const { title, description, content, codex_category_id, new_category_name, imagePath } = formData;
		const userId = 1;
		let categoryId = codex_category_id;
		let newCategoryData = null;
		
		const runTransaction = db.transaction(() => {
			if (new_category_name) {
				const result = db.prepare('INSERT INTO codex_categories (novel_id, name) VALUES (?, ?)')
					.run(novelId, new_category_name);
				categoryId = result.lastInsertRowid;
				newCategoryData = { id: categoryId, name: new_category_name };
			}
			
			const entryResult = db.prepare('INSERT INTO codex_entries (novel_id, codex_category_id, title, description, content) VALUES (?, ?, ?, ?, ?)')
				.run(novelId, categoryId, title, description, content);
			const entryId = entryResult.lastInsertRowid;
			
			if (imagePath) {
				const paths = imageHandler.storeImageFromPath(imagePath, novelId, entryId, 'codex-image-upload')._settledValue;
				db.prepare('INSERT INTO images (user_id, novel_id, codex_entry_id, image_local_path, thumbnail_local_path, image_type) VALUES (?, ?, ?, ?, ?, ?)')
					.run(userId, novelId, entryId, paths.original_path, paths.thumbnail_path, 'upload');
			}
			
			const newEntry = db.prepare('SELECT ce.*, i.thumbnail_local_path FROM codex_entries ce LEFT JOIN images i ON ce.id = i.codex_entry_id WHERE ce.id = ?')
				.get(entryId);
			
			return {
				success: true,
				message: 'Codex entry created successfully.',
				codexEntry: {
					id: newEntry.id,
					title: newEntry.title,
					description: newEntry.description,
					thumbnail_url: newEntry.thumbnail_local_path
						? `file://${path.join(imageHandler.IMAGES_DIR, newEntry.thumbnail_local_path)}`
						: './assets/codex-placeholder.png',
					category_id: newEntry.codex_category_id,
				},
				newCategory: newCategoryData,
			};
		});
		
		return runTransaction();
	});
	
	ipcMain.handle('codex-entries:update', (event, entryId, data) => {
		db.prepare('UPDATE codex_entries SET title = ?, description = ?, content = ? WHERE id = ?')
			.run(data.title, data.description, data.content, entryId);
		return { success: true, message: 'Codex entry updated successfully.' };
	});
	
	ipcMain.handle('codex-entries:link:attach', (event, parentEntryId, linkedEntryId) => {
		db.prepare('INSERT OR IGNORE INTO codex_entry_links (codex_entry_id, linked_codex_entry_id) VALUES (?, ?)')
			.run(parentEntryId, linkedEntryId);
		
		const linkedEntry = db.prepare('SELECT ce.*, i.thumbnail_local_path FROM codex_entries ce LEFT JOIN images i ON ce.id = i.codex_entry_id WHERE ce.id = ?')
			.get(linkedEntryId);
		
		linkedEntry.thumbnail_url = linkedEntry.thumbnail_local_path
			? `file://${path.join(imageHandler.IMAGES_DIR, linkedEntry.thumbnail_local_path)}`
			: './assets/codex-placeholder.png';
		
		return {
			success: true,
			message: 'Codex entry linked successfully.',
			codexEntry: {
				id: linkedEntry.id,
				title: linkedEntry.title,
				thumbnail_url: linkedEntry.thumbnail_url,
			}
		};
	});
	
	ipcMain.handle('codex-entries:link:detach', (event, parentEntryId, linkedEntryId) => {
		db.prepare('DELETE FROM codex_entry_links WHERE codex_entry_id = ? AND linked_codex_entry_id = ?')
			.run(parentEntryId, linkedEntryId);
		return { success: true, message: 'Codex entry unlinked.' };
	});
	
	ipcMain.on('codex-entries:process-text-stream', (event, { data, channel }) => {
		const onChunk = (chunk) => {
			if (event.sender.isDestroyed()) return;
			event.sender.send(channel, { chunk });
		};
		
		const onComplete = () => {
			if (event.sender.isDestroyed()) return;
			event.sender.send(channel, { done: true });
		};
		
		const onError = (error) => {
			console.error('Streaming AI Error:', error);
			if (event.sender.isDestroyed()) return;
			event.sender.send(channel, { error: error.message });
		};
		
		aiService.streamProcessCodexText(data, onChunk)
			.then(onComplete)
			.catch(onError);
	});
	
	ipcMain.handle('ai:getModels', async () => {
		try {
			const modelsData = await aiService.getOpenRouterModels();
			const processedModels = aiService.processModelsForView(modelsData);
			return { success: true, models: processedModels };
		} catch (error) {
			console.error('Failed to get or process AI models:', error);
			return { success: false, message: error.message };
		}
	});
	
	ipcMain.handle('codex-entries:generate-image', async (event, entryId, prompt) => {
		const entry = db.prepare('SELECT novel_id FROM codex_entries WHERE id = ?').get(entryId);
		const imageUrl = await aiService.generateFalImage(prompt, 'square_hd');
		if (!imageUrl) throw new Error('Failed to get image URL from AI service.');
		
		const paths = await imageHandler.storeImageFromUrl(imageUrl, entry.novel_id, `codex-image-${entryId}`);
		
		const oldImage = db.prepare('SELECT * FROM images WHERE codex_entry_id = ?').get(entryId);
		if (oldImage) {
			const oldPath = path.join(imageHandler.IMAGES_DIR, oldImage.image_local_path);
			if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
			db.prepare('DELETE FROM images WHERE id = ?').run(oldImage.id);
		}
		
		db.prepare('INSERT INTO images (user_id, novel_id, codex_entry_id, image_local_path, thumbnail_local_path, remote_url, prompt, image_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
			.run(1, entry.novel_id, entryId, paths, paths, imageUrl, prompt, 'generated');
		
		return {
			success: true,
			message: 'Image generated successfully!',
			image_url: `file://${path.join(imageHandler.IMAGES_DIR, paths)}?t=${Date.now()}`
		};
	});
	
	ipcMain.handle('codex-entries:upload-image', async (event, entryId, filePath) => {
		const entry = db.prepare('SELECT novel_id FROM codex_entries WHERE id = ?').get(entryId);
		const paths = await imageHandler.storeImageFromPath(filePath, entry.novel_id, entryId, 'codex-image-upload');
		
		const oldImage = db.prepare('SELECT * FROM images WHERE codex_entry_id = ?').get(entryId);
		if (oldImage) {
			const oldPath = path.join(imageHandler.IMAGES_DIR, oldImage.image_local_path);
			if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
			db.prepare('DELETE FROM images WHERE id = ?').run(oldImage.id);
		}
		
		db.prepare('INSERT INTO images (user_id, novel_id, codex_entry_id, image_local_path, thumbnail_local_path, image_type) VALUES (?, ?, ?, ?, ?, ?)')
			.run(1, entry.novel_id, entryId, paths.original_path, paths.thumbnail_path, 'upload');
		
		return {
			success: true,
			message: 'Image uploaded successfully!',
			image_url: `file://${path.join(imageHandler.IMAGES_DIR, paths.original_path)}?t=${Date.now()}`
		};
	});
	
	ipcMain.handle('dialog:showOpenImage', async () => {
		const { canceled, filePaths } = await dialog.showOpenDialog({
			properties: ['openFile'],
			filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
		});
		if (!canceled) {
			return filePaths[0];
		}
		return null;
	});
}

// --- App Lifecycle Events ---
app.on('ready', () => {
	db = initializeDatabase();
	setupIpcHandlers();
	createMainWindow();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createMainWindow();
	}
});

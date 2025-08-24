const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const fetch = require('node-fetch');
const fs = require('fs'); // NEW: Import fs module

// Load environment variables from .env file
require('dotenv').config();

// Import the initialization function, not the db instance directly.
const { initializeDatabase } = require('./src/database/database.js');
const aiService = require('./src/ai/ai.js');
const imageHandler = require('./src/utils/image-handler.js');

let db;
let mainWindow;
let editorWindows = new Map();

// --- Window Creation Functions ---
// ... (createMainWindow and createEditorWindow functions remain unchanged) ...

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
	
	// Add a Content Security Policy to allow loading local file images.
	mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file:;"]
			}
		});
	});
	
	mainWindow.loadFile('public/index.html');
	
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
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
	
	editorWindow.loadFile('public/novel-editor.html', { query: { novelId: novelId } });
	editorWindows.set(novelId, editorWindow);
	
	editorWindow.on('closed', () => {
		editorWindows.delete(novelId);
	});
}


/**
 * Wraps all IPC handler registrations in a single function.
 * This ensures they are only set up AFTER the database is ready.
 */
function setupIpcHandlers() {
	// --- Novel Handlers ---
	
	ipcMain.handle('novels:getAllWithCovers', () => {
		// MODIFIED: Also retrieve chapter count to determine if the AI button should show.
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
	
	// ... (novels:getOne handler remains unchanged) ...
	ipcMain.handle('novels:getOne', (event, novelId) => {
		const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
		if (!novel) return null;
		novel.sections = db.prepare('SELECT * FROM sections WHERE novel_id = ? ORDER BY `order`').all(novelId);
		novel.sections.forEach(section => {
			section.chapters = db.prepare('SELECT * FROM chapters WHERE section_id = ? ORDER BY `order`').all(section.id);
		});
		novel.codexCategories = db.prepare(`
            SELECT cc.*, COUNT(ce.id) as entries_count FROM codex_categories cc
            LEFT JOIN codex_entries ce ON ce.codex_category_id = cc.id
            WHERE cc.novel_id = ? GROUP BY cc.id ORDER BY cc.name
        `).all(novelId);
		novel.codexCategories.forEach(category => {
			category.entries = db.prepare(`
                SELECT ce.*, i.thumbnail_local_path FROM codex_entries ce
                LEFT JOIN images i ON i.codex_entry_id = ce.id
                WHERE ce.codex_category_id = ? ORDER BY ce.title
            `).all(category.id);
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
	
	// ... (novels:store handler remains unchanged) ...
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
							
							// MODIFIED: Send an absolute path to the renderer for the live update.
							const absolutePath = path.join(imageHandler.IMAGES_DIR, localPath);
							// The frontend listener `onCoverUpdated` expects a payload with `imagePath`.
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
	
	// ... (novels:openEditor and novels:generateTitle handlers remain unchanged) ...
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
	
	// --- NEW: Structure Generation Handler ---
	ipcMain.handle('novels:generateStructure', async (event, data) => {
		const { novelId, book_about, book_structure, language, llm_model } = data;
		
		// 1. Authorization/Validation
		const novel = db.prepare('SELECT id, title FROM novels WHERE id = ?').get(novelId);
		if (!novel) {
			throw new Error('Novel not found.');
		}
		const chapterCount = db.prepare('SELECT COUNT(*) as count FROM chapters WHERE novel_id = ?').get(novelId).count;
		if (chapterCount > 0) {
			throw new Error('This novel already has chapters and cannot be auto-filled.');
		}
		
		// 2. Read structure file
		const structurePath = path.join(__dirname, 'structures', book_structure);
		if (!fs.existsSync(structurePath)) {
			throw new Error('Selected structure file not found.');
		}
		const structureContent = fs.readFileSync(structurePath, 'utf8');
		
		// 3. LLM Call 1: Generate Outline
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
		
		// 4. LLM Call 2: Generate Codex
		const codexResponse = await aiService.generateNovelCodex({
			outlineJson: JSON.stringify(outlineResponse),
			language: language,
			model: llm_model,
		});
		
		// 5. Database Transaction
		const runTransaction = db.transaction(() => {
			// Update novel details
			db.prepare('UPDATE novels SET genre = ?, logline = ?, synopsis = ? WHERE id = ?')
				.run(outlineResponse.genre || null, outlineResponse.logline || null, outlineResponse.synopsis || null, novelId);
			
			// Create Sections and Chapters
			let sectionOrder = 1;
			for (const sectionData of outlineResponse.sections) {
				const sectionResult = db.prepare('INSERT INTO sections (novel_id, title, description, "order") VALUES (?, ?, ?, ?)')
					.run(novelId, sectionData.title, sectionData.description || null, sectionOrder++);
				const sectionId = sectionResult.lastInsertRowid;
				
				let chapterOrder = 1;
				for (const chapterData of sectionData.chapters) {
					db.prepare('INSERT INTO chapters (novel_id, section_id, title, summary, status, "order") VALUES (?, ?, ?, ?, ?, ?)')
						.run(novelId, sectionId, chapterData.title, chapterData.summary || null, 'in_progress', chapterOrder++);
				}
			}
			
			// Create Codex Entries
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
	// NEW: Handler to read structure files for the form dropdown.
	ipcMain.handle('files:getStructureFiles', () => {
		try {
			const structuresDir = path.join(__dirname, 'structures');
			const files = fs.readdirSync(structuresDir);
			return files
				.filter(file => file.endsWith('.txt'))
				.map(file => {
					// Create a more readable name from the filename
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
	// ... (authors:getDistinct handler remains unchanged) ...
	ipcMain.handle('authors:getDistinct', () => {
		const stmt = db.prepare('SELECT DISTINCT author FROM novels WHERE author IS NOT NULL ORDER BY author ASC');
		return stmt.all().map(row => row.author);
	});
	
	// --- Series Handlers ---
	// ... (series:getAll and series:store handlers remain unchanged) ...
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
}

// --- App Lifecycle Events ---
// ... (app.on events remain unchanged) ...
/**
 * This is the main entry point for the application.
 * It waits for Electron to be ready before doing anything.
 */
app.on('ready', () => {
	// 1. Initialize the database. This MUST be the first step.
	db = initializeDatabase();
	
	// 2. Set up all the IPC handlers that depend on the database.
	setupIpcHandlers();
	
	// 3. Create the main application window.
	createMainWindow();
});

app.on('window-all-closed', () => {
	// On macOS it's common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
		createMainWindow();
	}
});

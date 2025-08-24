const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./src/database/database.js');
require('dotenv').config();

// Import custom modules for handling AI and images
const { initializeDatabase } = require('./src/database/database.js');
const aiService = require('./src/ai/ai.js');
const imageHandler = require('./src/utils/image-handler.js');

// Global references to window objects to prevent garbage collection
let mainWindow;
let editorWindows = new Map();
let db;

/**
 * Creates the main application window (Dashboard).
 */
function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1000,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	
	// MODIFIED: Add a Content Security Policy to allow loading local file images.
	// This is crucial for displaying the generated covers.
	mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' file:;"]
			}
		});
	});
	
	mainWindow.loadFile('public/index.html');
	mainWindow.on('closed', function () {
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

// --- App Lifecycle Events ---

app.on('ready', createMainWindow);

app.on('window-all-closed', function () {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', function () {
	if (mainWindow === null) {
		createMainWindow();
	}
});

// --- IPC Handlers (The Application Backend) ---

// --- Novel Handlers ---

/**
 * Get all novels and their latest cover image for the dashboard.
 */
ipcMain.handle('novels:getAllWithCovers', () => {
	const stmt = db.prepare(`
        SELECT n.*, i.image_local_path as cover_path
        FROM novels n
        LEFT JOIN (
            SELECT novel_id, image_local_path, ROW_NUMBER() OVER(PARTITION BY novel_id ORDER BY created_at DESC) as rn
            FROM images
        ) i ON n.id = i.novel_id AND i.rn = 1
        ORDER BY n.created_at DESC
    `);
	const novels = stmt.all();
	
	// Prepend the absolute path for the renderer to use with file:// protocol
	novels.forEach(novel => {
		if (novel.cover_path) {
			// The path stored in DB is relative to the novels image dir.
			// We construct the full absolute path here.
			novel.cover_path = path.join(imageHandler.IMAGES_DIR, novel.cover_path);
		}
	});
	return novels;
});


/**
 * Get a single novel with all its related data for the editor.
 */
ipcMain.handle('novels:getOne', (event, novelId) => {
	const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
	if (!novel) return null;
	
	// Simulate Eloquent's 'load' functionality
	novel.sections = db.prepare('SELECT * FROM sections WHERE novel_id = ? ORDER BY `order`').all(novelId);
	novel.sections.forEach(section => {
		section.chapters = db.prepare('SELECT * FROM chapters WHERE section_id = ? ORDER BY `order`').all(section.id);
	});
	
	novel.codexCategories = db.prepare(`
        SELECT cc.*, COUNT(ce.id) as entries_count
        FROM codex_categories cc LEFT JOIN codex_entries ce ON ce.codex_category_id = cc.id
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

/**
 * Create a new novel and trigger background AI cover generation.
 */
ipcMain.handle('novels:store', async (event, data) => {
	const userId = 1; // Hardcoded for this single-user app
	const stmt = db.prepare(`
        INSERT INTO novels (user_id, title, author, status, series_id, order_in_series)
        VALUES (?, ?, ?, 'draft', ?, ?)
    `);
	const result = stmt.run(userId, data.title, data.author, data.series_id || null, data.series_index || null);
	const novelId = result.lastInsertRowid;
	
	// --- AI Cover Generation (Non-Blocking) ---
	// We use a self-invoking async function to run this in the background.
	(async () => {
		try {
			console.log(`[AI] Generating cover prompt for "${data.title}"...`);
			const imagePrompt = await aiService.generateCoverPrompt(data.title);
			
			if (imagePrompt) {
				console.log(`[AI] Generating image with prompt: "${imagePrompt}"`);
				const imageUrl = await aiService.generateFalImage(imagePrompt);
				
				if (imageUrl) {
					console.log(`[AI] Downloading image from: ${imageUrl}`);
					const localPath = await imageHandler.storeImageFromUrl(imageUrl, novelId, 'cover');
					
					if (localPath) {
						db.prepare(`
                            INSERT INTO images (user_id, novel_id, image_local_path, remote_url, prompt, image_type)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run(userId, novelId, localPath, imageUrl, imagePrompt, 'generated');
						console.log('[DB] Cover image record saved.');
						
						// Notify the dashboard to update the cover thumbnail.
						const absolutePath = path.join(imageHandler.IMAGES_DIR, localPath);
						mainWindow.webContents.send('novels:cover-updated', { novelId, imagePath: absolutePath });
					}
				}
			}
		} catch (e) {
			console.error('An error occurred during background cover generation:', e);
		}
	})();
	
	// Return immediately, don't wait for the cover.
	return { id: novelId, ...data };
});

/**
 * Open the editor window for a specific novel.
 */
ipcMain.on('novels:openEditor', (event, novelId) => {
	createEditorWindow(novelId);
});

/**
 * Generate a novel title using the AI service.
 */
ipcMain.handle('novels:generateTitle', async () => {
	// This logic could also be moved into ai.js for full separation,
	// but is kept here to show the direct call pattern.
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

// --- Author Handlers ---

/**
 * Get a list of distinct author names.
 */
ipcMain.handle('authors:getDistinct', () => {
	const stmt = db.prepare('SELECT DISTINCT author FROM novels WHERE author IS NOT NULL ORDER BY author ASC');
	return stmt.all().map(row => row.author);
});

// --- Series Handlers ---

/**
 * Get all series.
 */
ipcMain.handle('series:getAll', () => {
	return db.prepare('SELECT * FROM series ORDER BY title ASC').all();
});

/**
 * Create a new series.
 */
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

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { app } = require('electron');

// Define a consistent place to store user-generated images.
const IMAGES_DIR = path.join(app.getPath('userData'), 'images');

/**
 * Downloads an image from a URL and saves it locally.
 * Creates necessary directories.
 * @param {string} url - The URL of the image to download.
 * @param {string} novelId - The ID of the novel to associate the image with.
 * @param {string} filenameBase - The base name for the file (e.g., 'cover').
 * @returns {Promise<string|null>} The local path to the saved image or null on failure.
 */
async function storeImageFromUrl(url, novelId, filenameBase) {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download image: ${response.statusText}`);
		}
		
		const buffer = await response.buffer();
		const novelDir = path.join(IMAGES_DIR, 'novels', String(novelId));
		
		// Ensure the directory exists.
		fs.mkdirSync(novelDir, { recursive: true });
		
		// Determine file extension from URL or content type.
		const extension = path.extname(new URL(url).pathname) || '.jpg';
		const filename = `${filenameBase}-${Date.now()}${extension}`;
		const localPath = path.join(novelDir, filename);
		
		fs.writeFileSync(localPath, buffer);
		console.log(`Image saved to: ${localPath}`);
		
		// Return a path relative to the images directory for storage in the DB.
		return path.join('novels', String(novelId), filename);
		
	} catch (error) {
		console.error(`Failed to store image from URL '${url}':`, error);
		return null;
	}
}

/**
 * NEW: Copies an image from a local file path to the application's storage.
 * This is used for user uploads.
 * @param {string} sourcePath - The absolute path of the file to copy.
 * @param {string} novelId - The ID of the novel.
 * @param {string} codexEntryId - The ID of the codex entry.
 * @param {string} filenameBase - The base name for the new file.
 * @returns {Promise<{original_path: string, thumbnail_path: string|null}>} The relative paths for DB storage.
 */
async function storeImageFromPath(sourcePath, novelId, codexEntryId, filenameBase) {
	try {
		if (!fs.existsSync(sourcePath)) {
			throw new Error('Source file does not exist.');
		}
		
		const buffer = fs.readFileSync(sourcePath);
		const targetDir = path.join(IMAGES_DIR, 'novels', String(novelId), String(codexEntryId));
		
		// Ensure the directory exists.
		fs.mkdirSync(targetDir, { recursive: true });
		
		const extension = path.extname(sourcePath);
		const filename = `${filenameBase}-${Date.now()}${extension}`;
		const localPath = path.join(targetDir, filename);
		
		fs.writeFileSync(localPath, buffer);
		
		// For simplicity, this example doesn't generate a separate thumbnail.
		// In a real app, you'd use a library like 'sharp' here to create one.
		const relativePath = path.join('novels', String(novelId), String(codexEntryId), filename);
		
		return {
			original_path: relativePath,
			thumbnail_path: relativePath, // Using original as thumbnail for now
		};
		
	} catch (error) {
		console.error(`Failed to store image from path '${sourcePath}':`, error);
		throw error;
	}
}

module.exports = { storeImageFromUrl, storeImageFromPath, IMAGES_DIR };

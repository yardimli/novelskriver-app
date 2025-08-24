const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { app } = require('electron');

// Define a consistent place to store user-generated images.
const IMAGES_DIR = path.join(app.getPath('userData'), 'images', 'novels');

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
		const novelDir = path.join(IMAGES_DIR, String(novelId));
		
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

module.exports = { storeImageFromUrl, IMAGES_DIR };

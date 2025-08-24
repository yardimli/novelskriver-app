// MODIFIED: This module centralizes all external AI API calls.
const fetch = require('node-fetch'); // Use node-fetch for making HTTP requests in Node.js
require('dotenv').config(); // Ensure .env variables are loaded

const FAL_API_KEY = process.env.FAL_API_KEY;
const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;

/**
 * A generic function to call the OpenRouter API.
 * @param {object} payload - The request body for the OpenRouter API.
 * @returns {Promise<any>} The JSON response from the API.
 * @throws {Error} If the API call fails.
 */
async function callOpenRouter(payload) {
	if (!OPEN_ROUTER_API_KEY) {
		throw new Error('OpenRouter API key is not configured.');
	}
	
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error('OpenRouter API Error:', errorText);
		throw new Error(`OpenRouter API Error: ${response.status} ${errorText}`);
	}
	
	const data = await response.json();
	// The actual content is a JSON string within the response, so we parse it.
	return JSON.parse(data.choices[0].message.content);
}

/**
 * Generates a prompt for a novel cover image using an LLM.
 * @param {string} novelTitle - The title of the novel.
 * @returns {Promise<string|null>} The generated image prompt or null on failure.
 */
async function generateCoverPrompt(novelTitle) {
	const modelId = process.env.OPEN_ROUTER_MODEL || 'openai/gpt-4o-mini';
	const prompt = `Based on the book title "${novelTitle}", create a dramatic and visually striking art prompt for an AI image generator. The prompt should describe a scene, mood, and key elements for a compelling book cover. Provide the response as a JSON object with a single key "prompt". Example: {"prompt": "A lone astronaut standing on a desolate red planet, looking at a giant, swirling cosmic anomaly in the sky, digital art, dramatic lighting."}`;
	
	try {
		const content = await callOpenRouter({
			model: modelId,
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' },
			temperature: 0.7,
		});
		return content.prompt || null;
	} catch (error) {
		console.error('Failed to generate cover prompt:', error);
		return null;
	}
}

/**
 * Generates an image using the Fal.ai API.
 * @param {string} prompt - The text prompt for the image.
 * @returns {Promise<string|null>} The URL of the generated image, or null on failure.
 */
async function generateFalImage(prompt) {
	if (!FAL_API_KEY) {
		console.error('Fal.ai API key is not configured.');
		return null;
	}
	
	try {
		const response = await fetch('https://fal.run/fal-ai/qwen-image', {
			method: 'POST',
			headers: {
				'Authorization': `Key ${FAL_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				prompt: prompt,
				image_size: 'portrait_16_9', // Default size for covers
			})
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Fal.ai API Error: ${response.status} ${errorText}`);
		}
		
		const data = await response.json();
		if (data.images && data.images[0] && data.images[0].url) {
			return data.images[0].url;
		}
		console.warn('Fal.ai response did not contain an image URL.', { response: data });
		return null;
		
	} catch (error) {
		console.error('Exception when calling Fal.ai API:', error);
		return null;
	}
}

/**
 * NEW: Generates a detailed novel outline (sections, chapters, etc.).
 * @param {object} params - The parameters for generation.
 * @param {string} params.title - The novel title.
 * @param {string} params.about - The core idea of the novel.
 * @param {string} params.structure - The narrative structure content.
 * @param {string} params.language - The output language.
 * @param {string} params.model - The LLM model to use.
 * @returns {Promise<object>} The parsed JSON outline.
 */
async function generateNovelOutline({ title, about, structure, language, model }) {
	const prompt = `
You are a master storyteller and book outliner. Your task is to create a detailed outline for a new novel.

**Novel Title:** "${title}"
**Core Idea:** "${about}"
**Narrative Structure to Follow:** "${structure}"
**Language for Output:** "${language}"

Based on the information above, generate a JSON object with the following structure:
- \`genre\`: A single, appropriate genre for this story (e.g., "Science Fiction", "Fantasy", "Thriller").
- \`logline\`: A compelling one-sentence summary of the novel.
- \`synopsis\`: A 3-4 paragraph summary of the entire plot.
- \`sections\`: An array of objects representing the main parts or acts of the book. Each section object must have:
  - \`title\`: The title of the section (e.g., "Act I: The Setup").
  - \`description\`: A brief one-sentence summary of this section's purpose.
  - \`chapters\`: An array of objects, with 3-5 chapters per section. Each chapter object must have:
    - \`title\`: A creative and fitting title for the chapter.
    - \`summary\`: A 2-3 sentence summary of the key events, character actions, and plot developments in this chapter.

Ensure the entire output is a single, valid JSON object. Do not include any text or markdown formatting before or after the JSON.`;
	
	return callOpenRouter({
		model: model,
		messages: [{ role: 'user', content: prompt }],
		response_format: { type: 'json_object' },
		temperature: 0.7,
	});
}

/**
 * NEW: Generates codex entries based on a novel outline.
 * @param {object} params - The parameters for generation.
 * @param {string} params.outlineJson - The novel outline as a JSON string.
 * @param {string} params.language - The output language.
 * @param {string} params.model - The LLM model to use.
 * @returns {Promise<object>} The parsed JSON codex data.
 */
async function generateNovelCodex({ outlineJson, language, model }) {
	const prompt = `
You are a world-building assistant. Based on the provided novel outline, your task is to identify and create encyclopedia-style entries (a codex) for the key characters and locations.

**Novel Outline (JSON):**
${outlineJson}

**Language for Output:** "${language}"

From the outline, extract the most important characters and locations. Generate a JSON object with the following structure:
- \`characters\`: An array of objects for the main characters. Each object must have:
  - \`name\`: The full name of the character.
  - \`description\`: A one-sentence summary of their role in the story.
  - \`content\`: A detailed paragraph describing their personality, motivations, and background.
- \`locations\`: An array of objects for the key settings. Each object must have:
  - \`name\`: The name of the location.
  - \`description\`: A one-sentence summary of its significance.
  - \`content\`: A detailed paragraph describing the location's atmosphere, appearance, and history.

Focus on the most prominent elements mentioned in the synopsis and chapter summaries. Provide at least 3 characters and 2 locations if possible. Ensure the entire output is a single, valid JSON object. Do not include any text or markdown formatting before or after the JSON.`;
	
	return callOpenRouter({
		model: model,
		messages: [{ role: 'user', content: prompt }],
		response_format: { type: 'json_object' },
		temperature: 0.6,
	});
}

module.exports = {
	generateCoverPrompt,
	generateFalImage,
	generateNovelOutline, // NEW
	generateNovelCodex,   // NEW
};

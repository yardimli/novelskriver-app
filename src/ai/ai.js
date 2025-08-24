// NEW: This module centralizes all external AI API calls.
const fetch = require('node-fetch'); // Use node-fetch for making HTTP requests in Node.js
require('dotenv').config(); // Ensure .env variables are loaded

const FAL_API_KEY = process.env.FAL_API_KEY;
const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;

/**
 * Generates a prompt for a novel cover image using an LLM.
 * @param {string} novelTitle - The title of the novel.
 * @returns {Promise<string|null>} The generated image prompt or null on failure.
 */
async function generateCoverPrompt(novelTitle) {
	const modelId = process.env.OPEN_ROUTER_MODEL || 'openai/gpt-4o-mini';
	if (!OPEN_ROUTER_API_KEY) {
		console.error('OpenRouter API key is not configured.');
		return null;
	}
	
	const prompt = `Based on the book title "${novelTitle}", create a dramatic and visually striking art prompt for an AI image generator. The prompt should describe a scene, mood, and key elements for a compelling book cover. Provide the response as a JSON object with a single key "prompt". Example: {"prompt": "A lone astronaut standing on a desolate red planet, looking at a giant, swirling cosmic anomaly in the sky, digital art, dramatic lighting."}`;
	
	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: modelId,
				messages: [{ role: 'user', content: prompt }],
				response_format: { type: 'json_object' },
				temperature: 0.7,
			})
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`OpenRouter API Error: ${response.status} ${errorText}`);
		}
		
		const data = await response.json();
		const content = JSON.parse(data.choices[0].message.content);
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

module.exports = {
	generateCoverPrompt,
	generateFalImage
};

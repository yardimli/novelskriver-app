const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
require('dotenv').config(); // Ensure .env variables are loaded

const FAL_API_KEY = process.env.FAL_API_KEY;
const OPEN_ROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY;

/**
 * Logs an AI interaction to a file in the user's data directory.
 * @param {string} service - The name of the AI service being called.
 * @param {object|string} prompt - The prompt or payload sent to the AI.
 * @param {object|string} response - The response received from the AI.
 */
function logAiInteraction(service, prompt, response) {
	try {
		const logPath = path.join(app.getPath('userData'), 'ai_interactions.log');
		const timestamp = new Date().toISOString();
		
		const formattedPrompt = typeof prompt === 'object' ? JSON.stringify(prompt, null, 2) : prompt;
		const formattedResponse = typeof response === 'object' ? JSON.stringify(response, null, 2) : response;
		
		const logEntry = `
==================================================
Timestamp: ${timestamp}
Service: ${service}
------------------ Prompt ------------------
${formattedPrompt}
------------------ Response ------------------
${formattedResponse}
==================================================\n\n`;
		
		fs.appendFileSync(logPath, logEntry);
	} catch (error) {
		console.error('Failed to write to AI log file:', error);
	}
}

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
	const finalContent = JSON.parse(data.choices[0].message.content);
	
	logAiInteraction('OpenRouter (Non-streaming)', payload, finalContent);
	
	return finalContent;
}

/**
 * NEW: A generic function to call the OpenRouter API with streaming.
 * @param {object} payload - The request body for the OpenRouter API.
 * @param {function(string): void} onChunk - Callback function to handle each received text chunk.
 * @returns {Promise<void>} A promise that resolves when the stream is complete.
 * @throws {Error} If the API call fails.
 */
async function streamOpenRouter(payload, onChunk) {
	if (!OPEN_ROUTER_API_KEY) {
		throw new Error('OpenRouter API key is not configured.');
	}
	
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ ...payload, stream: true }) // Ensure streaming is enabled
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error('OpenRouter API Error:', errorText);
		throw new Error(`OpenRouter API Error: ${response.status} ${errorText}`);
	}
	
	let fullResponse = '';
	
	// Process the streaming response body
	for await (const chunk of response.body) {
		const lines = chunk.toString('utf8').split('\n').filter(line => line.trim().startsWith('data: '));
		for (const line of lines) {
			const message = line.replace(/^data: /, '');
			if (message === '[DONE]') {
				logAiInteraction('OpenRouter (Streaming)', payload, fullResponse);
				return; // Stream finished
			}
			try {
				const parsed = JSON.parse(message);
				const content = parsed.choices[0]?.delta?.content;
				if (content) {
					fullResponse += content; // Append chunk to full response.
					onChunk(content); // Send the text chunk to the callback
				}
			} catch (error) {
				console.error('Error parsing stream chunk:', message, error);
			}
		}
	}
	
	// Fallback log in case the stream ends without a [DONE] message.
	if (fullResponse) {
		logAiInteraction('OpenRouter (Streaming)', payload, fullResponse);
	}
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
 * @param {string} [imageSize='portrait_16_9'] - The desired image size.
 * @returns {Promise<string|null>} The URL of the generated image, or null on failure.
 */
async function generateFalImage(prompt, imageSize = 'portrait_16_9') {
	if (!FAL_API_KEY) {
		console.error('Fal.ai API key is not configured.');
		return null;
	}
	
	try {
		const payload = {
			prompt: prompt,
			image_size: imageSize,
		};
		
		const response = await fetch('https://fal.run/fal-ai/qwen-image', {
			method: 'POST',
			headers: {
				'Authorization': `Key ${FAL_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Fal.ai API Error: ${response.status} ${errorText}`);
		}
		
		const data = await response.json();
		if (data.images && data.images[0] && data.images[0].url) {
			logAiInteraction('Fal.ai Image Generation', payload, data);
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
 * Generates a detailed novel outline (sections, chapters, etc.).
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
 * Generates codex entries based on a novel outline.
 * @param {object} params - The parameters for generation.
 * @param {string} params.outlineJson - The novel outline as a JSON string.
 * @param {string} params.language - The output language.
 * @param {string} params.model - The LLM model to use.
 * @returns {Promise<object>} The parsed JSON codex data.
 */
async function generateNovelCodex({ outlineJson, language, model }) {
	// MODIFIED: Prompt no longer asks for a 'description' field, only 'name' and 'content'.
	const prompt = `
You are a world-building assistant. Based on the provided novel outline, your task is to identify and create encyclopedia-style entries (a codex) for the key characters and locations.

**Novel Outline (JSON):**
${outlineJson}

**Language for Output:** "${language}"

From the outline, extract the most important characters and locations. Generate a JSON object with the following structure:
- \`characters\`: An array of objects for the main characters. Each object must have:
  - \`name\`: The full name of the character.
  - \`content\`: A detailed paragraph describing their personality, motivations, and background.
- \`locations\`: An array of objects for the key settings. Each object must have:
  - \`name\`: The name of the location.
  - \`content\`: A detailed paragraph describing the location's atmosphere, appearance, and history.

Focus on the most prominent elements mentioned in the synopsis and chapter summaries. Provide at least 3 characters and 2 locations if possible. Ensure the entire output is a single, valid JSON object. Do not include any text or markdown formatting before or after the JSON.`;
	
	return callOpenRouter({
		model: model,
		messages: [{ role: 'user', content: prompt }],
		response_format: { type: 'json_object' },
		temperature: 0.6,
	});
}

/**
 * Processes a text selection using an LLM for actions like rephrasing.
 * @param {object} params - The parameters for the text processing.
 * @param {string} params.text - The text to process.
 * @param {string} params.action - The action to perform ('expand', 'rephrase', 'shorten').
 * @param {string} params.model - The LLM model to use.
 * @returns {Promise<object>} The parsed JSON response with the processed text.
 */
async function processCodexText({ text, action, model }) {
	const actionInstruction = {
		'expand': 'Expand on the following text, adding more detail, description, and context. Make it about twice as long.',
		'rephrase': 'Rephrase the following text to make it clearer, more engaging, or to have a different tone, while preserving the core meaning.',
		'shorten': 'Shorten the following text, condensing it to its most essential points. Make it about half as long.',
	}[action] || 'Process the following text.';
	
	const prompt = `
You are a writing assistant. Your task is to process a piece of text based on a specific instruction.

**Instruction:** ${actionInstruction}

**Original Text:**
"${text}"

Please provide only the modified text as your response. The output must be a single, valid JSON object with one key: "processed_text". Do not include any explanations or surrounding text.`;
	
	return callOpenRouter({
		model: model,
		messages: [{ role: 'user', content: prompt }],
		response_format: { type: 'json_object' },
		temperature: 0.7,
	});
}

/**
 * NEW: Processes a text selection using an LLM with streaming for actions like rephrasing.
 * @param {object} params - The parameters for the text processing.
 * @param {string} params.text - The text to process.
 * @param {string} params.action - The action to perform ('expand', 'rephrase', 'shorten').
 * @param {string} params.model - The LLM model to use.
 * @param {function(string): void} onChunk - Callback function to handle each received text chunk.
 * @returns {Promise<void>} A promise that resolves when the stream is complete.
 */
async function streamProcessCodexText({ text, action, model }, onChunk) {
	const actionInstruction = {
		'expand': 'Expand on the following text, adding more detail, description, and context. Make it about twice as long.',
		'rephrase': 'Rephrase the following text to make it clearer, more engaging, or to have a different tone, while preserving the core meaning.',
		'shorten': 'Shorten the following text, condensing it to its most essential points. Make it about half as long.',
	}[action] || 'Process the following text.';
	
	// This prompt is specifically for streaming: it asks for raw text output, not JSON.
	const prompt = `
You are a writing assistant. Your task is to process a piece of text based on a specific instruction.

**Instruction:** ${actionInstruction}

**Original Text:**
"${text}"

Please provide only the modified text as your response. Do not include any explanations, apologies, or surrounding text. Begin writing the modified text directly.`;
	
	await streamOpenRouter({
		model: model,
		messages: [{ role: 'user', content: prompt }],
		temperature: 0.7,
	}, onChunk);
}

/**
 * NEW: Fetches the list of available models from the OpenRouter API.
 * Caches the result for 24 hours to a file in the user's app data directory.
 * @returns {Promise<object>} The raw model data from the API or cache.
 * @throws {Error} If the API call fails.
 */
async function getOpenRouterModels() {
	const cachePath = path.join(app.getPath('userData'), 'temp');
	const cacheFile = path.join(cachePath, 'openrouter_models.json');
	const cacheDurationInSeconds = 24 * 60 * 60; // 24 hours
	
	if (fs.existsSync(cacheFile) && (Date.now() - fs.statSync(cacheFile).mtimeMs) / 1000 < cacheDurationInSeconds) {
		try {
			const cachedContent = fs.readFileSync(cacheFile, 'utf8');
			return JSON.parse(cachedContent);
		} catch (error) {
			console.error('Failed to read or parse model cache:', error);
			// If cache is corrupt, proceed to fetch from API
		}
	}
	
	const response = await fetch('https://openrouter.ai/api/v1/models', {
		method: 'GET',
		headers: {
			'Accept': 'application/json',
			'HTTP-Referer': 'https://github.com/locutusdeborg/novel-skriver', // Example referrer
			'X-Title': 'Novel Skriver',
		},
	});
	
	if (!response.ok) {
		const errorText = await response.text();
		console.error('OpenRouter Models API Error:', errorText);
		throw new Error(`OpenRouter Models API Error: ${response.status} ${errorText}`);
	}
	
	const modelsData = await response.json();
	
	try {
		fs.mkdirSync(cachePath, { recursive: true });
		fs.writeFileSync(cacheFile, JSON.stringify(modelsData));
	} catch (error) {
		console.error('Failed to write model cache:', error);
	}
	
	return modelsData;
}

/**
 * NEW: Processes the raw models list from OpenRouter to create a view-friendly array.
 * @param {object} modelsData The raw JSON response from getOpenRouterModels().
 * @returns {Array<object>} A sorted array of models ready for a dropdown.
 */
function processModelsForView(modelsData) {
	const processedModels = [];
	const positiveList = ['openai', 'anthropic', 'mistral', 'google', 'deepseek', 'mistral', 'moonshot', 'glm'];
	const negativeList = ['free', '8b', '9b', '3b', '7b', '12b', '22b', '24b', '32b', 'gpt-4 turbo', 'oss', 'tng', 'lite', '1.5', '2.0', 'tiny', 'gemma', 'small', 'nano', ' mini', '-mini', 'nemo', 'chat', 'distill', '3.5', 'dolphin', 'codestral', 'devstral', 'magistral', 'pixtral', 'codex', 'o1-pro', 'o3-pro', 'experimental', 'preview'];
	
	const models = (modelsData.data || []).sort((a, b) => a.name.localeCompare(b.name));
	
	for (const model of models) {
		const id = model.id;
		let name = model.name;
		const idLower = id.toLowerCase();
		const nameLower = name.toLowerCase();
		
		const isNegativeMatch = negativeList.some(word => idLower.includes(word) || nameLower.includes(word));
		if (isNegativeMatch) {
			continue;
		}
		
		const isPositiveMatch = positiveList.some(word => idLower.includes(word) || nameLower.includes(word));
		if (!isPositiveMatch) {
			continue;
		}
		
		const hasImageSupport = (model.architecture?.input_modalities || []).includes('image');
		const hasReasoningSupport = (model.supported_parameters || []).includes('reasoning');
		
		if (hasImageSupport) {
			name += ' (i)';
		}
		
		if (hasReasoningSupport && !name.toLowerCase().includes('think')) {
			processedModels.push({ id: id, name: name });
			processedModels.push({ id: `${id}--thinking`, name: `${name} (thinking)` });
		} else {
			processedModels.push({ id: id, name: name });
		}
	}
	
	return processedModels.sort((a, b) => a.name.localeCompare(b.name));
}


module.exports = {
	generateCoverPrompt,
	generateFalImage,
	generateNovelOutline,
	generateNovelCodex,
	processCodexText,
	streamProcessCodexText,
	getOpenRouterModels,
	processModelsForView,
};

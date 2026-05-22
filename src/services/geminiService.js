/**
 * @module geminiService
 * @description Centralized Gemini API client for StudyForge.
 * Provides quiz generation, AI grading, topic research, and OCR via Google's Gemini API.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const STORAGE_KEY = 'studyforge_gemini_api_key';

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------

/**
 * Persist a Gemini API key in localStorage.
 * @param {string} key - The Gemini API key.
 */
export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}

/**
 * Retrieve the stored Gemini API key.
 * @returns {string|null} The API key, or null if not set.
 */
export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Check whether an API key has been stored.
 * @returns {boolean}
 */
export function hasApiKey() {
  const key = getApiKey();
  return typeof key === 'string' && key.length > 0;
}

// ---------------------------------------------------------------------------
// Core API Helper
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GeminiCallOptions
 * @property {string}  [model]             - Gemini model name (default: gemini-2.0-flash).
 * @property {number}  [temperature]       - Sampling temperature (0‑2).
 * @property {number}  [maxTokens]         - Maximum output tokens.
 * @property {object}  [responseSchema]    - JSON schema for structured output.
 * @property {string}  [systemInstruction] - System-level instruction prepended to the request.
 * @property {Array<{mimeType: string, data: string}>} [images] - Inline images (base64).
 * @property {boolean} [jsonResponse]      - When true, request application/json MIME type.
 * @property {object}  [tools]             - Tool configuration (e.g. google_search_retrieval).
 */

/**
 * Low-level helper that calls the Gemini generateContent endpoint.
 *
 * @param {string} prompt - The user prompt text.
 * @param {GeminiCallOptions} [options={}] - Additional configuration.
 * @returns {Promise<string|object>} Parsed JSON when jsonResponse is true, otherwise raw text.
 * @throws {Error} When the API key is missing or the request fails.
 */
async function callGemini(prompt, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not set. Please add your API key in Settings.');
  }

  const {
    model = DEFAULT_MODEL,
    temperature,
    maxTokens,
    responseSchema,
    systemInstruction,
    images,
    jsonResponse = false,
    tools,
  } = options;

  // Build content parts
  /** @type {Array<object>} */
  const parts = [];

  if (images && images.length > 0) {
    for (const img of images) {
      parts.push({
        inline_data: {
          mime_type: img.mimeType,
          data: img.data,
        },
      });
    }
  }

  parts.push({ text: prompt });

  // Build request body
  const body = {
    contents: [{ parts }],
  };

  // System instruction
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  // Generation config
  const generationConfig = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (maxTokens !== undefined) generationConfig.max_output_tokens = maxTokens;
  if (jsonResponse) generationConfig.response_mime_type = 'application/json';
  if (responseSchema) generationConfig.response_schema = responseSchema;

  if (Object.keys(generationConfig).length > 0) {
    body.generation_config = generationConfig;
  }

  // Tools (e.g. search grounding)
  if (tools) {
    body.tools = tools;
  }

  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  // Extract the text from the first candidate
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('No response candidates returned from Gemini.');
  }

  // Check for blocked content
  if (candidate.finishReason === 'SAFETY') {
    throw new Error('The response was blocked by safety filters. Try rephrasing your content.');
  }

  const text = candidate.content?.parts?.map((p) => p.text).join('') ?? '';

  if (jsonResponse) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Failed to parse JSON response from Gemini. The model returned invalid JSON.');
    }
  }

  return text;
}

// ---------------------------------------------------------------------------
// Quiz Generation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} QuizConfig
 * @property {Array<'mc'|'tf'|'matching'|'fill'|'short'>} questionTypes - Types of questions to include.
 * @property {number|'auto'} count      - Number of questions, or 'auto' to let the AI decide.
 * @property {'easy'|'medium'|'hard'} difficulty - Desired difficulty level.
 */

/**
 * @typedef {Object} QuizQuestion
 * @property {'mc'|'tf'|'matching'|'fill'|'short'} type - Question type.
 * @property {string}   question      - The question text.
 * @property {string[]} [options]     - Answer options (for multiple choice).
 * @property {string}   correctAnswer - The correct answer.
 * @property {string}   explanation   - Explanation of the correct answer.
 * @property {Array<{left: string, right: string}>} [pairs] - Matching pairs (for matching type).
 * @property {string[]} [blanks]      - Expected answers for each blank (for fill-in-the-blank).
 */

/**
 * Generate a quiz from the provided source text.
 *
 * @param {string} text   - The source material to generate questions from.
 * @param {QuizConfig} config - Quiz generation configuration.
 * @returns {Promise<{questions: QuizQuestion[]}>} Structured quiz data.
 */
export async function generateQuiz(text, config) {
  const { questionTypes = ['mc'], count = 'auto', difficulty = 'medium' } = config;

  const typeDescriptions = {
    mc: 'Multiple Choice (type: "mc") — provide exactly 4 options in an "options" array and set "correctAnswer" to the text of the correct option.',
    tf: 'True/False (type: "tf") — provide options ["True", "False"] and set "correctAnswer" to "True" or "False".',
    matching: 'Matching (type: "matching") — provide a "pairs" array of objects with "left" and "right" keys. Set "correctAnswer" to a brief description. Do NOT include "options".',
    fill: 'Fill in the Blank (type: "fill") — use "___" in the question text for each blank. Provide a "blanks" array with the expected answer for each blank. Set "correctAnswer" to a comma-separated list of blank answers.',
    short: 'Short Answer (type: "short") — set "correctAnswer" to the ideal short answer (1‑3 sentences).',
  };

  const allowedTypes = questionTypes.map((t) => typeDescriptions[t]).filter(Boolean).join('\n');

  const countInstruction =
    count === 'auto'
      ? 'Determine the optimal number of questions based on the length and depth of the content (minimum 3, maximum 100).'
      : `Generate exactly ${count} questions.`;

  const systemInstruction = `You are an expert quiz generator for the educational app StudyForge.

Your task is to produce a JSON object that strictly conforms to the following schema.

Root object:
{
  "questions": [ ...array of question objects... ]
}

Each question object MUST have these fields:
- "type": one of ${JSON.stringify(questionTypes)}
- "question": string — the question text
- "correctAnswer": string — the correct answer
- "explanation": string — a clear, educational explanation (1‑3 sentences)

Conditional fields depending on type:
${allowedTypes}

Rules:
1. ${countInstruction}
2. Difficulty level: ${difficulty}. Easy = recall / definitions; Medium = understanding / application; Hard = analysis / synthesis / evaluation.
3. Distribute question types roughly evenly across the requested types unless one type is more appropriate for the content.
4. Questions must be directly derived from the provided source text.
5. Explanations should teach, not just restate the answer.
6. Every question must be unambiguous and have exactly one correct answer.
7. Do NOT include any markdown, code fences, or text outside the JSON object.`;

  const prompt = `Generate a quiz from the following source material:\n\n${text}`;

  const result = await callGemini(prompt, {
    systemInstruction,
    jsonResponse: true,
    temperature: 0.7,
    maxTokens: 8192,
  });

  // Normalise: ensure we always return { questions: [...] }
  if (result && Array.isArray(result.questions)) {
    return result;
  }

  if (Array.isArray(result)) {
    return { questions: result };
  }

  throw new Error('Unexpected quiz response structure from Gemini.');
}

// ---------------------------------------------------------------------------
// AI Grading
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GradeResult
 * @property {number}  score     - 0‑100 score.
 * @property {string}  feedback  - Human-readable feedback.
 * @property {boolean} isCorrect - Whether the answer is considered correct (score >= 70).
 */

/**
 * Grade a user's answer against the correct answer using AI.
 * Uses lenient, concept-based grading rather than exact string matching.
 *
 * @param {string} question      - The original question.
 * @param {string} userAnswer    - The user's submitted answer.
 * @param {string} correctAnswer - The expected correct answer.
 * @returns {Promise<GradeResult>}
 */
export async function gradeAnswer(question, userAnswer, correctAnswer) {
  const systemInstruction = `You are a fair and encouraging academic grader for StudyForge.

Grade the student's answer on a scale of 0‑100 using **conceptual accuracy**, not word-for-word matching.
- Award full marks if the core concept is correct even if wording differs.
- Deduct points only for factual errors, missing key concepts, or significant inaccuracies.
- Be lenient with spelling, grammar, and phrasing.

Return a JSON object with exactly these fields:
{
  "score": <number 0‑100>,
  "feedback": "<constructive feedback string>",
  "isCorrect": <boolean — true if score >= 70>
}

Do NOT include any text outside the JSON object.`;

  const prompt = `Question: ${question}
Correct Answer: ${correctAnswer}
Student's Answer: ${userAnswer}

Grade the student's answer.`;

  const result = await callGemini(prompt, {
    systemInstruction,
    jsonResponse: true,
    temperature: 0.3,
    maxTokens: 1024,
  });

  return {
    score: Number(result.score) || 0,
    feedback: String(result.feedback || ''),
    isCorrect: Boolean(result.isCorrect),
  };
}

// ---------------------------------------------------------------------------
// Research Topic
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ResearchResult
 * @property {string} title   - A descriptive title for the topic.
 * @property {string} content - Comprehensive study material in plain text / markdown.
 * @property {Array<{title: string, url: string}>} sources - Reference sources.
 */

/**
 * Research a topic using Gemini with Google Search grounding.
 * Returns content detailed enough to generate a thorough quiz.
 *
 * @param {string} topic - The topic to research.
 * @returns {Promise<ResearchResult>}
 */
export async function researchTopic(topic) {
  const systemInstruction = `You are a thorough academic researcher for StudyForge.

Research the given topic in depth and produce comprehensive study material.
The content must be detailed and factual — it will be used to generate quiz questions.

Return a JSON object with exactly these fields:
{
  "title": "<descriptive title>",
  "content": "<detailed study material — at least 800 words, covering key concepts, definitions, facts, dates, and relationships>",
  "sources": [{ "title": "<source name>", "url": "<source URL>" }, ...]
}

Use information retrieved from Google Search to ground your response in real sources.
Include at least 3 sources when available.
Do NOT include any text outside the JSON object.`;

  const prompt = `Research the following topic in depth:\n\n${topic}`;

  const result = await callGemini(prompt, {
    systemInstruction,
    jsonResponse: true,
    temperature: 0.5,
    maxTokens: 8192,
    tools: [{ google_search_retrieval: {} }],
  });

  return {
    title: String(result.title || topic),
    content: String(result.content || ''),
    sources: Array.isArray(result.sources) ? result.sources : [],
  };
}

// ---------------------------------------------------------------------------
// OCR — Extract Text from Image
// ---------------------------------------------------------------------------

/**
 * Extract all readable text from an image using Gemini Vision.
 *
 * @param {string} base64Data - Base64-encoded image data (no data-URI prefix).
 * @param {string} mimeType   - MIME type of the image (e.g. "image/png").
 * @returns {Promise<string>} The extracted text.
 */
export async function extractTextFromImage(base64Data, mimeType) {
  const systemInstruction =
    'You are an OCR assistant. Extract ALL text visible in the provided image. ' +
    'Preserve the original structure (paragraphs, lists, headings) as closely as possible. ' +
    'Return ONLY the extracted text with no commentary or explanation.';

  const result = await callGemini('Extract all text from this image.', {
    systemInstruction,
    images: [{ mimeType, data: base64Data }],
    temperature: 0.1,
    maxTokens: 4096,
  });

  return typeof result === 'string' ? result.trim() : String(result);
}

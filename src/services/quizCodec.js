/**
 * @module quizCodec
 * @description Encode and decode quiz data into shareable string codes.
 *
 * Format: `SF1:<base64-encoded JSON>`
 * - `SF1` is the codec version prefix for forward compatibility.
 * - The payload is a plain base64-encoded JSON string.
 */

/** Current codec version prefix. */
const CODEC_PREFIX = 'SF1:';

/**
 * @typedef {Object} ShareableQuizData
 * @property {Array<object>} questions       - Array of quiz question objects.
 * @property {object}        config          - Quiz generation configuration.
 * @property {string}        title           - Quiz title.
 * @property {string}        [sourceSummary] - Brief summary of the source material.
 */

/**
 * Encode quiz data into a shareable string.
 *
 * @param {ShareableQuizData} quizData - The quiz data to encode.
 * @returns {string} An encoded string prefixed with `SF1:`.
 * @throws {Error} If encoding fails.
 */
export function encodeQuiz(quizData) {
  if (!quizData || typeof quizData !== 'object') {
    throw new Error('encodeQuiz: quizData must be a non-null object.');
  }

  try {
    const json = JSON.stringify(quizData);
    // Use TextEncoder to handle Unicode characters safely with btoa
    const bytes = new TextEncoder().encode(json);
    const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return CODEC_PREFIX + btoa(binary);
  } catch (err) {
    throw new Error(`Failed to encode quiz data: ${err.message}`);
  }
}

/**
 * Decode a previously encoded quiz code back into quiz data.
 *
 * @param {string} code - The encoded quiz string (must start with `SF1:`).
 * @returns {ShareableQuizData|null} The decoded quiz data, or `null` if the code is invalid.
 */
export function decodeQuiz(code) {
  if (typeof code !== 'string' || !code.startsWith(CODEC_PREFIX)) {
    return null;
  }

  try {
    const base64 = code.slice(CODEC_PREFIX.length);
    const binary = atob(base64);
    // Decode back through TextDecoder for Unicode safety
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json);

    // Basic structural validation
    if (!data || typeof data !== 'object' || !Array.isArray(data.questions)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Check whether a string is a valid encoded quiz code.
 *
 * @param {string} code - The string to validate.
 * @returns {boolean} `true` if the code can be successfully decoded.
 */
export function isValidQuizCode(code) {
  return decodeQuiz(code) !== null;
}

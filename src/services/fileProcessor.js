/**
 * @module fileProcessor
 * @description Extracts text from uploaded files (PDF, DOCX, images).
 * Uses pdfjs-dist for PDFs, mammoth for DOCX, and Gemini Vision for OCR fallback.
 */

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { extractTextFromImage } from './geminiService';

// Configure the PDF.js web worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/** Minimum average characters per page before we consider a PDF "scanned". */
const MIN_CHARS_PER_PAGE = 50;

/**
 * @typedef {Object} ProcessedFile
 * @property {string} text   - Extracted plain text.
 * @property {'pdf'|'docx'|'image'|'ocr'} source - How the text was extracted.
 */

/**
 * Process an uploaded file and extract its text content.
 *
 * Supported formats:
 * - `.pdf`  — text extraction via pdfjs-dist, with OCR fallback for scanned pages.
 * - `.docx` — raw text extraction via mammoth.
 * - `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` — OCR via Gemini Vision.
 *
 * @param {File} file - The uploaded File object.
 * @returns {Promise<ProcessedFile>}
 * @throws {Error} If the file type is unsupported.
 */
export async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    return extractFromPDF(file);
  }

  if (ext === 'docx') {
    return extractFromDOCX(file);
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return extractFromImage(file);
  }

  throw new Error(
    `Unsupported file type: .${ext}. Supported formats: PDF, DOCX, JPG, PNG, GIF, WEBP.`
  );
}

// ---------------------------------------------------------------------------
// PDF Extraction
// ---------------------------------------------------------------------------

/**
 * Read a File object as an ArrayBuffer.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a File object as a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>} Data URL string.
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Extract text from a PDF file.
 * If text content is sparse (likely a scanned document), falls back to
 * rendering pages as images and sending them through Gemini Vision OCR.
 *
 * @param {File} file
 * @returns {Promise<ProcessedFile>}
 */
async function extractFromPDF(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  // First pass: try normal text extraction
  const pageTexts = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => /** @type {any} */ (item).str).join(' ');
    pageTexts.push(text);
  }

  const combinedText = pageTexts.join('\n\n');
  const avgCharsPerPage = combinedText.length / numPages;

  // If we got a reasonable amount of text, return it directly
  if (avgCharsPerPage >= MIN_CHARS_PER_PAGE) {
    return { text: combinedText.trim(), source: 'pdf' };
  }

  // Scanned PDF fallback: render each page to a canvas and OCR via Gemini Vision
  const ocrTexts = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR quality

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];

    try {
      const pageText = await extractTextFromImage(base64Data, 'image/png');
      ocrTexts.push(pageText);
    } catch (err) {
      console.warn(`OCR failed for page ${i}:`, err);
      // Continue with remaining pages
    }
  }

  const ocrCombined = ocrTexts.join('\n\n').trim();
  if (!ocrCombined) {
    throw new Error('Could not extract text from this PDF. It may be empty or corrupted.');
  }

  return { text: ocrCombined, source: 'ocr' };
}

// ---------------------------------------------------------------------------
// DOCX Extraction
// ---------------------------------------------------------------------------

/**
 * Extract raw text from a DOCX file using mammoth.js.
 *
 * @param {File} file
 * @returns {Promise<ProcessedFile>}
 */
async function extractFromDOCX(file) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });

  const text = result.value.trim();
  if (!text) {
    throw new Error('The DOCX file appears to be empty or could not be read.');
  }

  return { text, source: 'docx' };
}

// ---------------------------------------------------------------------------
// Image Extraction (OCR)
// ---------------------------------------------------------------------------

/**
 * Extract text from an image file using Gemini Vision OCR.
 *
 * @param {File} file
 * @returns {Promise<ProcessedFile>}
 */
async function extractFromImage(file) {
  const dataUrl = await readFileAsDataURL(file);
  const base64Data = dataUrl.split(',')[1];
  const mimeType = file.type || 'image/png';

  const text = await extractTextFromImage(base64Data, mimeType);

  if (!text) {
    throw new Error('No text could be extracted from the image.');
  }

  return { text, source: 'image' };
}

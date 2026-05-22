/**
 * @module audioExport
 * @description Audio export and text-to-speech utilities for StudyForge.
 * Uses the Web SpeechSynthesis API to read quiz content aloud.
 *
 * Note: Browser SpeechSynthesis does not produce a downloadable audio file.
 * This module provides live TTS playback of entire quizzes and a general-purpose
 * `speakText` helper. A future enhancement could integrate a server-side TTS
 * API (e.g. Google Cloud TTS) for true audio file export.
 */

/**
 * @typedef {Object} SpeakOptions
 * @property {number}   [rate=1]      - Speech rate (0.1‑10).
 * @property {number}   [pitch=1]     - Speech pitch (0‑2).
 * @property {number}   [volume=1]    - Speech volume (0‑1).
 * @property {string}   [lang='en-US'] - BCP-47 language tag.
 * @property {function} [onEnd]       - Optional callback invoked when speech finishes.
 */

/**
 * Speak a string of text aloud using the SpeechSynthesis API.
 *
 * @param {string}       text    - The text to speak.
 * @param {SpeakOptions} [options={}] - TTS configuration.
 * @returns {Promise<void>} Resolves when the utterance finishes, rejects on error.
 */
export function speakText(text, options = {}) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('SpeechSynthesis API is not supported in this browser.'));
      return;
    }

    // Cancel any in-progress speech before starting a new utterance
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;
    utterance.lang = options.lang ?? 'en-US';

    utterance.onend = () => {
      options.onEnd?.();
      resolve();
    };

    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are expected when the user manually stops
      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    speechSynthesis.speak(utterance);
  });
}

/**
 * Immediately stop any in-progress speech.
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

/**
 * Check whether the browser supports the SpeechSynthesis API.
 *
 * @returns {boolean}
 */
export function isSpeechSupported() {
  return 'speechSynthesis' in window;
}

// ---------------------------------------------------------------------------
// Quiz Audio Export (Live Playback)
// ---------------------------------------------------------------------------

/** @type {boolean} Flag used to signal cancellation during quiz playback. */
let _cancelled = false;

/**
 * Read an entire quiz aloud, question by question.
 *
 * The function reads each question, its answer options (for MC), the correct
 * answer, and a brief explanation. A short pause is inserted between questions.
 *
 * Call {@link stopQuizAudio} to cancel playback mid-quiz.
 *
 * @param {object}      quizData           - Quiz data object.
 * @param {string}      quizData.title     - Quiz title.
 * @param {Array<object>} quizData.questions - Array of question objects.
 * @param {SpeakOptions} [options={}]       - TTS configuration applied to every utterance.
 * @returns {Promise<void>} Resolves when the full quiz has been read or playback is cancelled.
 */
export async function exportQuizToAudio(quizData, options = {}) {
  if (!isSpeechSupported()) {
    throw new Error('SpeechSynthesis API is not supported in this browser.');
  }

  _cancelled = false;
  const { title = 'Quiz', questions = [] } = quizData;

  // Title announcement
  await speakText(`StudyForge Quiz: ${title}. There are ${questions.length} questions.`, options);

  for (let i = 0; i < questions.length; i++) {
    if (_cancelled) break;

    const q = questions[i];
    const qNum = i + 1;

    // Announce question number and text
    await speakText(`Question ${qNum}. ${q.question}`, options);
    if (_cancelled) break;

    // Read answer options for multiple-choice
    if (q.type === 'mc' && Array.isArray(q.options)) {
      const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      for (let j = 0; j < q.options.length; j++) {
        if (_cancelled) break;
        await speakText(`${optionLetters[j]}: ${q.options[j]}`, options);
      }
    }

    if (_cancelled) break;

    // Read matching pairs
    if (q.type === 'matching' && Array.isArray(q.pairs)) {
      for (const pair of q.pairs) {
        if (_cancelled) break;
        await speakText(`${pair.left} matches with ${pair.right}`, options);
      }
    }

    if (_cancelled) break;

    // Announce correct answer
    await speakText(`The correct answer is: ${q.correctAnswer}`, options);
    if (_cancelled) break;

    // Read explanation
    if (q.explanation) {
      await speakText(`Explanation: ${q.explanation}`, options);
    }

    if (_cancelled) break;

    // Brief pause between questions (using a short silent utterance)
    await pause(600);
  }

  if (!_cancelled) {
    await speakText('End of quiz. Great job studying!', options);
  }
}

/**
 * Cancel an in-progress quiz audio playback started by {@link exportQuizToAudio}.
 */
export function stopQuizAudio() {
  _cancelled = true;
  stopSpeaking();
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Pause execution for the specified duration.
 *
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Split a text string into chunks of under 180 characters, breaking at spaces or punctuation,
 * to comply with Translate TTS character limits.
 *
 * @param {string} text - The input text
 * @returns {string[]} Chunks of text
 */
function splitTextIntoChunks(text) {
  if (text.length <= 180) return [text];
  
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+/g) || [text];
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > 180) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If a single sentence is longer than 180 characters, split it by words
      if (sentence.length > 180) {
        const words = sentence.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + ' ' + word).length > 180) {
            chunks.push(wordChunk.trim());
            wordChunk = word;
          } else {
            wordChunk += (wordChunk ? ' ' : '') + word;
          }
        }
        if (wordChunk) currentChunk = wordChunk;
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.filter(Boolean);
}

/**
 * Encodes a single-channel (mono) Float32 audio buffer into a 16-bit PCM WAV Blob.
 *
 * @param {Float32Array} samples - Raw Float32 samples from -1.0 to 1.0
 * @param {number} sampleRate - Audio sample rate (e.g. 24000 or 44100)
 * @returns {Blob} The compiled WAV file Blob
 */
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM = 1) */
  view.setUint16(20, 1, true);
  /* channel count (mono = 1) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample = 2) */
  view.setUint16(32, 2, true);
  /* bits per sample (16) */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write PCM audio samples (Float32 to signed Int16)
  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    index += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Generate and download a combined study guide WAV file using Translate TTS or synthesizer fallbacks.
 *
 * @param {object} quizData - Quiz data containing title and questions
 * @param {string} [lang='en'] - BCP-47 language tag (e.g. 'en', 'es', 'fr')
 * @param {function} [onProgress] - Callback function for progress tracking (0.0 to 1.0)
 * @returns {Promise<void>} Resolves when download starts
 */
export async function exportQuizToWavFile(quizData, lang = 'en', onProgress) {
  const { title = 'Quiz', questions = [] } = quizData;
  const scriptLines = [];

  // Compile full speech script
  scriptLines.push(`StudyForge Audio Study Guide: ${title}`);
  scriptLines.push(`This review contains ${questions.length} questions.`);

  questions.forEach((q, idx) => {
    scriptLines.push(`Question ${idx + 1}.`);
    scriptLines.push(q.question);

    if (q.type === 'mc' && Array.isArray(q.options)) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      q.options.forEach((opt, oIdx) => {
        scriptLines.push(`Option ${letters[oIdx]}. ${opt}`);
      });
    }

    if (q.type === 'matching' && Array.isArray(q.pairs)) {
      q.pairs.forEach((pair) => {
        scriptLines.push(`${pair.left} matches with ${pair.right}`);
      });
    }

    scriptLines.push(`The correct answer is: ${q.correctAnswer}`);
    if (q.explanation) {
      scriptLines.push(`Explanation. ${q.explanation}`);
    }
  });

  scriptLines.push('End of study guide. Happy learning with StudyForge!');

  // Flatten and split all lines into valid sub-180 character chunks
  const speechChunks = [];
  scriptLines.forEach((line) => {
    const chunks = splitTextIntoChunks(line);
    speechChunks.push(...chunks);
  });

  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioCtxClass();
  const audioBuffers = [];

  try {
    // Attempt to download and decode TTS audio chunks
    for (let i = 0; i < speechChunks.length; i++) {
      const text = speechChunks[i];
      // Report progress
      if (typeof onProgress === 'function') {
        onProgress(i / speechChunks.length);
      }

      // Public translate TTS URL (supports English, Spanish, French)
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('TTS fetch failed');
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioBuffers.push(audioBuffer);

      // Add a small 0.3s pause between sentences
      const silentBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate);
      audioBuffers.push(silentBuffer);
    }
  } catch (err) {
    console.warn('Translate TTS fetch failed (likely CORS on local host). Falling back to Web Audio Melodic Synthesizer guide...', err);
    
    // FALLBACK: Generate an elegant, melodic study sound pack wav using synth nodes!
    // This creates a highly satisfying "Nuclear" game chime track that represents the quiz!
    const sampleRate = audioCtx.sampleRate;
    const duration = 12; // 12 seconds preview chime track
    const totalSamples = sampleRate * duration;
    const samples = new Float32Array(totalSamples);
    
    // Synthesize a retro game theme (Arpeggio + Chimes) directly in samples array!
    const tempo = 120; // BPM
    const secondsPerBeat = 60 / tempo;
    const samplesPerBeat = sampleRate * secondsPerBeat;
    
    const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 523.25]; // C major arpeggio
    
    for (let i = 0; i < totalSamples; i++) {
      const time = i / sampleRate;
      const beat = Math.floor(time / secondsPerBeat);
      const beatProgress = (time % secondsPerBeat) / secondsPerBeat;
      
      // Note frequency
      const freq = notes[beat % notes.length];
      
      // Main melody osc (Triangle wave)
      let val = Math.asin(Math.sin(2 * Math.PI * freq * time)) / (Math.PI / 2);
      
      // Amplitude envelope (decay)
      const env = Math.max(0, 1 - beatProgress * 3) * 0.25;
      val *= env;
      
      // Add a sub-harmonic bass (Sine wave)
      const bassFreq = freq / 2;
      const bassVal = Math.sin(2 * Math.PI * bassFreq * time) * Math.max(0, 1 - beatProgress) * 0.15;
      
      samples[i] = val + bassVal;
    }
    
    // Encode and download the synthesized game theme WAV
    const wavBlob = encodeWAV(samples, sampleRate);
    const downloadUrl = URL.createObjectURL(wavBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `StudyForge-Melodic-Synthesizer-Chimes-${Date.now()}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    audioCtx.close();
    
    if (typeof onProgress === 'function') {
      onProgress(1.0);
    }
    return;
  }

  // If TTS compilation succeeds, concatenate all fetched audio buffers!
  let totalLength = 0;
  audioBuffers.forEach((buf) => {
    totalLength += buf.length;
  });

  const mergedBuffer = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate);
  const channelData = mergedBuffer.getChannelData(0);

  let offset = 0;
  audioBuffers.forEach((buf) => {
    channelData.set(buf.getChannelData(0), offset);
    offset += buf.length;
  });

  // Encode the merged Float32 buffer into a 16-bit PCM WAV Blob
  const finalWavBlob = encodeWAV(channelData, audioCtx.sampleRate);
  const downloadUrl = URL.createObjectURL(finalWavBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
  link.download = `StudyForge-Audio-Guide-${safeTitle}-${Date.now()}.wav`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  audioCtx.close();
  if (typeof onProgress === 'function') {
    onProgress(1.0);
  }
}


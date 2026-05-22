/**
 * @module pdfExport
 * @description Export quiz results to a professionally formatted PDF document.
 * Uses jsPDF for generation. The output includes a title page, per-question
 * breakdowns with color-coded results, and page numbers.
 */

import jsPDF from 'jspdf';

/** Page dimensions and layout constants (A4, points). */
const PAGE = {
  WIDTH: 210,
  HEIGHT: 297,
  MARGIN_X: 20,
  MARGIN_TOP: 25,
  MARGIN_BOTTOM: 25,
  LINE_HEIGHT: 7,
};

const CONTENT_WIDTH = PAGE.WIDTH - PAGE.MARGIN_X * 2;

/** Color palette. */
const COLORS = {
  PRIMARY: [41, 98, 255],    // StudyForge blue
  CORRECT: [34, 139, 34],    // Forest green
  INCORRECT: [220, 53, 69],  // Red
  TEXT: [33, 37, 41],         // Dark gray
  MUTED: [108, 117, 125],    // Gray
  WHITE: [255, 255, 255],
};

/**
 * @typedef {Object} QuizResult
 * @property {number}  questionIndex - Index of the question.
 * @property {string}  userAnswer    - The user's submitted answer.
 * @property {boolean} isCorrect     - Whether the answer was correct.
 * @property {number}  [score]       - Score (0‑100) from AI grading.
 */

/**
 * @typedef {Object} QuizData
 * @property {string}        title     - Quiz title.
 * @property {Array<object>} questions - Array of question objects.
 */

/**
 * @typedef {Object} QuizResults
 * @property {number}        score   - Overall percentage score (0‑100).
 * @property {QuizResult[]}  answers - Per-question results.
 */

/**
 * Export quiz data and results to a downloadable PDF.
 *
 * @param {QuizData}    quizData - The quiz content (title + questions).
 * @param {QuizResults} results  - The user's results and per-question answers.
 * @returns {Promise<void>} Resolves once the PDF has been saved/downloaded.
 */
export async function exportQuizToPDF(quizData, results) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let currentY = PAGE.MARGIN_TOP;

  // -----------------------------------------------------------------------
  // Title Page
  // -----------------------------------------------------------------------
  const title = quizData.title || 'StudyForge Quiz';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Brand name
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.MUTED);
  doc.text('StudyForge', PAGE.WIDTH / 2, 60, { align: 'center' });

  // Quiz title
  doc.setFontSize(26);
  doc.setTextColor(...COLORS.PRIMARY);
  const wrappedTitle = doc.splitTextToSize(title, CONTENT_WIDTH);
  doc.text(wrappedTitle, PAGE.WIDTH / 2, 80, { align: 'center' });

  // Date
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.MUTED);
  doc.text(dateStr, PAGE.WIDTH / 2, 100 + wrappedTitle.length * 10, { align: 'center' });

  // Score summary
  const scoreY = 120 + wrappedTitle.length * 10;
  const overallScore = results.score ?? 0;
  const scoreColor = overallScore >= 70 ? COLORS.CORRECT : COLORS.INCORRECT;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(48);
  doc.setTextColor(...scoreColor);
  doc.text(`${Math.round(overallScore)}%`, PAGE.WIDTH / 2, scoreY, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor(...COLORS.MUTED);
  doc.text('Overall Score', PAGE.WIDTH / 2, scoreY + 12, { align: 'center' });

  // Question count
  const totalQ = quizData.questions.length;
  const correctCount = results.answers.filter((a) => a.isCorrect).length;
  doc.setFontSize(12);
  doc.text(`${correctCount} of ${totalQ} questions correct`, PAGE.WIDTH / 2, scoreY + 24, {
    align: 'center',
  });

  addPageNumber(doc, 1);

  // -----------------------------------------------------------------------
  // Question Pages
  // -----------------------------------------------------------------------
  let pageNum = 2;
  doc.addPage();
  currentY = PAGE.MARGIN_TOP;

  for (let i = 0; i < quizData.questions.length; i++) {
    const question = quizData.questions[i];
    const answer = results.answers.find((a) => a.questionIndex === i) || results.answers[i];
    const isCorrect = answer?.isCorrect ?? false;

    // Estimate space needed for this question block (rough)
    const estimatedHeight = estimateQuestionHeight(doc, question, answer);
    if (currentY + estimatedHeight > PAGE.HEIGHT - PAGE.MARGIN_BOTTOM) {
      addPageNumber(doc, pageNum++);
      doc.addPage();
      currentY = PAGE.MARGIN_TOP;
    }

    // Question number + status indicator
    const statusIcon = isCorrect ? '✓' : '✗';
    const statusColor = isCorrect ? COLORS.CORRECT : COLORS.INCORRECT;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...statusColor);
    doc.text(`${statusIcon}  Question ${i + 1}`, PAGE.MARGIN_X, currentY);

    // Type badge
    const typeLabel = formatQuestionType(question.type);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.MUTED);
    doc.text(typeLabel, PAGE.WIDTH - PAGE.MARGIN_X, currentY, { align: 'right' });
    currentY += PAGE.LINE_HEIGHT + 2;

    // Question text
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.TEXT);
    const wrappedQ = doc.splitTextToSize(question.question, CONTENT_WIDTH);
    doc.text(wrappedQ, PAGE.MARGIN_X, currentY);
    currentY += wrappedQ.length * PAGE.LINE_HEIGHT + 2;

    // Options (for multiple choice)
    if (question.options && question.options.length > 0) {
      doc.setFontSize(10);
      for (const opt of question.options) {
        const isCorrectOpt = opt === question.correctAnswer;
        const isUserChoice = opt === answer?.userAnswer;

        if (isCorrectOpt) {
          doc.setTextColor(...COLORS.CORRECT);
          doc.setFont('Helvetica', 'bold');
        } else if (isUserChoice && !isCorrect) {
          doc.setTextColor(...COLORS.INCORRECT);
          doc.setFont('Helvetica', 'normal');
        } else {
          doc.setTextColor(...COLORS.TEXT);
          doc.setFont('Helvetica', 'normal');
        }

        const prefix = isCorrectOpt ? '● ' : isUserChoice ? '○ ' : '  ';
        const optLines = doc.splitTextToSize(`${prefix}${opt}`, CONTENT_WIDTH - 5);
        doc.text(optLines, PAGE.MARGIN_X + 5, currentY);
        currentY += optLines.length * 5 + 1;
      }
      currentY += 2;
    }

    // User answer (for non-MC types)
    if (!question.options || question.options.length === 0) {
      currentY = renderLabeledText(doc, 'Your Answer:', answer?.userAnswer || '(no answer)', currentY, isCorrect ? COLORS.CORRECT : COLORS.INCORRECT);
    }

    // Correct answer
    currentY = renderLabeledText(doc, 'Correct Answer:', question.correctAnswer, currentY, COLORS.CORRECT);

    // Explanation
    if (question.explanation) {
      currentY = renderLabeledText(doc, 'Explanation:', question.explanation, currentY, COLORS.MUTED);
    }

    // Separator line
    currentY += 3;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(PAGE.MARGIN_X, currentY, PAGE.WIDTH - PAGE.MARGIN_X, currentY);
    currentY += 8;
  }

  addPageNumber(doc, pageNum);

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------
  const safeName = title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
  doc.save(`StudyForge-${safeName}-${Date.now()}.pdf`);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Render a labeled text block (e.g. "Correct Answer: …") and return the new Y position.
 *
 * @param {jsPDF}    doc
 * @param {string}   label
 * @param {string}   text
 * @param {number}   y
 * @param {number[]} valueColor - RGB color for the value text.
 * @returns {number} Updated Y position.
 */
function renderLabeledText(doc, label, text, y, valueColor) {
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.MUTED);
  doc.text(label, PAGE.MARGIN_X, y);
  y += PAGE.LINE_HEIGHT;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...valueColor);
  const wrapped = doc.splitTextToSize(String(text), CONTENT_WIDTH - 5);
  doc.text(wrapped, PAGE.MARGIN_X + 5, y);
  y += wrapped.length * 5 + 3;

  return y;
}

/**
 * Estimate the vertical space a question block will occupy (in mm).
 *
 * @param {jsPDF}  doc
 * @param {object} question
 * @param {object} answer
 * @returns {number}
 */
function estimateQuestionHeight(doc, question, answer) {
  let height = 30; // base (number line + separator + padding)
  doc.setFontSize(11);
  height += doc.splitTextToSize(question.question, CONTENT_WIDTH).length * PAGE.LINE_HEIGHT;

  if (question.options) {
    height += question.options.length * 7;
  }

  if (question.explanation) {
    doc.setFontSize(10);
    height += doc.splitTextToSize(question.explanation, CONTENT_WIDTH - 5).length * 5 + 10;
  }

  if (answer?.userAnswer) {
    height += 14;
  }

  return height;
}

/**
 * Format a question type code into a human-readable label.
 *
 * @param {string} type
 * @returns {string}
 */
function formatQuestionType(type) {
  const labels = {
    mc: 'Multiple Choice',
    tf: 'True / False',
    matching: 'Matching',
    fill: 'Fill in the Blank',
    short: 'Short Answer',
  };
  return labels[type] || type;
}

/**
 * Add a page number footer to the current page.
 *
 * @param {jsPDF} doc
 * @param {number} num
 */
function addPageNumber(doc, num) {
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.MUTED);
  doc.text(`Page ${num}`, PAGE.WIDTH / 2, PAGE.HEIGHT - 10, { align: 'center' });
}

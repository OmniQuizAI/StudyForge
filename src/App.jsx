import { useState, useEffect, useRef } from 'react';
import { useQuiz } from './contexts/QuizContext';
import { useTheme } from './contexts/ThemeContext';
import { useLanguage } from './contexts/LanguageContext';

// Services
import {
  setApiKey,
  getApiKey,
  hasApiKey,
  generateQuiz,
  gradeAnswer,
  researchTopic
} from './services/geminiService';
import { processFile } from './services/fileProcessor';
import { exportQuizToPDF } from './services/pdfExport';
import {
  speakText,
  stopSpeaking,
  isSpeechSupported,
  exportQuizToAudio,
  stopQuizAudio,
  exportQuizToWavFile
} from './services/audioExport';
import { encodeQuiz, decodeQuiz } from './services/quizCodec';

export default function App() {
  const { state, dispatch } = useQuiz();
  const { theme, toggleTheme } = useTheme();
  const { lang, t, changeLanguage, availableLanguages } = useLanguage();

  // Toast System
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Global Modals & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getApiKey() || '');
  const [recentQuizzes, setRecentQuizzes] = useState([]);

  // Source Input states
  const [sourceTab, setSourceTab] = useState('paste');
  const [pasteText, setPasteText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [researchTopicInput, setResearchTopicInput] = useState('');
  const [researchedText, setResearchedText] = useState('');
  const [researchedTitle, setResearchedTitle] = useState('');
  const [researchedSources, setResearchedSources] = useState([]);
  const [shareCodeInput, setShareCodeInput] = useState('');

  // Sourcing loading indicators
  const [processingFile, setProcessingFile] = useState(false);
  const [researching, setResearching] = useState(false);

  // Quiz Gameplay details
  const [quizTimer, setQuizTimer] = useState(0);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [fillBlankAnswers, setFillBlankAnswers] = useState({});
  const [shortAnswerText, setShortAnswerText] = useState('');
  const [isGradingAI, setIsGradingAI] = useState(false);
  const [aiGradingResult, setAiGradingResult] = useState(null); // { score, feedback, isCorrect }

  // Matching Game local states
  const [matchingLeft, setMatchingLeft] = useState([]);
  const [matchingRight, setMatchingRight] = useState([]);
  const [selectedLeft, setSelectedLeft] = useState(null); // term string
  const [selectedRight, setSelectedRight] = useState(null); // definition string
  const [matchedPairs, setMatchedPairs] = useState([]); // Array of term strings
  const [wrongPairs, setWrongPairs] = useState([]); // Array of strings (terms/definitions) currently shaking

  // Results review & tools
  const [activeReviewIdx, setActiveReviewIdx] = useState(null);
  const [wavExportProgress, setWavExportProgress] = useState(null); // null or 0.0 - 1.0

  // Flashcards state
  const [flashcardIdx, setFlashcardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [cardSwipeClass, setCardSwipeClass] = useState('');
  const [flashcardDeck, setFlashcardDeck] = useState([]);
  const [gotItCards, setGotItCards] = useState([]);

  // Audio / Voice Live Quiz state
  const [isLiveSpeaking, setIsLiveSpeaking] = useState(false);
  const [isLiveListening, setIsLiveListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [liveAIStatus, setLiveAIStatus] = useState('Welcome! Press Start to play.');
  const recognitionRef = useRef(null);
  const liveAudioStateRef = useRef({
    currentIndex: 0,
    srsQueue: [],
    correctCount: 0,
    answers: {},
    isRetrying: false,
    questions: []
  });

  // Timer Ref
  const timerIntervalRef = useRef(null);

  // Load Recent Quizzes on mount
  useEffect(() => {
    const list = localStorage.getItem('studyforge_recent_quizzes');
    if (list) {
      try {
        setRecentQuizzes(JSON.parse(list));
      } catch {
        setRecentQuizzes([]);
      }
    }
  }, [state.view]);

  // Quiz Gameplay count-up timer
  useEffect(() => {
    if (state.view === 'quiz' && !state.endTime) {
      timerIntervalRef.current = setInterval(() => {
        setQuizTimer((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [state.view, state.endTime]);

  // Sync state questions or reset timers on start
  useEffect(() => {
    if (state.view === 'quiz') {
      setQuizTimer(0);
      setIsAnswerChecked(false);
      setSelectedOption(null);
      setFillBlankAnswers({});
      setShortAnswerText('');
      setAiGradingResult(null);
      setMatchedPairs([]);
      setWrongPairs([]);
      setSelectedLeft(null);
      setSelectedRight(null);
      setupMatchingQuestion();
    }
  }, [state.currentIndex, state.view]);

  // Set up matching pairs when question changes
  const setupMatchingQuestion = () => {
    const q = state.questions[state.currentIndex];
    if (q && q.type === 'matching' && Array.isArray(q.pairs)) {
      // Shuffle terms & definitions separately
      const terms = q.pairs.map((p) => p.left);
      const definitions = q.pairs.map((p) => p.right);
      setMatchingLeft([...terms].sort(() => Math.random() - 0.5));
      setMatchingRight([...definitions].sort(() => Math.random() - 0.5));
    }
  };

  // ---------------------------------------------------------------------------
  // Global Actions
  // ---------------------------------------------------------------------------

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput);
    addToast(t('settings.saved'), 'success');
    setShowSettings(false);
  };

  const handleMascotClick = () => {
    const motivationalMessages = [
      "Keep pushing! You're doing amazing! 🦉",
      "Mastery is built step by step. Let's learn! 💪",
      "Studies show that StudyForge users are 110% cooler. 🔥",
      "Mistakes are just proof that you're trying. Let's embrace SRS! 🌟",
      "Ready to absolutely crush your exam? Let's go! 🚀"
    ];
    const msg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
    addToast(msg, 'info');
  };

  // Save quiz to recent list
  const saveQuizToRecent = (title, questions, config) => {
    const list = localStorage.getItem('studyforge_recent_quizzes');
    let recent = [];
    if (list) {
      try { recent = JSON.parse(list); } catch { recent = []; }
    }
    // Remove duplicate by title
    recent = recent.filter((q) => q.title !== title);
    recent.unshift({
      title,
      questionsCount: questions.length,
      config,
      date: new Date().toLocaleDateString(),
      code: encodeQuiz({ title, questions, config })
    });
    // Cap at 6
    recent = recent.slice(0, 6);
    localStorage.setItem('studyforge_recent_quizzes', JSON.stringify(recent));
    setRecentQuizzes(recent);
  };

  // ---------------------------------------------------------------------------
  // Sourcing & Processing Content
  // ---------------------------------------------------------------------------

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileProcessing(file);
  };

  const handleFileBrowse = async (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileProcessing(file);
  };

  const handleFileProcessing = async (file) => {
    if (!hasApiKey()) {
      addToast(t('errors.apiKeyRequired'), 'error');
      setShowSettings(true);
      return;
    }
    setProcessingFile(true);
    try {
      const result = await processFile(file);
      dispatch({
        type: 'SET_SOURCE',
        payload: {
          text: result.text,
          type: 'file',
          title: file.name.substring(0, file.name.lastIndexOf('.')) || file.name
        }
      });
      addToast(t('common.success'), 'success');
      dispatch({ type: 'SET_VIEW', payload: 'config' });
    } catch (err) {
      addToast(err.message || t('errors.invalidFile'), 'error');
    } finally {
      setProcessingFile(false);
    }
  };

  const handleAIResearch = async () => {
    if (!researchTopicInput.trim()) return;
    if (!hasApiKey()) {
      addToast(t('errors.apiKeyRequired'), 'error');
      setShowSettings(true);
      return;
    }
    setResearching(true);
    try {
      const result = await researchTopic(researchTopicInput);
      setResearchedTitle(result.title);
      setResearchedText(result.content);
      setResearchedSources(result.sources);
      addToast(t('common.success'), 'success');
    } catch (err) {
      addToast(t('errors.networkError') + ': ' + err.message, 'error');
    } finally {
      setResearching(false);
    }
  };

  const handleConfirmAIResearch = () => {
    dispatch({
      type: 'SET_SOURCE',
      payload: {
        text: researchedText,
        type: 'research',
        title: researchedTitle
      }
    });
    setResearchedText('');
    dispatch({ type: 'SET_VIEW', payload: 'config' });
  };

  const handleLoadFromCode = () => {
    if (!shareCodeInput.trim()) return;
    const decoded = decodeQuiz(shareCodeInput);
    if (!decoded) {
      addToast(t('errors.invalidCode'), 'error');
      return;
    }
    dispatch({
      type: 'SET_SOURCE',
      payload: {
        text: decoded.sourceSummary || 'Imported from Code',
        type: 'code',
        title: decoded.title
      }
    });
    dispatch({ type: 'SET_QUESTIONS', payload: decoded.questions });
    dispatch({ type: 'SET_CONFIG', payload: decoded.config });
    addToast(t('common.success'), 'success');
    dispatch({ type: 'SET_VIEW', payload: 'quiz' });
  };

  const handleLoadRecent = (code) => {
    const decoded = decodeQuiz(code);
    if (!decoded) return;
    dispatch({
      type: 'SET_SOURCE',
      payload: {
        text: decoded.sourceSummary || 'Loaded from History',
        type: 'code',
        title: decoded.title
      }
    });
    dispatch({ type: 'SET_QUESTIONS', payload: decoded.questions });
    dispatch({ type: 'SET_CONFIG', payload: decoded.config });
    addToast(t('common.success'), 'success');
    dispatch({ type: 'SET_VIEW', payload: 'quiz' });
  };

  // ---------------------------------------------------------------------------
  // Quiz Generator & Config
  // ---------------------------------------------------------------------------

  const handleStartQuizGeneration = async () => {
    if (!hasApiKey()) {
      addToast(t('errors.apiKeyRequired'), 'error');
      setShowSettings(true);
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: { loading: true, message: t('config.generating') } });
    try {
      const quiz = await generateQuiz(state.sourceText, {
        questionTypes: state.config.questionTypes,
        count: state.config.questionCount,
        difficulty: state.config.difficulty
      });
      dispatch({ type: 'SET_QUESTIONS', payload: quiz.questions });
      saveQuizToRecent(state.quizTitle || 'AI Quiz', quiz.questions, state.config);
      addToast(t('common.success'), 'success');
      dispatch({ type: 'SET_VIEW', payload: 'quiz' });
    } catch (err) {
      addToast(t('errors.quizGenFailed') + ': ' + err.message, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: { loading: false } });
    }
  };

  // Toggle selected question types
  const handleToggleQuestionType = (type) => {
    const current = state.config.questionTypes;
    let next = [];
    if (current.includes(type)) {
      next = current.filter((t) => t !== type);
      if (next.length === 0) next = [type]; // Keep at least one
    } else {
      next = [...current, type];
    }
    dispatch({ type: 'SET_CONFIG', payload: { questionTypes: next } });
  };

  // ---------------------------------------------------------------------------
  // Interactive Gameplay Handlers
  // ---------------------------------------------------------------------------

  const handleCheckAnswer = async () => {
    const q = state.questions[state.currentIndex];
    let isCorrect = false;
    let score = 0;
    let feedback = '';

    if (q.type === 'mc' || q.type === 'tf') {
      isCorrect = selectedOption === q.correctAnswer;
      score = isCorrect ? 100 : 0;
      feedback = isCorrect ? t('quiz.correct') : `${t('quiz.incorrect')}. ${t('results.correctAnswer')}: ${q.correctAnswer}`;
      
      dispatch({
        type: 'SET_ANSWER',
        payload: { index: state.currentIndex, answer: selectedOption }
      });
    }

    if (q.type === 'fill') {
      // blanks is array of expected strings
      const expected = q.blanks || [];
      const answers = [];
      let correctBlanks = 0;
      for (let bIdx = 0; bIdx < expected.length; bIdx++) {
        const studentAns = (fillBlankAnswers[bIdx] || '').trim();
        const expectedAns = expected[bIdx].trim();
        answers.push(studentAns);
        if (studentAns.toLowerCase() === expectedAns.toLowerCase()) {
          correctBlanks++;
        }
      }
      isCorrect = correctBlanks === expected.length;
      score = Math.round((correctBlanks / expected.length) * 100);
      feedback = isCorrect
        ? t('quiz.correct')
        : `${t('quiz.incorrect')}. ${t('results.correctAnswer')}: ${expected.join(', ')}`;

      dispatch({
        type: 'SET_ANSWER',
        payload: { index: state.currentIndex, answer: answers.join(', ') }
      });
    }

    if (q.type === 'short') {
      setIsGradingAI(true);
      try {
        const grade = await gradeAnswer(q.question, shortAnswerText, q.correctAnswer);
        isCorrect = grade.isCorrect;
        score = grade.score;
        feedback = grade.feedback;
        setAiGradingResult({ score, feedback, isCorrect });
      } catch {
        // Fallback simple grade
        const isSimCorrect = shortAnswerText.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        isCorrect = isSimCorrect;
        score = isCorrect ? 100 : 40;
        feedback = isCorrect ? t('quiz.correct') : 'Grading offline: Word-for-word mismatch.';
        setAiGradingResult({ score, feedback, isCorrect });
      } finally {
        setIsGradingAI(false);
      }

      dispatch({
        type: 'SET_ANSWER',
        payload: { index: state.currentIndex, answer: shortAnswerText }
      });
    }

    if (q.type === 'matching') {
      isCorrect = matchedPairs.length === q.pairs.length;
      score = isCorrect ? 100 : Math.round((matchedPairs.length / q.pairs.length) * 100);
      feedback = isCorrect ? t('quiz.correct') : 'Not all items were paired correctly.';

      dispatch({
        type: 'SET_ANSWER',
        payload: { index: state.currentIndex, answer: `Matched ${matchedPairs.length} of ${q.pairs.length}` }
      });
    }

    // Set results
    const pointsMultiplier = state.isRetrying ? 0.5 : 1.0;
    const finalPoints = (score >= 70 ? 1 : 0) * pointsMultiplier;
    
    dispatch({
      type: 'SET_RESULT',
      payload: {
        index: state.currentIndex,
        result: {
          correct: score >= 70,
          score,
          feedback,
          points: finalPoints
        }
      }
    });

    // Spaced Repetition logic
    if (score < 70) {
      dispatch({ type: 'ADD_TO_SRS', payload: state.currentIndex });
      dispatch({ type: 'INCREMENT_SRS_ATTEMPT', payload: state.currentIndex });
    }

    setIsAnswerChecked(true);
  };

  const handleNextQuestion = () => {
    // Check if we are in intermittent SRS and have items to inject
    const nextIdx = state.currentIndex + 1;
    const hasMoreNormal = nextIdx < state.questions.length;

    // INTERMITTENT SRS: Re-present failed questions every 2 questions if queue has items
    if (state.config.srsMode === 'intermittent' && state.srsQueue.length > 0 && nextIdx % 2 === 0) {
      const nextSrsIdx = state.srsQueue[0];
      // Dequeue
      dispatch({ type: 'SET_SRS_QUEUE', payload: state.srsQueue.slice(1) });
      dispatch({ type: 'SET_RETRYING', payload: true });
      dispatch({ type: 'SET_CURRENT_INDEX', payload: nextSrsIdx });
      return;
    }

    if (hasMoreNormal) {
      dispatch({ type: 'SET_RETRYING', payload: false });
      dispatch({ type: 'SET_CURRENT_INDEX', payload: nextIdx });
    } else {
      // END OF NORMAL QUESTIONS: Check for "At End" SRS Queue
      if (state.config.srsMode === 'end' && state.srsQueue.length > 0) {
        const nextSrsIdx = state.srsQueue[0];
        dispatch({ type: 'SET_SRS_QUEUE', payload: state.srsQueue.slice(1) });
        dispatch({ type: 'SET_RETRYING', payload: true });
        dispatch({ type: 'SET_CURRENT_INDEX', payload: nextSrsIdx });
      } else {
        // Complete Quiz!
        dispatch({ type: 'FINISH_QUIZ' });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Matching Game Logic
  // ---------------------------------------------------------------------------

  const handlePairClick = (item, side) => {
    if (side === 'left') {
      if (matchedPairs.includes(item)) return;
      setSelectedLeft(item);
      if (selectedRight) checkMatchingPair(item, selectedRight);
    } else {
      const q = state.questions[state.currentIndex];
      const pairedTerm = q.pairs.find((p) => p.right === item)?.left;
      if (matchedPairs.includes(pairedTerm)) return;
      setSelectedRight(item);
      if (selectedLeft) checkMatchingPair(selectedLeft, item);
    }
  };

  const checkMatchingPair = (leftVal, rightVal) => {
    const q = state.questions[state.currentIndex];
    const pair = q.pairs.find((p) => p.left === leftVal && p.right === rightVal);
    
    if (pair) {
      // Match!
      setMatchedPairs((prev) => [...prev, leftVal]);
      setSelectedLeft(null);
      setSelectedRight(null);
      
      // Auto check answer if all matched
      if (matchedPairs.length + 1 === q.pairs.length) {
        // Delay checking slightly for animations
        setTimeout(() => {
          setIsAnswerChecked(true);
          dispatch({
            type: 'SET_ANSWER',
            payload: { index: state.currentIndex, answer: `Matched all ${q.pairs.length} pairs` }
          });
          dispatch({
            type: 'SET_RESULT',
            payload: {
              index: state.currentIndex,
              result: { correct: true, score: 100, feedback: t('quiz.correct'), points: state.isRetrying ? 0.5 : 1 }
            }
          });
        }, 600);
      }
    } else {
      // Mismatch
      setWrongPairs([leftVal, rightVal]);
      setSelectedLeft(null);
      setSelectedRight(null);
      setTimeout(() => {
        setWrongPairs([]);
      }, 800);
    }
  };

  // ---------------------------------------------------------------------------
  // Results scoring & Exporters
  // ---------------------------------------------------------------------------

  // Compute total points and percentages
  const getScoringSummary = () => {
    let earned = 0;
    const answers = [];
    const totalQ = state.questions.length;

    for (let i = 0; i < totalQ; i++) {
      const res = state.results[i];
      const ans = state.answers[i] || '';
      
      if (res) {
        earned += res.points ?? 0;
        answers.push({
          questionIndex: i,
          userAnswer: ans,
          isCorrect: res.correct,
          score: res.score
        });
      } else {
        answers.push({
          questionIndex: i,
          userAnswer: '(no answer)',
          isCorrect: false,
          score: 0
        });
      }
    }

    const maxPoints = totalQ; // 1.0 per question
    const percentage = Math.round((earned / maxPoints) * 100) || 0;
    
    let grade = 'F';
    let msgKey = 'results.tryAgain';
    if (percentage >= 95) { grade = 'A+'; msgKey = 'results.perfect'; }
    else if (percentage >= 90) { grade = 'A'; msgKey = 'results.great'; }
    else if (percentage >= 80) { grade = 'B'; msgKey = 'results.great'; }
    else if (percentage >= 70) { grade = 'C'; msgKey = 'results.good'; }
    else if (percentage >= 50) { grade = 'D'; msgKey = 'results.needsWork'; }

    return { score: percentage, grade, message: t(msgKey), earned, maxPoints, answers };
  };

  const handleExportPDF = async () => {
    const summary = getScoringSummary();
    addToast('Generating PDF guide...', 'info');
    try {
      await exportQuizToPDF(
        { title: state.quizTitle || 'StudyForge Quiz', questions: state.questions },
        { score: summary.score, answers: summary.answers }
      );
      addToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      addToast('PDF Export failed: ' + err.message, 'error');
    }
  };

  const handleExportWav = async () => {
    setWavExportProgress(0.01);
    addToast('Compiling offline WAV audio...', 'info');
    try {
      await exportQuizToWavFile(
        { title: state.quizTitle || 'StudyForge Review', questions: state.questions },
        lang,
        (progress) => setWavExportProgress(progress)
      );
      addToast('WAV file downloaded successfully!', 'success');
    } catch (err) {
      addToast('Audio Compilation failed: ' + err.message, 'error');
    } finally {
      setWavExportProgress(null);
    }
  };

  const handleShareQuizCode = () => {
    const summary = getScoringSummary();
    try {
      const code = encodeQuiz({
        title: state.quizTitle || 'Shared Quiz',
        questions: state.questions,
        config: state.config
      });
      navigator.clipboard.writeText(code);
      addToast(t('common.copied'), 'success');
    } catch (err) {
      addToast('Failed to copy: ' + err.message, 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // Flashcards Study View
  // ---------------------------------------------------------------------------

  const startFlashcards = () => {
    setFlashcardIdx(0);
    setIsCardFlipped(false);
    setCardSwipeClass('');
    setGotItCards([]);
    setFlashcardDeck([...state.questions].sort(() => Math.random() - 0.5));
    dispatch({ type: 'SET_VIEW', payload: 'flashcards' });
  };

  const handleSwipeCard = (known) => {
    setCardSwipeClass(known ? 'flashcard-swipe-right' : 'flashcard-swipe-left');
    
    setTimeout(() => {
      if (known) {
        setGotItCards((prev) => [...prev, flashcardDeck[flashcardIdx]]);
      }
      
      if (flashcardIdx + 1 < flashcardDeck.length) {
        setIsCardFlipped(false);
        setCardSwipeClass('');
        setFlashcardIdx((idx) => idx + 1);
      } else {
        setFlashcardIdx((idx) => idx + 1); // Finished screen
      }
    }, 450);
  };

  // ---------------------------------------------------------------------------
  // Audio Conversational Live Mode
  // ---------------------------------------------------------------------------

  const startLiveAudioQuiz = () => {
    if (!isSpeechSupported()) {
      addToast('Speech API is not supported in this browser.', 'error');
      return;
    }
    
    // Stop any standard playback
    stopSpeaking();
    
    // Setup state ref for recognition callback access
    liveAudioStateRef.current = {
      currentIndex: 0,
      srsQueue: [],
      correctCount: 0,
      answers: {},
      isRetrying: false,
      questions: state.questions
    };

    dispatch({ type: 'SET_VIEW', payload: 'audio' });
    setLiveAIStatus('Ready to start hands-free study!');
  };

  const toggleLiveAudioSession = () => {
    if (isLiveSpeaking || isLiveListening) {
      // Stop session
      handleStopLiveAudio();
    } else {
      // Start session
      handleStartLiveAudio();
    }
  };

  const handleStopLiveAudio = () => {
    stopSpeaking();
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.stop();
    }
    setIsLiveListening(false);
    setIsLiveSpeaking(false);
    setLiveAIStatus('Audio quiz stopped.');
  };

  const handleStartLiveAudio = async () => {
    const s = liveAudioStateRef.current;
    setIsLiveSpeaking(true);
    setLiveAIStatus('StudyForge Audio Master active.');

    await speakWithStatus(`Starting study review. I will read a question, and when the circle turns purple, speak your answer. You can say: skip, give me a hint, repeat that, or I don't know.`);
    
    playNextLiveAudioQuestion();
  };

  const speakWithStatus = (text) => {
    setIsLiveSpeaking(true);
    setIsLiveListening(false);
    return speakText(text, {
      lang: lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US',
      onEnd: () => {
        setIsLiveSpeaking(false);
      }
    });
  };

  const playNextLiveAudioQuestion = async () => {
    const s = liveAudioStateRef.current;
    
    if (s.currentIndex >= s.questions.length) {
      if (s.srsQueue.length > 0) {
        await speakWithStatus(`Re-presenting ${s.srsQueue.length} questions from spaced repetition.`);
        s.questions = s.srsQueue.map(idx => state.questions[idx]);
        s.srsQueue = [];
        s.currentIndex = 0;
        s.isRetrying = true;
      } else {
        await speakWithStatus(`Quiz completed! You answered ${s.correctCount} questions correctly. Great studying!`);
        handleStopLiveAudio();
        dispatch({ type: 'FINISH_QUIZ' });
        return;
      }
    }

    const q = s.questions[s.currentIndex];
    setLiveAIStatus(`Question ${s.currentIndex + 1} of ${s.questions.length}`);
    
    let speechPrompt = `Question ${s.currentIndex + 1}. ${q.question}`;
    if (q.type === 'mc' && Array.isArray(q.options)) {
      const letters = ['A', 'B', 'C', 'D'];
      speechPrompt += '. Your options are: ';
      q.options.forEach((opt, oIdx) => {
        speechPrompt += `${letters[oIdx]}. ${opt}. `;
      });
    } else if (q.type === 'tf') {
      speechPrompt += '. True, or False?';
    }

    await speakWithStatus(speechPrompt);
    startSpeechRecognition();
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recog = new SpeechRecognition();
    recognitionRef.current = recog;
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US';

    recog.onstart = () => {
      setIsLiveListening(true);
      setLiveTranscript('');
      setLiveAIStatus('Listening for your answer...');
    };

    recog.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript || '';
      setLiveTranscript(result);
      processLiveVoiceInput(result);
    };

    recog.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      setIsLiveListening(false);
      // Retry silent listening or proceed
      if (event.error === 'no-speech') {
        speakWithStatus("I didn't hear anything. Repeat that?").then(() => startSpeechRecognition());
      }
    };

    recog.onend = () => {
      setIsLiveListening(false);
    };

    recog.start();
  };

  const processLiveVoiceInput = async (voiceText) => {
    const text = voiceText.toLowerCase().trim();
    const s = liveAudioStateRef.current;
    const q = s.questions[s.currentIndex];

    // Voice commands
    if (text.includes('hint') || text.includes('clue') || text.includes('pista') || text.includes('indice')) {
      const hint = q.explanation || "Try your best guess!";
      await speakWithStatus(`Hint: ${hint}`);
      startSpeechRecognition();
      return;
    }

    if (text.includes('repeat') || text.includes('répéter') || text.includes('repetir')) {
      playNextLiveAudioQuestion();
      return;
    }

    if (text.includes('skip') || text.includes('passer') || text.includes('saltar')) {
      await speakWithStatus("Skipping question.");
      s.currentIndex++;
      playNextLiveAudioQuestion();
      return;
    }

    if (text.includes("don't know") || text.includes("no sé") || text.includes("sais pas")) {
      await speakWithStatus(`No worries! The correct answer is ${q.correctAnswer}. ${q.explanation || ''}`);
      s.srsQueue.push(s.currentIndex); // Add to SRS
      s.currentIndex++;
      playNextLiveAudioQuestion();
      return;
    }

    // Evaluate answer
    let isCorrect = false;

    if (q.type === 'mc') {
      // Check if user said "A", "B", "C", "D" or match options
      const optLetters = ['a', 'b', 'c', 'd'];
      const spokeLetterIdx = optLetters.indexOf(text[0]);
      if (spokeLetterIdx !== -1 && q.options[spokeLetterIdx]) {
        isCorrect = q.options[spokeLetterIdx] === q.correctAnswer;
      } else {
        // Try option match
        isCorrect = q.options.some(opt => opt.toLowerCase().includes(text) && opt === q.correctAnswer);
      }
    } else if (q.type === 'tf') {
      const spokeTrue = text.includes('true') || text.includes('vrai') || text.includes('verdad');
      const spokeFalse = text.includes('false') || text.includes('faux') || text.includes('falso');
      const correctTrue = q.correctAnswer.toLowerCase() === 'true';
      isCorrect = (spokeTrue && correctTrue) || (spokeFalse && !correctTrue);
    } else {
      // Lenient fuzzy matches
      isCorrect = q.correctAnswer.toLowerCase().includes(text) || text.includes(q.correctAnswer.toLowerCase());
    }

    // Record response
    s.answers[s.currentIndex] = voiceText;
    
    if (isCorrect) {
      s.correctCount++;
      await speakWithStatus("Awesome! That is correct!");
    } else {
      s.srsQueue.push(s.currentIndex);
      await speakWithStatus(`Not quite. The correct answer was ${q.correctAnswer}.`);
    }

    s.currentIndex++;
    playNextLiveAudioQuestion();
  };

  // ---------------------------------------------------------------------------
  // Layout Helpers
  // ---------------------------------------------------------------------------

  const activeQuestion = state.questions[state.currentIndex];
  const totalQuestions = state.questions.length;
  const progressPercent = totalQuestions > 0 ? Math.round(((state.currentIndex) / totalQuestions) * 100) : 0;

  return (
    <div className="app-container">
      {/* Toast Drawer */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <div className="toast-message">{t.message}</div>
          </div>
        ))}
      </div>

      {/* Global Header */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo" onClick={() => dispatch({ type: 'RESET' })}>
            <div className="app-logo-icon">🦉</div>
            <span>StudyForge</span>
          </div>
        </div>
        <div className="app-header-right">
          {/* Theme switcher */}
          <button className="btn btn-secondary btn-icon" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          {/* Language selector */}
          <select
            className="input"
            style={{ width: '80px', padding: '6px' }}
            value={lang}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            {availableLanguages.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Settings modal gear */}
          <button className="btn btn-secondary btn-icon" onClick={() => setShowSettings(true)}>
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        
        {/* =====================================================================
            VIEW: HOME (Dashboard)
            ===================================================================== */}
        {state.view === 'home' && (
          <div className="home-container">
            <div className="home-hero">
              <div className="home-mascot" onClick={handleMascotClick}>🦉</div>
              <h1 className="home-title">
                {t('home.title')} <span className="home-title-gradient">AI</span>
              </h1>
              <p className="home-subtitle">{t('home.subtitle')}</p>
            </div>

            <div className="home-cards">
              <div
                className="card card-interactive home-card"
                onClick={() => {
                  setSourceTab('paste');
                  dispatch({ type: 'SET_VIEW', payload: 'input' });
                }}
              >
                <div className="home-card-icon home-card-icon-green">📝</div>
                <div className="home-card-title">{t('home.pasteText')}</div>
                <div className="home-card-desc">Type or paste articles manually</div>
              </div>

              <div
                className="card card-interactive home-card"
                onClick={() => {
                  setSourceTab('file');
                  dispatch({ type: 'SET_VIEW', payload: 'input' });
                }}
              >
                <div className="home-card-icon home-card-icon-purple">📁</div>
                <div className="home-card-title">{t('home.uploadFile')}</div>
                <div className="home-card-desc">Support PDFs, Word files & Images (OCR)</div>
              </div>

              <div
                className="card card-interactive home-card"
                onClick={() => {
                  setSourceTab('research');
                  dispatch({ type: 'SET_VIEW', payload: 'input' });
                }}
              >
                <div className="home-card-icon home-card-icon-gold">🔍</div>
                <div className="home-card-title">{t('home.aiResearch')}</div>
                <div className="home-card-desc">Grounded Google Search study helper</div>
              </div>

              <div
                className="card card-interactive home-card"
                onClick={() => {
                  setSourceTab('code');
                  dispatch({ type: 'SET_VIEW', payload: 'input' });
                }}
              >
                <div className="home-card-icon home-card-icon-blue">🔑</div>
                <div className="home-card-title">{t('home.loadCode')}</div>
                <div className="home-card-desc">Input a share code to resume sessions</div>
              </div>
            </div>

            {/* Recent list */}
            {recentQuizzes.length > 0 && (
              <div style={{ width: '100%' }}>
                <h3 className="label" style={{ marginBottom: '15px' }}>{t('home.recentQuizzes')}</h3>
                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {recentQuizzes.map((quiz, i) => (
                    <div key={i} className="card card-interactive" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => handleLoadRecent(quiz.code)}>
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{quiz.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{quiz.questionsCount} Questions • {quiz.date}</div>
                      </div>
                      <span style={{ fontSize: '20px' }}>🚀</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW: INPUT (Multi-Modal Sourcing Tabs)
            ===================================================================== */}
        {state.view === 'input' && (
          <div className="content-input-container card">
            <div className="tabs" style={{ marginBottom: '20px' }}>
              <button className={`tab ${sourceTab === 'paste' ? 'tab-active' : ''}`} onClick={() => setSourceTab('paste')}>
                {t('input.pasteTab')}
              </button>
              <button className={`tab ${sourceTab === 'file' ? 'tab-active' : ''}`} onClick={() => setSourceTab('file')}>
                {t('input.uploadTab')}
              </button>
              <button className={`tab ${sourceTab === 'research' ? 'tab-active' : ''}`} onClick={() => setSourceTab('research')}>
                {t('input.researchTab')}
              </button>
              <button className={`tab ${sourceTab === 'code' ? 'tab-active' : ''}`} onClick={() => setSourceTab('code')}>
                {t('input.codeTab')}
              </button>
            </div>

            <div className="content-input-body">
              
              {/* Tab: Paste Text */}
              {sourceTab === 'paste' && (
                <div>
                  <textarea
                    className="textarea"
                    placeholder={t('input.pastePlaceholder')}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="char-count">{t('input.charCount', { count: pasteText.length })}</div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '15px' }}
                    disabled={pasteText.trim().length < 40}
                    onClick={() => {
                      dispatch({
                        type: 'SET_SOURCE',
                        payload: { text: pasteText, type: 'paste', title: 'Text Note Quiz' }
                      });
                      dispatch({ type: 'SET_VIEW', payload: 'config' });
                    }}
                  >
                    {t('home.getStarted')}
                  </button>
                </div>
              )}

              {/* Tab: File Upload */}
              {sourceTab === 'file' && (
                <div>
                  {processingFile ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="audio-visualizer-ring" style={{ width: '60px', height: '60px', margin: '0 auto 15px', position: 'relative' }}></div>
                      <div>{t('input.charCount', { count: '' }).includes('char') ? 'Extracting text (OCR Vision auto-runs for scans & images)...' : t('input.extracting')}</div>
                    </div>
                  ) : (
                    <div
                      className={`upload-zone ${isDragOver ? 'upload-zone-active' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => document.getElementById('browse-input').click()}
                    >
                      <input id="browse-input" type="file" style={{ display: 'none' }} accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={handleFileBrowse} />
                      <div className="upload-zone-icon">📁</div>
                      <div className="upload-zone-text">{t('input.uploadDragDrop')}</div>
                      <div className="upload-zone-hint">PDF, DOCX, JPG, PNG, GIF, WEBP</div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: AI Research */}
              {sourceTab === 'research' && (
                <div>
                  {researching ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="audio-visualizer-ring" style={{ width: '60px', height: '60px', margin: '0 auto 15px', position: 'relative' }}></div>
                      <div>{t('input.researching')}</div>
                    </div>
                  ) : researchedText ? (
                    // Display researched document & citations before proceed
                    <div>
                      <h2 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '10px' }}>{researchedTitle}</h2>
                      <div className="textarea" style={{ minHeight: '260px', overflowY: 'auto', background: 'var(--color-bg-input)', padding: '15px', marginBottom: '15px', whiteSpace: 'pre-wrap' }}>
                        {researchedText}
                      </div>
                      
                      {researchedSources.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                          <h4 className="label">Sources Grounding</h4>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {researchedSources.map((s, idx) => (
                              <a key={idx} href={s.url} target="_blank" className="badge badge-blue">
                                🔗 {s.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setResearchedText('')}>
                          {t('common.cancel')}
                        </button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleConfirmAIResearch}>
                          Create Quiz
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        className="input"
                        placeholder={t('input.researchPlaceholder')}
                        value={researchTopicInput}
                        onChange={(e) => setResearchTopicInput(e.target.value)}
                        style={{ marginBottom: '15px' }}
                      />
                      <button className="btn btn-primary" style={{ width: '100%' }} disabled={!researchTopicInput.trim()} onClick={handleAIResearch}>
                        {t('input.researchButton')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Load Share Code */}
              {sourceTab === 'code' && (
                <div>
                  <textarea
                    className="textarea"
                    placeholder={t('input.codePlaceholder')}
                    value={shareCodeInput}
                    onChange={(e) => setShareCodeInput(e.target.value)}
                    style={{ minHeight: '100px' }}
                  />
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }} disabled={!shareCodeInput.trim()} onClick={handleLoadFromCode}>
                    {t('input.loadButton')}
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW: CONFIG (Customize Quiz)
            ===================================================================== */}
        {state.view === 'config' && (
          <div className="quiz-config-container card">
            <h2 className="content-input-title" style={{ textAlign: 'center', marginBottom: '25px' }}>{t('config.title')}</h2>

            {/* Types Selection */}
            <div className="config-section">
              <div className="config-section-title">📝 {t('config.questionTypes')}</div>
              <div className="config-checkbox-grid">
                {[
                  { id: 'mc', label: t('config.multipleChoice') },
                  { id: 'tf', label: t('config.trueFalse') },
                  { id: 'matching', label: t('config.matching') },
                  { id: 'fill', label: t('config.fillBlank') },
                  { id: 'short', label: t('config.shortAnswer') }
                ].map((type) => {
                  const active = state.config.questionTypes.includes(type.id);
                  return (
                    <div
                      key={type.id}
                      className={`config-checkbox ${active ? 'config-checkbox-active' : ''}`}
                      onClick={() => handleToggleQuestionType(type.id)}
                    >
                      <div className="config-checkbox-check">{active ? '✓' : ''}</div>
                      <span>{type.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Questions Slider count */}
            <div className="config-section">
              <div className="config-section-title">📊 {t('config.questionCount')}</div>
              <div className="config-slider-container">
                <input
                  type="range"
                  className="config-slider"
                  min="3"
                  max="100"
                  value={state.config.questionCount === 'auto' ? 10 : state.config.questionCount}
                  onChange={(e) => dispatch({ type: 'SET_CONFIG', payload: { questionCount: parseInt(e.target.value) } })}
                />
                <div className="config-slider-value">
                  {state.config.questionCount}
                </div>
              </div>
            </div>

            {/* Difficulty Calibration */}
            <div className="config-section">
              <div className="config-section-title">⚡ {t('config.difficulty')}</div>
              <div className="pill-selector">
                {[
                  { id: 'easy', label: t('config.easy'), class: 'pill-easy' },
                  { id: 'medium', label: t('config.medium'), class: 'pill-medium' },
                  { id: 'hard', label: t('config.hard'), class: 'pill-hard' }
                ].map((diff) => {
                  const active = state.config.difficulty === diff.id;
                  return (
                    <div
                      key={diff.id}
                      className={`pill ${diff.class} ${active ? 'pill-active' : ''}`}
                      onClick={() => dispatch({ type: 'SET_CONFIG', payload: { difficulty: diff.id } })}
                    >
                      {diff.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Learning Algorithms: SRS Mode */}
            <div className="config-section">
              <div className="config-section-title">🔄 {t('config.srsMode')} (Spaced Repetition)</div>
              <div className="pill-selector">
                {[
                  { id: 'none', label: t('config.srsNone') },
                  { id: 'end', label: t('config.srsAtEnd') },
                  { id: 'intermittent', label: t('config.srsIntermittent') }
                ].map((srs) => {
                  const active = state.config.srsMode === srs.id;
                  return (
                    <div
                      key={srs.id}
                      className={`pill ${active ? 'pill-active' : ''}`}
                      onClick={() => dispatch({ type: 'SET_CONFIG', payload: { srsMode: srs.id } })}
                    >
                      {srs.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Feedback correction Style */}
            <div className="config-section">
              <div className="config-section-title">📢 {t('config.correctionStyle')}</div>
              <div className="pill-selector">
                {[
                  { id: 'immediate', label: t('config.immediate') },
                  { id: 'end', label: t('config.endOnly') },
                  { id: 'both', label: t('config.both') }
                ].map((style) => {
                  const active = state.config.correctionStyle === style.id;
                  return (
                    <div
                      key={style.id}
                      className={`pill ${active ? 'pill-active' : ''}`}
                      onClick={() => dispatch({ type: 'SET_CONFIG', payload: { correctionStyle: style.id } })}
                    >
                      {style.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <button className="btn btn-primary start-quiz-btn btn-lg" onClick={handleStartQuizGeneration}>
              🚀 {t('config.startQuiz')}
            </button>
          </div>
        )}

        {/* =====================================================================
            VIEW: QUIZ PLAY (Gameplay Engine)
            ===================================================================== */}
        {state.view === 'quiz' && activeQuestion && (
          <div className="quiz-player-container">
            {/* Header progress info */}
            <div className="quiz-header">
              <div className="quiz-counter">
                {state.isRetrying && <span className="badge badge-purple" style={{ marginRight: '10px' }}>SRS Retry (0.5x Pt)</span>}
                {t('quiz.question')} {state.currentIndex + 1} {t('quiz.of')} {totalQuestions}
              </div>
              <div className="quiz-timer">
                ⏱️ {Math.floor(quizTimer / 60)}:{(quizTimer % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Progress bar */}
            <div className="progress-bar" style={{ marginBottom: '20px' }}>
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
              <div className="progress-bar-text">{progressPercent}%</div>
            </div>

            <div className="quiz-question-card card">
              {/* Question Type Tag */}
              <div style={{ marginBottom: '15px' }}>
                <span className={`badge ${
                  activeQuestion.type === 'mc' ? 'badge-green' :
                  activeQuestion.type === 'tf' ? 'badge-purple' :
                  activeQuestion.type === 'matching' ? 'badge-gold' :
                  activeQuestion.type === 'fill' ? 'badge-blue' : 'badge-red'
                }`}>
                  {activeQuestion.type.toUpperCase()}
                </span>
              </div>

              {/* Question Text */}
              <div className="quiz-question-text">{activeQuestion.question}</div>

              {/* RENDERER: Multiple Choice */}
              {activeQuestion.type === 'mc' && Array.isArray(activeQuestion.options) && (
                <div className="quiz-options">
                  {activeQuestion.options.map((opt, oIdx) => {
                    const letters = ['A', 'B', 'C', 'D'];
                    const isSelected = selectedOption === opt;
                    const isCorrectOpt = opt === activeQuestion.correctAnswer;
                    
                    let optClass = '';
                    if (isAnswerChecked) {
                      if (isCorrectOpt) optClass = 'quiz-option-correct';
                      else if (isSelected) optClass = 'quiz-option-incorrect';
                    } else if (isSelected) {
                      optClass = 'quiz-option-selected';
                    }

                    return (
                      <div
                        key={oIdx}
                        className={`quiz-option ${optClass}`}
                        onClick={() => {
                          if (isAnswerChecked) return;
                          setSelectedOption(opt);
                        }}
                      >
                        <div className="quiz-option-label">{letters[oIdx]}</div>
                        <div>{opt}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDERER: True / False */}
              {activeQuestion.type === 'tf' && (
                <div className="tf-options">
                  {['True', 'False'].map((val) => {
                    const isSelected = selectedOption === val;
                    const isCorrectOpt = val === activeQuestion.correctAnswer;
                    
                    let optClass = '';
                    if (isAnswerChecked) {
                      if (isCorrectOpt) optClass = 'quiz-option-correct';
                      else if (isSelected) optClass = 'quiz-option-incorrect';
                    } else if (isSelected) {
                      optClass = 'quiz-option-selected';
                    }

                    return (
                      <div
                        key={val}
                        className={`tf-option ${val === 'True' ? 'tf-true' : 'tf-false'} ${optClass}`}
                        onClick={() => {
                          if (isAnswerChecked) return;
                          setSelectedOption(val);
                        }}
                      >
                        {val}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDERER: Matching Game */}
              {activeQuestion.type === 'matching' && (
                <div>
                  <p className="upload-zone-hint" style={{ marginBottom: '15px', textAlign: 'center' }}>
                    {t('matching.instructions')}
                  </p>
                  <div className="matching-container">
                    <div className="matching-column">
                      <div className="matching-column-title">Terms</div>
                      {matchingLeft.map((term) => {
                        const isSelected = selectedLeft === term;
                        const isMatched = matchedPairs.includes(term);
                        const isWrong = wrongPairs.includes(term);
                        
                        return (
                          <div
                            key={term}
                            className={`matching-item ${
                              isMatched ? 'matching-item-matched' :
                              isWrong ? 'matching-item-wrong' :
                              isSelected ? 'matching-item-selected' : ''
                            }`}
                            onClick={() => handlePairClick(term, 'left')}
                          >
                            {term}
                          </div>
                        );
                      })}
                    </div>
                    <div className="matching-column">
                      <div className="matching-column-title">Definitions</div>
                      {matchingRight.map((def) => {
                        const q = state.questions[state.currentIndex];
                        const matchedTerm = q.pairs.find((p) => p.right === def)?.left;
                        
                        const isSelected = selectedRight === def;
                        const isMatched = matchedPairs.includes(matchedTerm);
                        const isWrong = wrongPairs.includes(def);

                        return (
                          <div
                            key={def}
                            className={`matching-item ${
                              isMatched ? 'matching-item-matched' :
                              isWrong ? 'matching-item-wrong' :
                              isSelected ? 'matching-item-selected' : ''
                            }`}
                            onClick={() => handlePairClick(def, 'right')}
                          >
                            {def}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* RENDERER: Fill in the Blank */}
              {activeQuestion.type === 'fill' && (
                <div>
                  <div className="fill-blank-text">
                    {activeQuestion.question.split('___').map((textPart, idx) => (
                      <span key={idx}>
                        {textPart}
                        {idx < (activeQuestion.blanks || []).length && (
                          <input
                            type="text"
                            className={`fill-blank-input ${
                              isAnswerChecked
                                ? fillBlankAnswers[idx]?.toLowerCase() === activeQuestion.blanks[idx]?.toLowerCase()
                                  ? 'fill-blank-input-correct'
                                  : 'fill-blank-input-incorrect'
                                : ''
                            }`}
                            disabled={isAnswerChecked}
                            value={fillBlankAnswers[idx] || ''}
                            onChange={(e) => setFillBlankAnswers({ ...fillBlankAnswers, [idx]: e.target.value })}
                          />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* RENDERER: Short / Long Open Text Answer */}
              {activeQuestion.type === 'short' && (
                <div>
                  <textarea
                    className="textarea short-answer-textarea"
                    placeholder="Type your explanation or conceptual answer here..."
                    disabled={isAnswerChecked}
                    value={shortAnswerText}
                    onChange={(e) => setShortAnswerText(e.target.value)}
                  />

                  {isGradingAI && (
                    <div className="ai-grading-indicator">
                      <div className="audio-visualizer-ring" style={{ width: '24px', height: '24px', position: 'relative' }}></div>
                      <span>Lenient AI conceptual grading in progress...</span>
                    </div>
                  )}

                  {isAnswerChecked && aiGradingResult && (
                    <div className={`ai-feedback card ${aiGradingResult.isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`}>
                      <div className="ai-feedback-score">Score: {aiGradingResult.score}/100</div>
                      <div className="ai-feedback-text">{aiGradingResult.feedback}</div>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Live Drawer feedback (Immediate Correction) */}
            {isAnswerChecked && (state.config.correctionStyle === 'immediate' || state.config.correctionStyle === 'both') && (
              <div className={`feedback-overlay card ${
                state.results[state.currentIndex]?.correct ? 'feedback-correct' : 'feedback-incorrect'
              }`}>
                <div className="feedback-header">
                  <span>{state.results[state.currentIndex]?.correct ? '🎉 Correct!' : '❌ Let\'s review'}</span>
                </div>
                <div className="feedback-explanation">
                  {activeQuestion.explanation}
                </div>
                {!state.results[state.currentIndex]?.correct && (
                  <div className="feedback-correct-answer">
                    {t('results.correctAnswer')}: {activeQuestion.correctAnswer}
                  </div>
                )}
              </div>
            )}

            {/* Play Actions bar */}
            <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
              {!isAnswerChecked && activeQuestion.type !== 'matching' ? (
                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  disabled={
                    (activeQuestion.type === 'mc' && !selectedOption) ||
                    (activeQuestion.type === 'tf' && !selectedOption) ||
                    (activeQuestion.type === 'short' && !shortAnswerText.trim()) ||
                    (activeQuestion.type === 'fill' && Object.keys(fillBlankAnswers).length === 0)
                  }
                  onClick={handleCheckAnswer}
                >
                  🔍 {t('quiz.check')}
                </button>
              ) : (
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleNextQuestion}>
                  🚀 {t('quiz.next')}
                </button>
              )}
            </div>

          </div>
        )}

        {/* =====================================================================
            VIEW: RESULTS (Celebration & Review Accordion)
            ===================================================================== */}
        {state.view === 'results' && (
          <div className="results-container">
            {(() => {
              const summary = getScoringSummary();
              return (
                <div>
                  <div className="card results-hero">
                    <div className="results-grade" style={{
                      color: summary.score >= 70 ? 'var(--color-green)' : 'var(--color-red)'
                    }}>{summary.grade}</div>
                    
                    {/* Circle Score Dial */}
                    <div className="results-score-circle" style={{ '--score-percent': `${summary.score}%` }}>
                      <div className="results-score-number">{summary.score}%</div>
                      <div className="results-score-label">{t('results.score')}</div>
                    </div>

                    <p className="results-message">{summary.message}</p>
                    <p style={{ marginTop: '10px', fontSize: '14px', color: 'var(--color-text-tertiary)' }}>
                      Earned {summary.earned} points out of {summary.maxPoints} questions (SRS questions yield 0.5x credit).
                    </p>

                    <div className="results-actions">
                      <button className="btn btn-primary" onClick={startFlashcards}>
                        🗂️ {t('results.flashcards')}
                      </button>
                      <button className="btn btn-purple" onClick={startLiveAudioQuiz}>
                        🎙️ {t('results.exportAudio')}
                      </button>
                      <button className="btn btn-secondary" onClick={handleExportPDF}>
                        📄 {t('results.exportPDF')}
                      </button>
                      <button className="btn btn-gold" onClick={handleExportWav} disabled={wavExportProgress !== null}>
                        {wavExportProgress !== null
                          ? `Downloading (${Math.round(wavExportProgress * 100)}%)`
                          : '🔊 Download WAV Guide'}
                      </button>
                      <button className="btn btn-secondary" onClick={handleShareQuizCode}>
                        🔗 {t('results.shareCode')}
                      </button>
                    </div>
                  </div>

                  {/* Question Breakdown Accordion */}
                  <div style={{ marginTop: '30px' }}>
                    <h3 className="label" style={{ marginBottom: '15px' }}>{t('results.breakdown')}</h3>
                    <div className="results-breakdown">
                      {state.questions.map((q, idx) => {
                        const ans = summary.answers.find((a) => a.questionIndex === idx) || summary.answers[idx];
                        const isActive = activeReviewIdx === idx;
                        const correct = ans?.isCorrect;

                        return (
                          <div key={idx} className={`results-item ${correct ? 'results-item-correct' : 'results-item-incorrect'}`}>
                            <div className="results-item-header" style={{ cursor: 'pointer' }} onClick={() => setActiveReviewIdx(isActive ? null : idx)}>
                              <div className="results-item-question">
                                Question {idx + 1}: {q.question}
                              </div>
                              <span className="badge" style={{ background: correct ? 'var(--color-green-bg)' : 'var(--color-red-bg)', color: correct ? 'var(--color-green)' : 'var(--color-red)' }}>
                                {correct ? '✓' : '✗'}
                              </span>
                            </div>

                            {isActive && (
                              <div style={{ marginTop: '15px', animation: 'slideUp 0.3s ease' }}>
                                <div className="results-item-answers">
                                  <div className="results-item-your-answer">
                                    <strong>{t('results.yourAnswer')}:</strong> {ans?.userAnswer || '(no answer)'}
                                  </div>
                                  <div className="results-item-correct-answer">
                                    <strong>{t('results.correctAnswer')}:</strong> {q.correctAnswer}
                                  </div>
                                </div>
                                {q.explanation && (
                                  <div className="results-item-explanation">
                                    <strong>{t('results.explanation')}:</strong> {q.explanation}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button className="btn btn-secondary" style={{ width: '100%', marginTop: '30px' }} onClick={() => dispatch({ type: 'RESET' })}>
                    ⬅️ Create Another Quiz
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* =====================================================================
            VIEW: FLASHCARDS (Interactive Swipe Deck)
            ===================================================================== */}
        {state.view === 'flashcards' && flashcardDeck.length > 0 && (
          <div className="flashcard-container">
            <h2 className="content-input-title">🗂️ {t('flashcards.title')}</h2>

            {flashcardIdx < flashcardDeck.length ? (
              // Active Card Play
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <div style={{ color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>
                  {t('flashcards.remaining', { count: flashcardDeck.length - flashcardIdx })}
                </div>

                <div className="flashcard-deck">
                  <div
                    className={`flashcard ${isCardFlipped ? 'flashcard-flipped' : ''} ${cardSwipeClass}`}
                    onClick={() => setIsCardFlipped(!isCardFlipped)}
                  >
                    {/* Front */}
                    <div className="flashcard-front">
                      <div className="flashcard-label">Question</div>
                      <div className="flashcard-text">{flashcardDeck[flashcardIdx].question}</div>
                      <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        💡 Click Card to Reveal Answer
                      </div>
                    </div>

                    {/* Back */}
                    <div className="flashcard-back">
                      <div className="flashcard-label">Correct Answer</div>
                      <div className="flashcard-text">{flashcardDeck[flashcardIdx].correctAnswer}</div>
                      {flashcardDeck[flashcardIdx].explanation && (
                        <p style={{ marginTop: '15px', fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                          {flashcardDeck[flashcardIdx].explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flashcard-swipe-hint">
                  <span>👈 Left: Try Again</span>
                  <span>|</span>
                  <span>Right: Got It! 👉</span>
                </div>

                <div className="flashcard-actions">
                  <button className="btn btn-danger" onClick={() => handleSwipeCard(false)}>
                    ❌ Try Again
                  </button>
                  <button className="btn btn-primary" onClick={() => handleSwipeCard(true)}>
                    ✅ Got It!
                  </button>
                </div>
              </div>
            ) : (
              // Deck Completed View
              <div className="card text-center" style={{ width: '100%', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🎉</div>
                <h3 className="content-input-title">{t('flashcards.completed')}</h3>
                <p style={{ color: 'var(--color-text-secondary)', margin: '15px 0' }}>
                  You mastered {gotItCards.length} of {flashcardDeck.length} cards in this study run.
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={startFlashcards}>
                    {t('flashcards.restart')}
                  </button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => dispatch({ type: 'SET_VIEW', payload: 'results' })}>
                    Back to Results
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW: AUDIO / VOICE CONVERSATIONAL (Gemini Live)
            ==================================================================== */}
        {state.view === 'audio' && (
          <div className="audio-quiz-container">
            <h2 className="content-input-title">🎙️ {t('audio.title')}</h2>
            <p className="upload-zone-hint">{t('audio.instructions')}</p>

            {/* Pulsing Visualizer Ring */}
            <div className={`audio-visualizer ${
              isLiveSpeaking ? 'audio-speaking' : isLiveListening ? 'audio-listening' : ''
            }`}>
              <div className="audio-visualizer-ring"></div>
              <div className="audio-visualizer-ring"></div>
              <div className="audio-visualizer-ring"></div>
              <div className="audio-visualizer-icon">
                {isLiveSpeaking ? '🔊' : isLiveListening ? '🎙️' : '💤'}
              </div>
            </div>

            <div className="audio-status">{liveAIStatus}</div>

            {liveTranscript && (
              <div className="card" style={{ padding: '10px 20px', fontStyle: 'italic', background: 'var(--color-bg-input)' }}>
                You said: "{liveTranscript}"
              </div>
            )}

            <div className="audio-commands">
              <span className="audio-command">"Skip"</span>
              <span className="audio-command">"Give me a hint"</span>
              <span className="audio-command">"Repeat that"</span>
              <span className="audio-command">"I don't know"</span>
            </div>

            <div style={{ display: 'flex', gap: '15px', width: '100%', maxWidth: '400px' }}>
              <button
                className={`btn ${isLiveSpeaking || isLiveListening ? 'btn-danger' : 'btn-purple'} btn-lg`}
                style={{ flex: 2 }}
                onClick={toggleLiveAudioSession}
              >
                {isLiveSpeaking || isLiveListening ? '🛑 Stop Listening' : '🎙️ Start Quiz Master'}
              </button>
              <button
                className="btn btn-secondary btn-lg"
                style={{ flex: 1 }}
                onClick={() => {
                  handleStopLiveAudio();
                  dispatch({ type: 'SET_VIEW', payload: 'results' });
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

      </main>

      {/* =====================================================================
          MODAL: SETTINGS (Gemini API Key configuration)
          ===================================================================== */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('settings.title')}</h3>
              <button className="modal-close" onClick={() => setShowSettings(false)}>
                ✕
              </button>
            </div>

            <div className="settings-group">
              <h4 className="settings-group-title">API Authentication</h4>
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <label className="label">{t('settings.apiKey')}</label>
                <input
                  type="password"
                  className="input"
                  placeholder={t('settings.apiKeyPlaceholder')}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <p className="settings-row-hint">{t('settings.apiKeyHint')}</p>
              </div>
            </div>

            <div className="settings-group">
              <h4 className="settings-group-title">{t('settings.about')}</h4>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                StudyForge uses advanced Generative AI models from Google's Gemini lineup to perform OCR, grounded search research, lenient conceptual grading, and customizable quiz creation.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSettings(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveApiKey}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

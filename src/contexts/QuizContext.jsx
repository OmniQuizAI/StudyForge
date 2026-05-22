import { createContext, useContext, useReducer } from 'react';

const QuizContext = createContext();

/**
 * @typedef {'home' | 'input' | 'config' | 'quiz' | 'results' | 'flashcards' | 'audio'} ViewName
 * @typedef {'paste' | 'file' | 'research' | 'code'} SourceType
 * @typedef {'none' | 'end' | 'intermittent'} SRSMode
 * @typedef {'immediate' | 'end' | 'both'} CorrectionStyle
 */

/** @type {object} Default state for the quiz reducer. */
const initialState = {
  // View state
  /** @type {ViewName} */
  view: 'home',

  // Source content
  sourceText: '',
  /** @type {SourceType} */
  sourceType: '',

  // Quiz config
  config: {
    /** @type {string[]} Question type codes, e.g. ['mc', 'tf'] */
    questionTypes: ['mc'],
    questionCount: 10,
    /** @type {'easy' | 'medium' | 'hard'} */
    difficulty: 'medium',
    /** @type {SRSMode} */
    srsMode: 'end',
    /** @type {CorrectionStyle} */
    correctionStyle: 'immediate',
  },

  // Quiz data
  /** @type {object[]} Array of question objects from the AI */
  questions: [],
  currentIndex: 0,
  /** @type {Object<number, *>} Map of questionIndex → user answer */
  answers: {},
  /** @type {Object<number, { correct: boolean, score: number, feedback: string }>} */
  results: {},
  /** @type {number[]} Indices of questions queued for SRS retry */
  srsQueue: [],
  /** @type {Object<number, number>} Map of questionIndex → SRS retry count */
  srsAttempts: {},
  /** @type {boolean} Whether the user is currently in SRS retry mode */
  isRetrying: false,

  // Status
  isLoading: false,
  loadingMessage: '',
  /** @type {string | null} */
  error: null,
  quizTitle: '',
  /** @type {number | null} */
  startTime: null,
  /** @type {number | null} */
  endTime: null,
};

/**
 * Reducer for all quiz-related state transitions.
 *
 * @param {typeof initialState} state
 * @param {{ type: string, payload?: * }} action
 * @returns {typeof initialState}
 */
function quizReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'SET_SOURCE':
      return {
        ...state,
        sourceText: action.payload.text,
        sourceType: action.payload.type,
        quizTitle: action.payload.title || '',
      };

    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };

    case 'SET_QUESTIONS':
      return {
        ...state,
        questions: action.payload,
        currentIndex: 0,
        answers: {},
        results: {},
        srsQueue: [],
        srsAttempts: {},
        isRetrying: false,
        startTime: Date.now(),
      };

    case 'SET_CURRENT_INDEX':
      return { ...state, currentIndex: action.payload };

    case 'SET_ANSWER':
      return {
        ...state,
        answers: { ...state.answers, [action.payload.index]: action.payload.answer },
      };

    case 'SET_RESULT':
      return {
        ...state,
        results: { ...state.results, [action.payload.index]: action.payload.result },
      };

    case 'ADD_TO_SRS':
      return { ...state, srsQueue: [...state.srsQueue, action.payload] };

    case 'SET_SRS_QUEUE':
      return { ...state, srsQueue: action.payload };

    case 'SET_RETRYING':
      return { ...state, isRetrying: action.payload };

    case 'INCREMENT_SRS_ATTEMPT':
      return {
        ...state,
        srsAttempts: {
          ...state.srsAttempts,
          [action.payload]: (state.srsAttempts[action.payload] || 0) + 1,
        },
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload.loading,
        loadingMessage: action.payload.message || '',
      };

    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };

    case 'FINISH_QUIZ':
      return { ...state, endTime: Date.now(), view: 'results' };

    case 'RESET':
      return { ...initialState };

    case 'LOAD_QUIZ':
      return { ...initialState, ...action.payload, view: 'config' };

    default:
      return state;
  }
}

/**
 * Provides quiz state and dispatch to the component tree.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function QuizProvider({ children }) {
  const [state, dispatch] = useReducer(quizReducer, initialState);

  return (
    <QuizContext.Provider value={{ state, dispatch }}>
      {children}
    </QuizContext.Provider>
  );
}

/**
 * Hook to access quiz state and dispatch.
 *
 * @returns {{ state: typeof initialState, dispatch: React.Dispatch<{ type: string, payload?: * }> }}
 */
export const useQuiz = () => useContext(QuizContext);

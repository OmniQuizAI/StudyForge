import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './contexts/ThemeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { QuizProvider } from './contexts/QuizContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <QuizProvider>
          <App />
        </QuizProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)


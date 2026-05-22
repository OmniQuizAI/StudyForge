import { createContext, useContext, useState, useCallback } from 'react';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';

const translations = { en, es, fr };
const LanguageContext = createContext();

/**
 * Provides language/i18n context to the app.
 * Persists the selected language in localStorage under 'sf-lang'.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('sf-lang') || 'en');

  /**
   * Look up a translation string by dot-notation key (e.g. 'home.title').
   * Returns the key itself as a fallback if no translation is found.
   *
   * @param {string} key - Dot-notation translation key
   * @returns {string} Translated string or the key as fallback
   */
  const t = useCallback((key) => {
    const keys = key.split('.');
    let value = translations[lang];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  }, [lang]);

  /**
   * Change the active language and persist the choice.
   *
   * @param {string} newLang - Language code ('en' | 'es' | 'fr')
   */
  const changeLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('sf-lang', newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, t, changeLanguage, availableLanguages: ['en', 'es', 'fr'] }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access the language context.
 *
 * @returns {{ lang: string, t: (key: string) => string, changeLanguage: (lang: string) => void, availableLanguages: string[] }}
 */
export const useLanguage = () => useContext(LanguageContext);

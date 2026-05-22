import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

/**
 * Provides theme context (dark/light) to the app.
 * Persists the selected theme in localStorage under 'sf-theme'
 * and sets the `data-theme` attribute on the document root element.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('sf-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sf-theme', theme);
  }, [theme]);

  /** Toggle between 'dark' and 'light' themes. */
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access the theme context.
 *
 * @returns {{ theme: string, toggleTheme: () => void }}
 */
export const useTheme = () => useContext(ThemeContext);

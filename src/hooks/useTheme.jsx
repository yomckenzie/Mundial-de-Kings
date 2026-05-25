import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children, defaultTheme = 'light', storageKey = 'chessking-theme' }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  const setTheme = (t) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}

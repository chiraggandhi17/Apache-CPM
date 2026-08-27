import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ThemeId, DEFAULT_THEME, applyTheme, themes, type ThemeTokens } from '../lib/theme';

interface ThemeContextType {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  tokens: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextType>({
  themeId: DEFAULT_THEME,
  setTheme: () => {},
  tokens: themes[DEFAULT_THEME],
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'cadence-theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved in themes) return saved as ThemeId;
    } catch {
      // localStorage may be unavailable
    }
    return DEFAULT_THEME;
  });

  // Apply theme CSS variables whenever themeId changes
  useEffect(() => {
    applyTheme(themeId);
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // silent fail
    }
  }, [themeId]);

  // Apply default theme immediately on mount (before first paint)
  useEffect(() => {
    applyTheme(themeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeId, setTheme, tokens: themes[themeId] }}>
      {children}
    </ThemeContext.Provider>
  );
};

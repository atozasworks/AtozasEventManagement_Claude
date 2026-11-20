import { createContext, useContext, useState } from 'react';

const KEY = 'es_theme';
const ThemeContext = createContext(null);

export function readTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const next = readTheme();
    applyTheme(next);
    return next;
  });

  const setTheme = (next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode can block storage; the choice still applies for this visit */
    }
    applyTheme(value);
    setThemeState(value);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

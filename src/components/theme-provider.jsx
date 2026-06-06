import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

const ThemeProviderContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => null,
});

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (typeof window === 'undefined') return;

  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  const finalTheme = theme === 'system' ? getSystemTheme() : theme;
  root.classList.add(finalTheme);
  root.dataset.theme = finalTheme;
  root.style.colorScheme = finalTheme;
  return finalTheme;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'protrack-kaizen-theme',
}) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return localStorage.getItem(storageKey) || defaultTheme;
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return theme === 'system' ? getSystemTheme() : theme;
  });

  useLayoutEffect(() => {
    setResolvedTheme(applyTheme(theme) || 'light');
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (theme === 'system') setResolvedTheme(applyTheme('system') || 'light');
    };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (nextTheme) => {
      localStorage.setItem(storageKey, nextTheme);
      setResolvedTheme(applyTheme(nextTheme) || 'light');
      setThemeState(nextTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

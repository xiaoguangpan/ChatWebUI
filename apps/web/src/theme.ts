export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'chatwebui:theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light';
}

export function currentTheme(): ThemeMode {
  const value = document.documentElement.dataset.theme;
  return value === 'light' ? 'light' : 'dark';
}

export function initTheme() {
  const saved = window.localStorage.getItem(THEME_KEY);
  const theme = isThemeMode(saved) ? saved : 'dark';
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function setTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent('chatwebui:theme-changed', { detail: { theme } }));
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

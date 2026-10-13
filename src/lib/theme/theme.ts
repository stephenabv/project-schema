/** The two colour themes. "System" is simply the absence of a stored choice. */
export type Theme = "light" | "dark";

/** localStorage key holding the player's explicit choice; absent means follow the OS. */
export const THEME_STORAGE_KEY = "ve:theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Inline script for <head>: sets <html data-theme> before first paint, so
 * there is no flash of the wrong theme, and keeps following the OS setting
 * while the player has not chosen one. Storage errors (private mode) fall
 * back to the OS setting.
 */
export const THEME_SCRIPT = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function s(){try{return localStorage.getItem(k)}catch(e){return null}}function a(){var t=s();d.dataset.theme=t==="dark"||t==="light"?t:m.matches?"dark":"light"}a();m.addEventListener("change",a)})();`;

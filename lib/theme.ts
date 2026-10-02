export const THEME_STORAGE_KEY = "ask-theme";

export type Theme = "light" | "dark";

/**
 * Runs in <head> before the page paints (see app/layout.tsx), so the page never
 * flashes the wrong theme. Uses the saved choice, otherwise the system setting.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;

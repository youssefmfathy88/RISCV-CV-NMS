export type Theme = "dark" | "sepia";

export const THEME_STORAGE_KEY = "illustration-theme";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="sepia")t="dark";var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t==="sepia"?"light":"dark";}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "sepia" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
}

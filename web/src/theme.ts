import { useEffect, useState } from "preact/hooks";

export type ThemeMode = "system" | "light" | "dark";

/** Same key as the inline script in index.html and login.html, which sets the theme before first paint. */
export const THEME_KEY = "mcpx-theme";

const ORDER: ThemeMode[] = ["system", "light", "dark"];
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function getMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked (private windows, strict settings); the system theme still works.
  }
  return "system";
}

/** The theme actually shown for a mode. */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return window.matchMedia?.(LIGHT_QUERY).matches ? "light" : "dark";
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  const theme = resolveTheme(mode);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f1f5f9" : "#0b0f17");
}

export function setMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Not persisted, but still applied for this visit.
  }
  applyTheme(mode);
}

/** Current mode plus a function that moves to the next one (system → light → dark). */
export function useTheme(): [ThemeMode, () => void] {
  const [mode, setModeState] = useState<ThemeMode>(getMode);

  // In system mode, follow the operating system when it flips between light and dark.
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mode]);

  const next = () => {
    const following = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(following);
    setModeState(following);
  };
  return [mode, next];
}

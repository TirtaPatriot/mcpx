import { useTheme, type ThemeMode } from "../theme";

const NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeMode, string> = { system: "System", light: "Light", dark: "Dark" };

const ICON: Record<ThemeMode, string> = {
  system: "M9.75 17h4.5M12 17v3m-6 0h12M5 5h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  light: "M12 3v2m0 14v2M5.64 5.64l1.41 1.41m9.9 9.9l1.41 1.41M3 12h2m14 0h2M5.64 18.36l1.41-1.41m9.9-9.9l1.41-1.41M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  dark: "M20.35 14.35A8 8 0 019.65 3.65a8 8 0 1010.7 10.7z",
};

/** One button that cycles the theme: follow the system, then light, then dark. */
export function ThemeToggle() {
  const [mode, next] = useTheme();
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${LABEL[mode]}`}
      aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[NEXT[mode]]}.`}
      class="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-strong bg-dark-700/60 border border-dark-600 transition"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d={ICON[mode]} />
      </svg>
    </button>
  );
}

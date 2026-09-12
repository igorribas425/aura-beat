export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const AURA_THEME_STORAGE_KEY = "aura-theme-preference";
export const AURA_THEME_EVENT = "aura-theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "dark" || value === "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark" || preference === "light") return preference;

  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }

  return "dark";
}

export function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;

  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;

  let metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.name = "theme-color";
    document.head.appendChild(metaTheme);
  }

  metaTheme.content = resolved === "light" ? "#f5f5f8" : "#050507";
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(AURA_THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function setThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(AURA_THEME_STORAGE_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(
    new CustomEvent<ThemePreference>(AURA_THEME_EVENT, { detail: preference }),
  );
}

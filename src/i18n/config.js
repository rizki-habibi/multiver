export const LOCALES = ["id"];
export const DEFAULT_LOCALE = "id";
export const LOCALE_COOKIE = "locale";

export const LOCALE_NAMES = {
  id: "Indonesia",
};

export function normalizeLocale(locale) {
  if (locale === "id") return "id";
  return DEFAULT_LOCALE;
}

export function isSupportedLocale(locale) {
  return LOCALES.includes(locale);
}

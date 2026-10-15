import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Interface languages, with i18next. The keys are the English texts
 * themselves, so `t('Raise terrain')` shows English when a language has no
 * translation yet. Components translate with `useTranslation()`; code outside
 * React (the editor, formatters) uses `t()` from here. Data that is defined
 * once (tool names, presets…) marks its texts with `N_()` and is translated
 * where it is shown. Placeholders are written `{name}`.
 *
 * English needs no dictionary (the keys are the texts); other languages load
 * their `locales/*.json` when they are first used. `npm run i18n` keeps the
 * files in line with the code. Adding a language: copy `locales/en.json`,
 * translate the values, and list it in `LOCALES` and `DICTIONARIES`.
 */
export type Locale = 'en' | 'ru';

/**
 * `browser`: the browser languages that start in this language. The first of
 * the browser's preferred languages that matches wins; otherwise English.
 */
export const LOCALES: { id: Locale; name: string; short: string; browser: RegExp }[] = [
  { id: 'en', name: 'English', short: 'EN', browser: /^en\b/i },
  // browsers set to Belarusian or Kazakh start in Russian too, which is widely read there
  { id: 'ru', name: 'Русский', short: 'RU', browser: /^(ru|be|kk)\b/i },
];

const KEY = 'loremapper.locale';

function initialLocale(): Locale {
  // tests always see the English source texts
  if (import.meta.env?.MODE === 'test') return 'en';
  try {
    const stored = LOCALES.find((l) => l.id === localStorage.getItem(KEY));
    if (stored) return stored.id;
  } catch {
    // no storage: fall back to the browser's language
  }
  const langs = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const lang of langs) {
    const match = LOCALES.find((l) => l.browser.test(lang ?? ''));
    if (match) return match.id;
  }
  return 'en';
}

const DICTIONARIES: Record<Exclude<Locale, 'en'>, () => Promise<{ default: Record<string, string> }>> = {
  ru: () => import('./locales/ru.json'),
};

void i18n.use(initReactI18next).init({
  resources: { en: { translation: {} } },
  lng: 'en',
  fallbackLng: 'en',
  // natural-language keys: dots and colons are part of the text
  keySeparator: false,
  nsSeparator: false,
  // empty strings in a locale file mean "not translated yet"
  returnEmptyString: false,
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  initAsync: false,
});

async function load(l: Locale) {
  if (l === 'en' || i18n.hasResourceBundle(l, 'translation')) return;
  i18n.addResourceBundle(l, 'translation', (await DICTIONARIES[l]()).default);
}

async function switchTo(l: Locale) {
  try {
    await load(l);
  } catch {
    // the dictionary didn't load (offline, blocked): stay in English
    return;
  }
  await i18n.changeLanguage(l);
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/** Resolves once the starting language is ready; the app renders after it. */
export const i18nReady: Promise<void> = switchTo(initialLocale());

export { i18n };

export function getLocale(): Locale {
  return LOCALES.find((l) => l.id === i18n.language)?.id ?? 'en';
}

export function setLocale(l: Locale): Promise<void> {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // remembering the choice is a convenience only
  }
  return switchTo(l);
}

/** Translate outside React components (inside them, use `useTranslation()`). */
export function t(text: string, params?: Record<string, string | number>): string {
  return i18n.t(text, params);
}

export { N_ } from './mark';

/** Numbers in the active language's format (1,234.5 or 1 234,5). */
export function formatNumber(v: number, digits = 0): string {
  return v.toLocaleString(getLocale() === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

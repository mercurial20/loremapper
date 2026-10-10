import '@fontsource-variable/cinzel';
import '@fontsource-variable/eb-garamond';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource-variable/inter';
import type { LabelFont } from '../model/types';

export const FONT_FAMILY: Record<LabelFont, string> = {
  display: 'Cinzel Variable',
  serif: 'EB Garamond Variable',
  script: 'IM Fell English',
  sans: 'Inter Variable',
};

/**
 * Font stacks for canvas text: Cinzel and Fell English have no Cyrillic or
 * Greek, so their letters fall back to Garamond instead of a system font.
 */
export const FONT_STACK: Record<LabelFont, string[]> = {
  display: [FONT_FAMILY.display, FONT_FAMILY.serif, 'serif'],
  serif: [FONT_FAMILY.serif, 'serif'],
  script: [FONT_FAMILY.script, FONT_FAMILY.serif, 'serif'],
  sans: [FONT_FAMILY.sans, 'sans-serif'],
};

export const FONT_LABEL: Record<LabelFont, string> = {
  display: 'Cinzel (display)',
  serif: 'Garamond (book)',
  script: 'Fell English (old hand)',
  sans: 'Inter (modern)',
};

/** Wait until the bundled map fonts are usable by canvas text rendering. */
export async function ensureFonts() {
  // the sample text pulls in the Latin and Cyrillic subsets (fonts load by unicode range)
  const loads = Object.values(FONT_FAMILY).flatMap((f) => [document.fonts.load(`400 32px "${f}"`, 'Aa Жж'), document.fonts.load(`italic 400 32px "${f}"`, 'Aa Жж')]);
  loads.push(document.fonts.load(`700 32px "${FONT_FAMILY.display}"`));
  await Promise.allSettled(loads);
}

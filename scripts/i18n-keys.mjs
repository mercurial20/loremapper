// The translatable texts in the source code: t('…'), N_('…') and <Trans i18nKey="…" />.
// Their keys are the English texts themselves (see src/i18n/index.ts).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
export const LOCALES_DIR = fileURLToPath(new URL('../src/i18n/locales', import.meta.url));

const CALL = /(?<![\w.$])(?:t|N_)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const TRANS = /\bi18nKey="((?:[^"\\]|\\.)*)"/g;
const unescape = (s) => s.replace(/\\(.)/g, '$1');

/** Keys used in one source file. */
export function extractKeys(code) {
  const keys = [];
  for (const m of code.matchAll(CALL)) keys.push(unescape(m[1] ?? m[2]));
  for (const m of code.matchAll(TRANS)) keys.push(unescape(m[1]));
  return keys.filter((k) => k.length > 0);
}

/** Every key under `srcDir`, sorted. Tests and worlds kept on this computer only (`local/`) are skipped. */
export function collectKeys(srcDir = SRC_DIR) {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'local' && e.name !== 'locales') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        for (const k of extractKeys(readFileSync(p, 'utf8'))) keys.add(k);
      }
    }
  };
  walk(srcDir);
  return [...keys].sort((a, b) => a.localeCompare(b, 'en'));
}

/** The `{name}` placeholders in a text. */
export function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

/** The locale files, by language: { en: {…}, ru: {…} }. */
export function readLocales(dir = LOCALES_DIR) {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
  );
}

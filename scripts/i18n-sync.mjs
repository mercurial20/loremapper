// Bring the locale files in line with the code: `npm run i18n`.
// en.json lists every text (the template for a new language). Other languages
// keep their translations, get new texts as "" (shown in English until
// translated) and lose texts the code no longer uses.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { collectKeys, LOCALES_DIR as dir } from './i18n-keys.mjs';

const keys = collectKeys();
const write = (file, obj) => writeFileSync(`${dir}/${file}`, JSON.stringify(obj, null, 2) + '\n');

write('en.json', Object.fromEntries(keys.map((k) => [k, k])));
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const old = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  const next = Object.fromEntries(keys.map((k) => [k, old[k] ?? '']));
  write(file, next);
  const missing = keys.filter((k) => !next[k]).length;
  const dropped = Object.keys(old).filter((k) => !(k in next)).length;
  console.log(`${file}: ${keys.length - missing}/${keys.length} translated${missing ? `, ${missing} missing` : ''}${dropped ? `, ${dropped} unused removed` : ''}`);
}

import { describe, expect, it } from 'vitest';
import { collectKeys, extractKeys, placeholders, readLocales } from '../../scripts/i18n-keys.mjs';
import { setLocale, t } from './index';

const keys = collectKeys();
const locales = readLocales();

describe('interface texts', () => {
  it('finds the texts marked for translation', () => {
    expect(extractKeys(`t('Hide'); N_("Peaks"); <Trans i18nKey="A <b>{name}</b>" />; i18n.t(x); split('a')`)).toEqual(['Hide', 'Peaks', 'A <b>{name}</b>']);
    expect(extractKeys(`t('It\\'s {n}', { n })`)).toEqual(["It's {n}"]);
    expect(keys.length).toBeGreaterThan(500);
  });

  it('every language has every text, and nothing the code no longer uses (npm run i18n)', () => {
    for (const [name, dict] of Object.entries(locales)) {
      const missing = keys.filter((k) => !dict[k]);
      const unused = Object.keys(dict).filter((k) => !keys.includes(k));
      expect({ name, missing, unused }).toEqual({ name, missing: [], unused: [] });
    }
  });

  it('translations keep the placeholders and markup of the English text', () => {
    for (const [name, dict] of Object.entries(locales))
      for (const [k, v] of Object.entries(dict)) {
        expect({ name, k, ph: placeholders(v) }).toEqual({ name, k, ph: placeholders(k) });
        expect({ name, k, tags: v.match(/<\/?\w+>/g)?.sort() ?? [] }).toEqual({ name, k, tags: k.match(/<\/?\w+>/g)?.sort() ?? [] });
      }
  });

  it('fills placeholders and falls back to English', async () => {
    expect(t('Fog {n}%', { n: 40 })).toBe('Fog 40%');
    await setLocale('ru');
    try {
      expect(t('Fog {n}%', { n: 40 })).toBe('Туман 40%');
      expect(t('Undo {action} (Ctrl+Z)', { action: t('Raise terrain') })).toBe('Отменить: Поднять рельеф (Ctrl+Z)');
      expect(t('A text nobody translated yet')).toBe('A text nobody translated yet');
      expect(t('Delete layer “{name}”? Its {n} objects move to another layer.', { name: 'a.b: c', n: 3 })).toContain('«a.b: c»');
    } finally {
      await setLocale('en');
    }
  });
});

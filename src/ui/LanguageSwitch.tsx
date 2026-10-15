import { ChevronDown, Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocale, LOCALES, setLocale } from '../i18n';

/**
 * The interface language: a small button with the language's code (next to
 * the units switch, and on the welcome screen) that opens the list of
 * languages by their own names.
 */
export function LanguageSwitch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  const current = LOCALES.find((l) => l.id === getLocale()) ?? LOCALES[0];
  return (
    <div className="lang-switch" ref={ref}>
      <button className={open ? 'on' : ''} onClick={() => setOpen(!open)} title={t('Language')} aria-label={`${t('Language')}: ${current.name}`} aria-haspopup="listbox" aria-expanded={open}>
        <Languages size={14} aria-hidden />
        {current.short}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <ul className="lang-menu" role="listbox" aria-label={t('Language')}>
          {LOCALES.map((l) => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === current.id}
                className={l.id === current.id ? 'on' : ''}
                lang={l.id}
                onClick={() => {
                  setOpen(false);
                  void setLocale(l.id);
                }}
              >
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

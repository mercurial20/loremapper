import { ChevronDown, ChevronRight, Eye, EyeOff, Pin, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength } from '../../core/units';
import { editor } from '../../editor/Editor';
import { addNameGroup, deleteNameGroup, updateNameGroup } from '../../editor/names';
import { groupName, groupStyle, mapLong } from '../../model/names';
import { type LabelFont, type NameStyle, type NameStyleKey } from '../../model/types';
import { FONT_LABEL, FONT_STACK } from '../../render/fonts';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { Hint, NumberField, Select, Slider } from '../controls/controls';

/*
 * Styles of names on the map: a group's style (Names on the map) and an item's own properties over
 * it. Every property an item sets itself is marked, with a way back to the group's.
 */

const COLOURS = ['#2d2216', '#5a2a1a', '#1d2731', '#2f5874', '#8f2a1e', '#3f5f2a', '#ffffff'];

const longSide = () => (editor.model ? mapLong(editor.model.W, editor.model.H) : 2048);
const kmPerCell = () => editor.model?.geo.kmPerCellY ?? 1;


export function NameGroupPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const groups = useDoc((s) => s.doc.nameGroups);
  return <Select label={label} value={groups.some((g) => g.id === value) ? value : groups[0].id} options={groups.map((g) => ({ value: g.id, label: groupName(g, t) }))} onChange={onChange} />;
}

/** How a style looks, as a line of sample text. */
export function StyleSample({ style, text }: { style: NameStyle; text?: string }) {
  const { t } = useTranslation();
  const css: CSSProperties = {
    fontFamily: FONT_STACK[style.font].map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', '),
    fontWeight: style.font === 'display' ? 600 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textTransform: style.uppercase ? 'uppercase' : 'none',
    letterSpacing: style.uppercase ? '0.12em' : '0.01em',
    color: style.color,
    textShadow: style.halo ? '0 0 2px #f4ead2, 0 0 2px #f4ead2, 0 0 3px #f4ead2' : 'none',
  };
  return (
    <div className="name-sample" aria-hidden>
      <span style={css}>{text || t('Kingsford')}</span>
    </div>
  );
}

export function NameStylePreview({ group }: { group: string }) {
  const g = useDoc((s) => s.doc.nameGroups.find((x) => x.id === group) ?? s.doc.nameGroups[0]);
  return <StyleSample style={groupStyle(g, longSide())} />;
}

/** One property's row: marked when the item sets it itself, with a way back to the group's. */
function Field({ own, onReset, children }: { own: boolean; onReset?: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={'ns-field' + (own ? ' own' : '')}>
      <div className="ns-ctl">{children}</div>
      {own && onReset && (
        <button className="icon-btn small ns-reset" onClick={onReset} title={t('Use the group’s')} aria-label={t('Use the group’s')}>
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * The style controls. `style` is what the name looks like now, `own` the properties set on the
 * item itself (none for a group); `onSet` sets one, `onReset` gives it back to the group.
 */
export function NameStyleEditor({
  style,
  own = [],
  onSet,
  onReset,
  sample,
}: {
  style: NameStyle;
  own?: NameStyleKey[];
  onSet: <K extends NameStyleKey>(key: K, value: NameStyle[K]) => void;
  onReset?: (key: NameStyleKey) => void;
  sample?: string;
}) {
  const { t } = useTranslation();
  const units = useEditor((s) => s.units);
  const L = longSide();
  const is = (k: NameStyleKey) => own.includes(k);
  const reset = (k: NameStyleKey) => (onReset ? () => onReset(k) : undefined);
  return (
    <div className="name-style">
      <StyleSample style={style} text={sample} />
      <Field own={is('font')} onReset={reset('font')}>
        <Select<LabelFont> label={t('Font')} value={style.font} options={(Object.keys(FONT_LABEL) as LabelFont[]).map((f) => ({ value: f, label: t(FONT_LABEL[f]) }))} onChange={(v) => onSet('font', v)} />
      </Field>
      <Field own={is('size')} onReset={reset('size')}>
        <Slider label={t('Size on the map')} value={style.size} min={L / 2500} max={L / 10} log onChange={(v) => onSet('size', v)} format={(v) => formatLength(v * kmPerCell(), units)} hint={style.adaptive ? t('Size of the letters on the map, kept within the group’s sizes on screen.') : t('Size of the letters on the map. Names too small to read at the current zoom are hidden.')} />
      </Field>
      <Field own={is('color')} onReset={reset('color')}>
        <div className="ctl color">
          <span>{t('Colour')}</span>
          <div className="color-row">
            {COLOURS.map((c) => (
              <button key={c} className={'swatch' + (c.toLowerCase() === style.color.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => onSet('color', c)} title={c} />
            ))}
            <label className="swatch custom" style={{ background: style.color }} title={t('Custom colour')}>
              <input type="color" value={style.color} onChange={(e) => onSet('color', e.target.value)} />
            </label>
          </div>
        </div>
      </Field>
      <div className="ns-chips">
        {(
          [
            ['uppercase', t('Capitals'), ''],
            ['italic', t('Italic'), ''],
            ['halo', t('Halo'), ''],
            ['adaptive', t('Adaptive size'), t('Kept readable on screen: it does not grow past its group’s size when you zoom in, so the land shows, nor shrink away when you zoom out; it hides when what it names is too small to see.')],
          ] as const
        ).map(([k, label, tip]) => (
          <span key={k} className={'ns-chip-wrap' + (is(k) ? ' own' : '')}>
            <button className={'chip' + (style[k] ? ' on' : '')} onClick={() => onSet(k, !style[k])} aria-pressed={style[k]} title={tip || undefined}>
              {label}
            </button>
            {is(k) && onReset && (
              <button className="ns-chip-reset" onClick={() => onReset(k)} title={t('Use the group’s')} aria-label={t('Use the group’s')}>
                <RotateCcw size={10} />
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** An item's style section: its group, then its style with what it sets itself marked. */
export function ItemNameStyle({
  group,
  onGroup,
  style,
  own,
  onSet,
  onReset,
  onResetAll,
  sample,
}: {
  group: string;
  onGroup: (id: string) => void;
  style: NameStyle;
  own: NameStyleKey[];
  onSet: <K extends NameStyleKey>(key: K, value: NameStyle[K]) => void;
  onReset: (key: NameStyleKey) => void;
  onResetAll: () => void;
  sample?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(own.length > 0);
  return (
    <div className="item-name-style">
      <NameGroupPicker label={t('Style group')} value={group} onChange={onGroup} />
      <button className="ns-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{own.length ? t('Own style ({n})', { n: own.length }) : t('Style of its own')}</span>
      </button>
      {open && (
        <>
          <NameStyleEditor style={style} own={own} onSet={onSet} onReset={onReset} sample={sample} />
          {own.length > 0 ? (
            <button className="btn small" onClick={onResetAll}>
              <RotateCcw size={13} /> {t('Follow the group in everything')}
            </button>
          ) : (
            <Hint>{t('Change anything here to set it for this name only; the rest follows its group.')}</Hint>
          )}
        </>
      )}
    </div>
  );
}

/** Names on the map: the groups, their styles, and groups of one's own. */
export function NameGroupsPanel() {
  const { t } = useTranslation();
  const groups = useDoc((s) => s.doc.nameGroups);
  const doc = useDoc((s) => s.doc);
  const [open, setOpen] = useState<string | null>(null);
  const counts: Record<string, number> = {};
  const add = (id: string | undefined, fallback: string) => {
    const g = groups.find((x) => x.id === id)?.id ?? fallback;
    counts[g] = (counts[g] ?? 0) + 1;
  };
  for (const o of Object.values(doc.objects)) if (o.name.trim() && o.showName !== false) add(o.nameGroup, 'names-objects');
  for (const p of Object.values(doc.paths)) if (p.name.trim() && p.showName !== false) add(p.nameGroup, p.kind === 'river' ? 'names-waters' : 'names-labels');
  for (const l of Object.values(doc.labels)) add(l.group, l.anchor ? (l.anchor.land ? 'names-places' : 'names-waters') : 'names-labels');
  for (const a of Object.values(doc.peaks)) if (a.name) add(a.nameGroup, 'names-peaks');
  return (
    <div className="name-groups">
      <ul className="layer-list">
        {groups.map((g) => {
          const st = groupStyle(g, longSide());
          const isOpen = open === g.id;
          return (
            <li key={g.id} className={'layer-item' + (g.visible ? '' : ' off')}>
              <div className="layer-row">
                <button className="icon-btn small" onClick={() => updateNameGroup(g.id, { visible: !g.visible })} title={g.visible ? t('Hide these names') : t('Show these names')}>
                  {g.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="layer-name" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}>
                  <span className="ns-name">
                    <span className="ns-dot" style={{ background: st.color }} />
                    {groupName(g, t)}
                  </span>
                  <em>{counts[g.id] ?? 0}</em>
                </button>
                <button className={'icon-btn small ns-pin' + (g.always ? ' on' : '')} aria-pressed={g.always} onClick={() => updateNameGroup(g.id, { always: !g.always })} title={g.always ? t('Always shown: click to hide them when too small to read') : t('Hidden when too small to read: click to always show')}>
                  <Pin size={13} />
                </button>
              </div>
              {isOpen && (
                <div className="ng-detail">
                  {g.kind === 'custom' && (
                    <label className="ctl text">
                      <span>{t('Name')}</span>
                      <input value={g.name} onChange={(e) => updateNameGroup(g.id, { name: e.target.value }, 'group-name:' + g.id)} />
                    </label>
                  )}
                  <NameStyleEditor style={st} onSet={(k, v) => updateNameGroup(g.id, { style: { [k]: v } }, `group-${k}:${g.id}`)} />
                  {st.adaptive && (
                    <div className="grid2">
                      <NumberField label={t('Smallest on screen')} value={g.minPx} min={6} max={g.maxPx} step={1} suffix="px" onChange={(v) => updateNameGroup(g.id, { minPx: Math.max(6, Math.min(g.maxPx, Math.round(v))) }, 'group-min:' + g.id)} />
                      <NumberField label={t('Largest on screen')} value={g.maxPx} min={g.minPx} max={96} step={1} suffix="px" onChange={(v) => updateNameGroup(g.id, { maxPx: Math.min(96, Math.max(g.minPx, Math.round(v))) }, 'group-max:' + g.id)} />
                    </div>
                  )}
                  {g.style.size > 0 && (
                    <button className="btn small" onClick={() => updateNameGroup(g.id, { style: { size: 0 } })}>
                      <RotateCcw size={13} /> {t('Size to the map')}
                    </button>
                  )}
                  {g.kind === 'custom' && (
                    <button className="btn small danger" onClick={() => deleteNameGroup(g.id)}>
                      <Trash2 size={13} /> {t('Delete group')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        className="btn small"
        onClick={() => {
          const id = addNameGroup(t('Group {n}', { n: groups.filter((g) => g.kind === 'custom').length + 1 }));
          setOpen(id);
        }}
      >
        <Plus size={13} /> {t('New group')}
      </button>
      <Hint>{t('Every name takes the style of its group. Pick a group for a name, or set any property on the name itself, in its panel.')}</Hint>
    </div>
  );
}

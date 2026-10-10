import { ChevronDown, ChevronRight } from 'lucide-react';
import { displayToKm, displayToM, heightUnit, kmToDisplay, lengthUnit, mToDisplay } from '../../core/units';
import { useEditor } from '../../store/editorStore';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Logarithmic mapping for wide ranges (e.g. km radius). */
  log?: boolean;
  hint?: string;
}) {
  const { label, value, min, max, step = 0.01, onChange, format, log, hint } = props;
  const id = useId();
  const toSlider = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : v);
  const fromSlider = (s: number) => (log ? min * Math.pow(max / min, s) : s);
  return (
    <div className="ctl slider" title={hint}>
      <label htmlFor={id}>
        <span>{label}</span>
        <output>{format ? format(value) : value}</output>
      </label>
      <input
        id={id}
        type="range"
        min={log ? 0 : min}
        max={log ? 1 : max}
        step={log ? 0.001 : step}
        value={toSlider(value)}
        onChange={(e) => {
          let v = fromSlider(parseFloat(e.target.value));
          if (!log && step) v = Math.round(v / step) * step;
          onChange(v);
        }}
        style={{ ['--fill' as string]: `${((toSlider(value) - (log ? 0 : min)) / ((log ? 1 : max) - (log ? 0 : min))) * 100}%` }}
      />
    </div>
  );
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(props.value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(round(props.value)));
  }, [props.value]);
  const commit = () => {
    // untouched: keep the stored value exactly (no rounding drift through unit conversions)
    if (text === String(round(props.value))) return;
    const v = parseFloat(text);
    if (Number.isFinite(v)) {
      const c = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v));
      props.onChange(c);
      setText(String(round(c)));
    } else setText(String(round(props.value)));
  };
  return (
    <label className="ctl number">
      <span>{props.label}</span>
      <div className="number-wrap">
        <input
          type="number"
          value={text}
          step={props.step ?? 1}
          disabled={props.disabled}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            commit();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {props.suffix && <em>{props.suffix}</em>}
      </div>
    </label>
  );
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

/**
 * A number field for a ground length (stored in km) or a height (stored in
 * metres), shown and typed in the current display units.
 */
export function MeasureField(props: {
  label: string;
  kind: 'length' | 'height';
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: { metric: number; imperial: number };
  disabled?: boolean;
}) {
  const units = useEditor((s) => s.units);
  const to = props.kind === 'length' ? kmToDisplay : mToDisplay;
  const from = props.kind === 'length' ? displayToKm : displayToM;
  const conv = (v: number | undefined) => (v === undefined ? undefined : to(v, units));
  return (
    <NumberField
      label={props.label}
      value={to(props.value, units)}
      min={conv(props.min)}
      max={conv(props.max)}
      step={props.step?.[units]}
      suffix={props.kind === 'length' ? lengthUnit(units) : heightUnit(units)}
      disabled={props.disabled}
      onChange={(v) => props.onChange(from(v, units))}
    />
  );
}

export function TextField({
  ref,
  ...props
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  ref?: React.Ref<HTMLInputElement & HTMLTextAreaElement>;
}) {
  return (
    <label className="ctl text">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea ref={ref} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} rows={3} />
      ) : (
        <input ref={ref} type="text" value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} autoFocus={props.autoFocus} />
      )}
    </label>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="ctl toggle" title={props.hint}>
      <span>{props.label}</span>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

export function Select<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="ctl select">
      <span>{props.label}</span>
      <div className="select-wrap">
        <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
    </label>
  );
}

export function ColorField(props: { label: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <div className="ctl color">
      <span>{props.label}</span>
      <div className="color-row">
        {props.swatches?.map((c) => (
          <button key={c} className={'swatch' + (c.toLowerCase() === props.value.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => props.onChange(c)} title={c} />
        ))}
        <label className="swatch custom" style={{ background: props.value }} title="Custom colour">
          <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="ctl segmented-ctl">
      {props.label && <span>{props.label}</span>}
      <div className="segmented">
        {props.options.map((o) => (
          <button key={o.value} className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)} title={o.title}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void; actions?: ReactNode; className?: string }) {
  const [localOpen, setLocal] = useState(props.open ?? true);
  const open = props.open ?? localOpen;
  const toggle = () => (props.onToggle ? props.onToggle(!open) : setLocal(!open));
  return (
    <section className={'panel-section ' + (props.className ?? '') + (open ? ' open' : '')}>
      <header>
        <button className="section-toggle" onClick={toggle} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <h3>{props.title}</h3>
        </button>
        <div className="section-actions">{props.actions}</div>
      </header>
      {open && <div className="section-body">{props.children}</div>}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row">{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

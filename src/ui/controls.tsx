import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="ctl-toggle">
      <div className="ctl-toggle-text">
        <label htmlFor={id} className="ctl-label">
          {props.label}
        </label>
        {props.hint ? <p className="ctl-hint">{props.hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        className="switch"
        onClick={() => props.onChange(!props.checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <div className="ctl-slider">
      <div className="ctl-row">
        <label htmlFor={id} className="ctl-label">
          {props.label}
        </label>
        <output htmlFor={id} className="ctl-value tnum">
          {props.format ? props.format(props.value) : props.value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      {props.hint ? <p className="ctl-hint">{props.hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string | number>(props: {
  label: string;
  hideLabel?: boolean;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={`ctl-seg-wrap ${props.size === 'sm' ? 'is-sm' : ''}`}>
      <span id={id} className={props.hideLabel ? 'visually-hidden' : 'ctl-label'}>
        {props.label}
      </span>
      <div className="ctl-seg" role="radiogroup" aria-labelledby={id}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            title={o.title}
            className="ctl-seg-opt"
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Dialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${props.wide ? 'is-wide' : ''}`}
      aria-labelledby={titleId}
      onClose={props.onClose}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <h2 id={titleId}>{props.title}</h2>
          <button type="button" className="icon-btn" aria-label={props.closeLabel ?? 'Close'} onClick={props.onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {props.children}
      </div>
    </dialog>
  );
}

export function Progress({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      className={`progress ${value === null ? 'is-indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
    >
      <div className="progress-fill" style={{ width: value === null ? undefined : `${Math.round(value * 1000) / 10}%` }} />
    </div>
  );
}

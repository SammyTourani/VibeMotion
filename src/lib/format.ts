/** 83.456 -> "1:23.4" (tenths), or "1:23" without fraction. */
export function timecode(t: number, tenths = true): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  const whole = Math.floor(sec);
  const secStr = String(whole).padStart(2, '0');
  if (!tenths) return `${m}:${secStr}`;
  return `${m}:${secStr}.${Math.floor((sec - whole) * 10)}`;
}

/** Seconds as a short duration: "8.4 s", "1 min 12 s". */
export function duration(t: number): string {
  if (t < 60) return `${t.toFixed(1)} s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t - m * 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}

export function relativeDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const days = Math.floor((now - ms) / 86_400_000);
  if (days < 1 && new Date(now).getDate() === d.getDate()) {
    return `today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

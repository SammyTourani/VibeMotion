// Hands a file (or the sample) from the landing page to the editor, which is
// a separate lazily loaded chunk.

export type Pending = { kind: 'file'; file: File } | { kind: 'sample' };

let pending: Pending | null = null;

export function setPending(p: Pending) {
  pending = p;
}

export function takePending(): Pending | null {
  const p = pending;
  pending = null;
  return p;
}

export const SAMPLE_URL = `${import.meta.env.BASE_URL}sample/sample.mp4`;
export const SAMPLE_NAME = 'sample-clip.mp4';

export async function fetchSample(): Promise<File> {
  const res = await fetch(SAMPLE_URL);
  if (!res.ok) throw new Error(`Couldn't load the sample clip (${res.status}).`);
  const blob = await res.blob();
  // Fixed lastModified: the sample's fingerprint stays stable, so its edits can be restored.
  return new File([blob], SAMPLE_NAME, { type: 'video/mp4', lastModified: 1_758_585_600_000 });
}

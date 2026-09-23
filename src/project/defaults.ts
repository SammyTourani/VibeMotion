import { DEFAULT_FILLERS } from '../edit/fillers';
import { settingsForStyle } from '../captions/styles';
import type { Project, SourceMeta } from './types';

export function newProject(source: SourceMeta): Project {
  return {
    version: 1,
    source,
    transcript: null,
    wordEdits: {},
    textFixes: {},
    rangeOps: [],
    tighten: {
      removeSilences: true,
      minSilence: 0.4,
      padding: 0.12,
      sensitivity: 12,
      removeFillers: true,
      fillers: [...DEFAULT_FILLERS],
      cutUntranscribed: false,
    },
    captions: settingsForStyle('punch'),
    frame: { aspect: '9:16', mode: 'auto', manualX: 0.5, manualY: 0.5, punchIn: true, punchAmount: 1.12 },
    audio: { normalize: true, music: null },
    faces: null,
    updatedAt: Date.now(),
  };
}

/** Validates a project read from disk (JSON) or IndexedDB. */
export function isProject(x: unknown): x is Project {
  if (!x || typeof x !== 'object') return false;
  const p = x as Partial<Project>;
  return (
    p.version === 1 &&
    !!p.source &&
    typeof p.source.fingerprint === 'string' &&
    typeof p.wordEdits === 'object' &&
    Array.isArray(p.rangeOps) &&
    !!p.tighten &&
    !!p.captions &&
    !!p.frame &&
    !!p.audio
  );
}

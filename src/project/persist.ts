// Autosave: projects live in IndexedDB, keyed by the source file's
// fingerprint (name + size + last modified). Video files are never stored;
// re-selecting the same file restores the edits.

import type { Project } from './types';
import { isProject } from './defaults';

const DB_NAME = 'vibemotion';
const VERSION = 1;

export interface SavedProject {
  fingerprint: string;
  name: string;
  duration: number;
  updatedAt: number;
  project: Project;
}

export interface SavedMusic {
  fingerprint: string;
  name: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'fingerprint' }).createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('music')) db.createObjectStore('music', { keyPath: 'fingerprint' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is blocked by another tab.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveProject(project: Project): Promise<void> {
  const rec: SavedProject = {
    fingerprint: project.source.fingerprint,
    name: project.source.name,
    duration: project.source.duration,
    updatedAt: project.updatedAt,
    project,
  };
  await run('projects', 'readwrite', (s) => s.put(rec));
}

export async function loadProject(fingerprint: string): Promise<SavedProject | null> {
  try {
    const rec = await run<SavedProject | undefined>('projects', 'readonly', (s) => s.get(fingerprint));
    return rec && isProject(rec.project) ? rec : null;
  } catch {
    return null;
  }
}

export async function listRecent(limit = 6): Promise<Omit<SavedProject, 'project'>[]> {
  try {
    const all = await run<SavedProject[]>('projects', 'readonly', (s) => s.getAll());
    return all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map(({ fingerprint, name, duration, updatedAt }) => ({ fingerprint, name, duration, updatedAt }));
  } catch {
    return [];
  }
}

export async function deleteProject(fingerprint: string): Promise<void> {
  await run('projects', 'readwrite', (s) => s.delete(fingerprint));
  await run('music', 'readwrite', (s) => s.delete(fingerprint));
}

export async function saveMusic(m: SavedMusic): Promise<void> {
  await run('music', 'readwrite', (s) => s.put(m));
}

export async function loadMusic(fingerprint: string): Promise<SavedMusic | null> {
  try {
    return (await run<SavedMusic | undefined>('music', 'readonly', (s) => s.get(fingerprint))) ?? null;
  } catch {
    return null;
  }
}

export async function deleteMusic(fingerprint: string): Promise<void> {
  await run('music', 'readwrite', (s) => s.delete(fingerprint));
}

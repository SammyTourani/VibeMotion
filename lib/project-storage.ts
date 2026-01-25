/**
 * IndexedDB storage for projects and assets
 * Handles the new video generation workflow
 */

import type { Project, UploadedAsset, DEFAULT_THEME } from "./types";

const DB_NAME = "stan-video-generator";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const ASSETS_STORE = "assets";

class ProjectStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Projects store
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const projectStore = db.createObjectStore(PROJECTS_STORE, {
            keyPath: "id",
          });
          projectStore.createIndex("status", "status", { unique: false });
          projectStore.createIndex("createdAt", "createdAt", { unique: false });
        }

        // Assets store (separate for better performance)
        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          const assetStore = db.createObjectStore(ASSETS_STORE, {
            keyPath: "id",
          });
          assetStore.createIndex("projectId", "projectId", { unique: false });
          assetStore.createIndex("type", "type", { unique: false });
        }
      };
    });
  }

  private async ensureDb(): Promise<void> {
    if (!this.db) await this.init();
  }

  // ============================================
  // Project Operations
  // ============================================

  async createProject(
    name: string,
    theme: typeof DEFAULT_THEME
  ): Promise<Project> {
    await this.ensureDb();

    const project: Project = {
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      assets: [],
      theme,
      prompt: "",
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, "readwrite");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.add(project);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(project);
    });
  }

  async getProject(id: string): Promise<Project | null> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, "readonly");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async updateProject(project: Project): Promise<void> {
    await this.ensureDb();

    project.updatedAt = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, "readwrite");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(project);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.ensureDb();

    // Delete associated assets first
    await this.deleteProjectAssets(id);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, "readwrite");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllProjects(): Promise<Project[]> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROJECTS_STORE, "readonly");
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const projects = request.result as Project[];
        projects.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(projects);
      };
    });
  }

  // ============================================
  // Asset Operations
  // ============================================

  async addAsset(
    projectId: string,
    asset: UploadedAsset
  ): Promise<UploadedAsset> {
    await this.ensureDb();

    const assetWithProject = { ...asset, projectId };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(ASSETS_STORE, "readwrite");
      const store = transaction.objectStore(ASSETS_STORE);
      const request = store.add(assetWithProject);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(asset);
    });
  }

  async getAsset(id: string): Promise<UploadedAsset | null> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(ASSETS_STORE, "readonly");
      const store = transaction.objectStore(ASSETS_STORE);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getProjectAssets(projectId: string): Promise<UploadedAsset[]> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(ASSETS_STORE, "readonly");
      const store = transaction.objectStore(ASSETS_STORE);
      const index = store.index("projectId");
      const request = index.getAll(projectId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const assets = request.result as UploadedAsset[];
        assets.sort((a, b) => a.createdAt - b.createdAt);
        resolve(assets);
      };
    });
  }

  async deleteAsset(id: string): Promise<void> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(ASSETS_STORE, "readwrite");
      const store = transaction.objectStore(ASSETS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteProjectAssets(projectId: string): Promise<void> {
    await this.ensureDb();

    const assets = await this.getProjectAssets(projectId);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(ASSETS_STORE, "readwrite");
      const store = transaction.objectStore(ASSETS_STORE);

      let completed = 0;
      if (assets.length === 0) {
        resolve();
        return;
      }

      for (const asset of assets) {
        const request = store.delete(asset.id);
        request.onsuccess = () => {
          completed++;
          if (completed === assets.length) resolve();
        };
        request.onerror = () => reject(request.error);
      }
    });
  }

  // ============================================
  // Utility Operations
  // ============================================

  async clearAll(): Promise<void> {
    await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [PROJECTS_STORE, ASSETS_STORE],
        "readwrite"
      );

      const projectStore = transaction.objectStore(PROJECTS_STORE);
      const assetStore = transaction.objectStore(ASSETS_STORE);

      projectStore.clear();
      assetStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Singleton instance
export const projectStorage = new ProjectStorage();

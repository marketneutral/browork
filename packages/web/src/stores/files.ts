import { create } from "zustand";

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "directory";
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "conflict" | "idle";

interface FilesState {
  entries: FileEntry[];
  selectedFile: string | null;
  openFile: {
    path: string;
    content: string;
    lastModified: string;
    dirty: boolean;
  } | null;
  saveStatus: SaveStatus;
  uploading: boolean;
  uploadProgress: number;

  // Actions
  clearAll: () => void;
  setEntries: (entries: FileEntry[]) => void;
  selectFile: (path: string | null) => void;
  openFileForEdit: (path: string, content: string, lastModified: string) => void;
  updateOpenFileContent: (content: string) => void;
  markSaved: (lastModified: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
  closeFile: () => void;
  setUploading: (v: boolean, progress?: number) => void;
}

export const useFilesStore = create<FilesState>((set) => ({
  entries: [],
  selectedFile: null,
  openFile: null,
  saveStatus: "idle",
  uploading: false,
  uploadProgress: 0,

  clearAll: () =>
    set({
      entries: [],
      selectedFile: null,
      openFile: null,
      saveStatus: "idle",
      uploading: false,
      uploadProgress: 0,
    }),

  setEntries: (entries) => set({ entries }),

  selectFile: (path) => set({ selectedFile: path }),

  openFileForEdit: (path, content, lastModified) =>
    set({
      openFile: { path, content, lastModified, dirty: false },
      saveStatus: "saved",
    }),

  updateOpenFileContent: (content) =>
    set((s) => ({
      openFile: s.openFile ? { ...s.openFile, content, dirty: true } : null,
      saveStatus: "unsaved",
    })),

  markSaved: (lastModified) =>
    set((s) => ({
      openFile: s.openFile
        ? { ...s.openFile, lastModified, dirty: false }
        : null,
      saveStatus: "saved",
    })),

  setSaveStatus: (status) => set({ saveStatus: status }),

  closeFile: () => set({ openFile: null, saveStatus: "idle" }),

  setUploading: (v, progress = 0) =>
    set({ uploading: v, uploadProgress: progress }),
}));

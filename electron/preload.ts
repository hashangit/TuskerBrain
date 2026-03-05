import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Gmail OAuth
  startOAuth: () => ipcRenderer.invoke('gmail:start-oauth'),
  getAuthStatus: () => ipcRenderer.invoke('gmail:auth-status'),
  
  // Database operations
  dbQuery: (query: string, params: unknown[]) => 
    ipcRenderer.invoke('db:query', query, params),
  
  // AI operations
  generateSummary: (emailContent: string) => 
    ipcRenderer.invoke('ai:summarize', emailContent),
  
  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getAppPath: () => ipcRenderer.invoke('app:path'),
});

// Type definition for the exposed API
export interface ElectronAPI {
  startOAuth: () => Promise<void>;
  getAuthStatus: () => Promise<boolean>;
  dbQuery: (query: string, params: unknown[]) => Promise<unknown>;
  generateSummary: (emailContent: string) => Promise<string>;
  getAppVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

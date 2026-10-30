import type { ElectronAPI } from '@foundations/contracts/electron-api';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

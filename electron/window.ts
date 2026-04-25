import { BrowserWindow } from 'electron';
import path from 'path';

export function createMainWindow(dirname: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    icon: path.join(dirname, '../public/logo.png'),
    webPreferences: {
      preload: path.join(dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'TuskerBrain',
    show: false,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools();
  } else {
    window.loadFile(path.join(dirname, '../dist/index.html'));
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

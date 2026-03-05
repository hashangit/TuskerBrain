import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export class AutoUpdater {
  private checkInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs: number = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.setupIpc();
    this.setupAutoUpdaterEvents();
  }

  /**
   * Initialize auto-updater
   */
  async initialize(): Promise<void> {
    // Don't check for updates in development
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      log.info('Auto-updater: Skipping in development/test mode');
      return;
    }

    // Check for updates immediately on startup
    await this.checkForUpdates();

    // Schedule periodic checks
    this.schedulePeriodicCheck();
  }

  /**
   * Check for updates now
   */
  async checkForUpdates(): Promise<{ available: boolean; version?: string }> {
    try {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        log.info('Auto-updater: Skipping check in development/test mode');
        return { available: false };
      }

      const result = await autoUpdater.checkForUpdates();
      
      if (result && result.updateInfo) {
        const currentVersion = app.getVersion();
        const latestVersion = result.updateInfo.version;
        
        log.info(`Current version: ${currentVersion}, Latest: ${latestVersion}`);
        
        return {
          available: latestVersion !== currentVersion,
          version: latestVersion,
        };
      }

      return { available: false };
    } catch (error) {
      log.error('Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * Download the update
   */
  async downloadUpdate(): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        log.info('Auto-updater: Skipping download in development/test mode');
        return;
      }

      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error('Failed to download update:', error);
      throw error;
    }
  }

  /**
   * Quit and install the update
   */
  quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return app.getVersion();
  }

  /**
   * Cancel scheduled checks
   */
  cancelUpdate(): void {
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
      log.info('Auto-updater: Cancelled scheduled checks');
    }
  }

  /**
   * Schedule periodic update checks
   */
  private schedulePeriodicCheck(): void {
    this.checkInterval = setTimeout(async () => {
      await this.checkForUpdates();
      this.schedulePeriodicCheck();
    }, this.checkIntervalMs);
  }

  /**
   * Setup auto-updater event handlers
   */
  private setupAutoUpdaterEvents(): void {
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available. Current version:', info.version);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
    });

    autoUpdater.on('error', (error) => {
      log.error('Auto-updater error:', error);
    });

    autoUpdater.on('download-progress', (progress) => {
      log.info(`Download progress: ${progress.percent}%`);
    });
  }

  /**
   * Setup IPC handlers for renderer communication
   */
  private setupIpc(): void {
    ipcMain.handle('auto-updater:check-for-updates', async () => {
      try {
        return await this.checkForUpdates();
      } catch (error) {
        log.error('Error in check-for-updates IPC:', error);
        return { available: false, error: String(error) };
      }
    });

    ipcMain.handle('auto-updater:download-update', async () => {
      try {
        await this.downloadUpdate();
        return { success: true };
      } catch (error) {
        log.error('Error in download-update IPC:', error);
        return { success: false, error: String(error) };
      }
    });

    ipcMain.handle('auto-updater:quit-and-install', () => {
      this.quitAndInstall();
    });

    ipcMain.handle('auto-updater:get-current-version', () => {
      return this.getCurrentVersion();
    });

    ipcMain.handle('auto-updater:cancel-update', () => {
      this.cancelUpdate();
    });
  }
}

// Export singleton instance
export const autoUpdaterInstance = new AutoUpdater();

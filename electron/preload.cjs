// CommonJS preload script for Electron
// This file is used directly without build transformation

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Gmail OAuth
  startOAuth: (redirectPort) =>
    ipcRenderer.invoke('gmail:oauth:start', { redirectPort }),
  handleOAuthCallback: (code, state) =>
    ipcRenderer.invoke('gmail:oauth:callback', { code, state }),
  refreshOAuthToken: () =>
    ipcRenderer.invoke('gmail:oauth:refresh'),
  revokeOAuthToken: () =>
    ipcRenderer.invoke('gmail:oauth:revoke'),
  getAuthStatus: () =>
    ipcRenderer.invoke('gmail:oauth:status'),

  // LLM Provider
  listProviders: () =>
    ipcRenderer.invoke('llm:provider:list'),
  setProvider: (providerId, apiKey) =>
    ipcRenderer.invoke('llm:provider:set', { providerId, apiKey }),
  validateProvider: (providerId) =>
    ipcRenderer.invoke('llm:provider:validate', { providerId }),
  testProvider: (providerId, prompt) =>
    ipcRenderer.invoke('llm:provider:test', { providerId, prompt }),

  // Jobs
  listJobs: (status, limit) =>
    ipcRenderer.invoke('jobs:list', { status, limit }),
  createJob: (type, payload, emailId, scheduledAt) =>
    ipcRenderer.invoke('jobs:create', { type, payload, emailId, scheduledAt }),
  cancelJob: (jobId) =>
    ipcRenderer.invoke('jobs:cancel', { jobId }),
  getJobStatus: (jobId) =>
    ipcRenderer.invoke('jobs:status', { jobId }),
  pauseJobs: () =>
    ipcRenderer.invoke('jobs:pause'),
  resumeJobs: () =>
    ipcRenderer.invoke('jobs:resume'),

  // Settings
  getSetting: (key) =>
    ipcRenderer.invoke('settings:get', { key }),
  setSetting: (key, value) =>
    ipcRenderer.invoke('settings:set', { key, value }),
  resetSetting: (key) =>
    ipcRenderer.invoke('settings:reset', { key }),

  // Sync
  startSync: (lookbackDays, incremental) =>
    ipcRenderer.invoke('sync:start', { lookbackDays, incremental }),
  getSyncStatus: () =>
    ipcRenderer.invoke('sync:status'),
  cancelSync: () =>
    ipcRenderer.invoke('sync:cancel'),

  // Timeline
  listTimelineUpdates: (options) =>
    ipcRenderer.invoke('timeline:list', options),
  getTimelineWeekSenders: (options) =>
    ipcRenderer.invoke('timeline:week-senders', options),
  getTimelineMonthStats: (options) =>
    ipcRenderer.invoke('timeline:month-stats', options),
  getTimelineYearStats: (options) =>
    ipcRenderer.invoke('timeline:year-stats', options),

  // Topics
  listTopics: () =>
    ipcRenderer.invoke('topics:list'),

  // Deals
  listDeals: (options) =>
    ipcRenderer.invoke('deals:list', options),
  markDealAsUsed: (dealId) =>
    ipcRenderer.invoke('deals:mark-used', dealId),
  undoMarkDealAsUsed: (dealId) =>
    ipcRenderer.invoke('deals:undo-mark-used', dealId),
  dismissDeal: (dealId) =>
    ipcRenderer.invoke('deals:dismiss', dealId),
  undoDismissDeal: (dealId) =>
    ipcRenderer.invoke('deals:undo-dismiss', dealId),

  // Senders
  listSenders: () =>
    ipcRenderer.invoke('senders:list'),
});

// CommonJS preload script for Electron
// This file is used directly without build transformation
// Note: This is the actual preload script used by Electron

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
  setProvider: (providerId, apiKey, model) =>
    ipcRenderer.invoke('llm:provider:set', { providerId, apiKey, model }),
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
  getSenderDetail: (domain) =>
    ipcRenderer.invoke('senders:get-detail', domain),

  // Action Items
  toggleActionItem: (id) =>
    ipcRenderer.invoke('action-items:toggle', id),

  // Topics
  getTopicDetail: (topicId) =>
    ipcRenderer.invoke('topics:get-detail', topicId),

  // Email List
  listEmails: (options) =>
    ipcRenderer.invoke('emails:list', options),

  // Email Detail
  getEmailDetail: (emailId) =>
    ipcRenderer.invoke('emails:get-detail', emailId),

  // Email Reply
  sendReply: (emailId, body) =>
    ipcRenderer.invoke('emails:send-reply', { emailId, body }),

  // Shell
  openExternal: (url) =>
    ipcRenderer.invoke('shell:openExternal', url),

  // Backfill
  startBackfill: (lookbackDays) =>
    ipcRenderer.invoke('sync:start-backfill', { lookbackDays }),

  // Sync Progress Events
  onSyncProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sync:progress', listener);
    return () => ipcRenderer.removeListener('sync:progress', listener);
  },
  onSyncComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sync:complete', listener);
    return () => ipcRenderer.removeListener('sync:complete', listener);
  },
  onSyncError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('sync:error', listener);
    return () => ipcRenderer.removeListener('sync:error', listener);
  },

  // Processing Progress Events
  onProcessingStarted: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('processing:started', listener);
    return () => ipcRenderer.removeListener('processing:started', listener);
  },
  onProcessingProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('processing:progress', listener);
    return () => ipcRenderer.removeListener('processing:progress', listener);
  },
  onProcessingComplete: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('processing:complete', listener);
    return () => ipcRenderer.removeListener('processing:complete', listener);
  },
  onProcessingFailed: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('processing:failed', listener);
    return () => ipcRenderer.removeListener('processing:failed', listener);
  },
  onProcessingError: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('processing:error', listener);
    return () => ipcRenderer.removeListener('processing:error', listener);
  },

  // Backfill Events
  onBackfillProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('backfill:progress', listener);
    return () => ipcRenderer.removeListener('backfill:progress', listener);
  },
  onBackfillComplete: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('backfill:complete', listener);
    return () => ipcRenderer.removeListener('backfill:complete', listener);
  },
});

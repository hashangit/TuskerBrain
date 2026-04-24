import type { GmailClient } from '@core/gmail/client';

/**
 * Creates a GmailClient that proxies all operations to the main process via parentPort.
 * Used in the utility process where the real GmailClient (with OAuth) lives in main.
 */
export function createProxiedGmailClient(): GmailClient {
  const port = process.parentPort;
  if (!port) {
    throw new Error('createProxiedGmailClient must be called in an Electron utility process (process.parentPort is not available)');
  }

  const request = (method: string, args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `gmail_${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const timeout = setTimeout(() => {
        port.removeListener('message', handler);
        reject(new Error(`Gmail proxy timeout for ${method}`));
      }, 30000);

      const handler = (msg: any) => {
        if (msg.type === 'gmail-response' && msg.requestId === requestId) {
          clearTimeout(timeout);
          port.removeListener('message', handler);
          if (msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
        }
      };

      port.on('message', handler);
      port.postMessage({
        type: 'gmail-request',
        method,
        args,
        requestId,
      });
    });
  };

  return {
    listMessages: async (options?) => request('listMessages', [options]),
    getMessage: async (id) => request('getMessage', [id]),
    modifyMessage: async (id, mods) => request('modifyMessage', [id, mods]),
    batchModifyMessages: async (ids, mods) => request('batchModifyMessages', [ids, mods]),
    createLabel: async (name) => request('createLabel', [name]),
    listLabels: async () => request('listLabels', []),
    getProfile: async () => request('getProfile', []),
    sendReply: async (options) => request('sendReply', [options]),
  } as GmailClient;
}

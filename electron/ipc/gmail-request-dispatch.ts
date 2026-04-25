import type { GmailClient } from '@core/gmail/client';

type GmailRequestClient = Partial<
  Pick<
    GmailClient,
    | 'listMessages'
    | 'listHistory'
    | 'getMessage'
    | 'modifyMessage'
    | 'batchModifyMessages'
    | 'listLabels'
    | 'createLabel'
    | 'getProfile'
    | 'sendReply'
  >
>;

type GmailRequestMethod = keyof GmailRequestClient;
type GmailRequestDispatcher = (client: GmailRequestClient, args: unknown[]) => Promise<unknown>;

const gmailRequestDispatchers: Record<GmailRequestMethod, GmailRequestDispatcher> = {
  listMessages: (client, args) => callMethod(client, 'listMessages', args),
  listHistory: (client, args) => callMethod(client, 'listHistory', args),
  getMessage: (client, args) => callMethod(client, 'getMessage', args),
  modifyMessage: (client, args) => callMethod(client, 'modifyMessage', args),
  batchModifyMessages: (client, args) => callMethod(client, 'batchModifyMessages', args),
  listLabels: (client, args) => callMethod(client, 'listLabels', args),
  createLabel: (client, args) => callMethod(client, 'createLabel', args),
  getProfile: (client, args) => callMethod(client, 'getProfile', args),
  sendReply: (client, args) => callMethod(client, 'sendReply', args),
};

function requireMethod<Method extends GmailRequestMethod>(
  client: GmailRequestClient,
  method: Method
): NonNullable<GmailRequestClient[Method]> {
  const fn = client[method];
  if (typeof fn !== 'function') {
    throw new Error(`Gmail method ${method} is unavailable`);
  }
  return fn;
}

function callMethod(
  client: GmailRequestClient,
  method: GmailRequestMethod,
  args: unknown[]
): Promise<unknown> {
  const fn = requireMethod(client, method) as (...methodArgs: unknown[]) => Promise<unknown>;
  return fn.apply(client, args);
}

export function isAllowedGmailRequestMethod(method: string): method is GmailRequestMethod {
  return Object.prototype.hasOwnProperty.call(gmailRequestDispatchers, method);
}

export async function dispatchGmailRequest(
  client: GmailRequestClient,
  method: string,
  args: unknown[]
): Promise<unknown> {
  if (!isAllowedGmailRequestMethod(method)) {
    throw new Error(`Gmail method ${method} is not allowed`);
  }

  return gmailRequestDispatchers[method](client, args);
}

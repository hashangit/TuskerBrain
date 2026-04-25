import { describe, expect, it, vi } from 'vitest';
import { dispatchGmailRequest, isAllowedGmailRequestMethod } from '../../electron/ipc/gmail-request-dispatch';

describe('Gmail request dispatch', () => {
  it('dispatches allowlisted Gmail methods with their arguments', async () => {
    const client = {
      prefix: 'email',
      getMessage: vi.fn(function (this: { prefix: string }, id: string) {
        return Promise.resolve({ id: `${this.prefix}-${id}` });
      }),
    };

    await expect(dispatchGmailRequest(client, 'getMessage', ['1'])).resolves.toEqual({
      id: 'email-1',
    });

    expect(client.getMessage).toHaveBeenCalledWith('1');
  });

  it('rejects method names outside the Gmail proxy allowlist', async () => {
    const client = {
      getMessage: vi.fn(),
      dangerousInternalMethod: vi.fn(),
    };

    await expect(
      dispatchGmailRequest(client, 'dangerousInternalMethod', [])
    ).rejects.toThrow('Gmail method dangerousInternalMethod is not allowed');

    expect(client.dangerousInternalMethod).not.toHaveBeenCalled();
  });

  it('keeps the allowlist explicit', () => {
    expect(isAllowedGmailRequestMethod('getMessage')).toBe(true);
    expect(isAllowedGmailRequestMethod('__proto__')).toBe(false);
  });
});

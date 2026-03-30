import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Utility Process Entry Point', () => {
  let mockParentPort: { on: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockParentPort = {
      on: vi.fn(),
      postMessage: vi.fn(),
    };
    (process as any).parentPort = mockParentPort;
  });

  it('should register message listener on process.parentPort', async () => {
    vi.resetModules();
    await import('@electron/utility/index');
    expect(mockParentPort.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should send ready message on startup', async () => {
    vi.resetModules();
    await import('@electron/utility/index');
    expect(mockParentPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready' })
    );
  });

  it('should handle unknown message type', async () => {
    vi.resetModules();
    const { handleMessage } = await import('@electron/utility/index');
    await handleMessage({ type: 'unknown-command' } as any);
    expect(mockParentPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});

import { useState, useCallback } from 'react';
import type { Email } from '../../core/types/email';

/**
 * Hook to fetch emails from the backend via IPC
 */
export function useEmailsData(options?: {
  type?: string;
  processed?: boolean;
  limit?: number;
}) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = (window as any).electronAPI;
      if (!api?.listEmails) {
        setEmails([]);
        return;
      }

      const result = await api.listEmails(options);

      if (result.success && result.data) {
        const mapped: Email[] = result.data.emails.map((e: any) => ({
          id: e.id,
          threadId: e.threadId,
          senderEmail: e.senderEmail,
          senderName: e.senderName ?? undefined,
          senderDomain: e.senderDomain,
          subject: e.subject ?? undefined,
          snippet: e.snippet ?? undefined,
          receivedAt: new Date(e.receivedAt),
          emailType: e.emailType ?? undefined,
          gmailCategory: e.gmailCategory ?? undefined,
          isProcessed: e.isProcessed,
          isRead: e.isRead,
          isImportant: e.isImportant,
        }));
        setEmails(mapped);
      } else {
        setError(result.error ?? 'Failed to load emails');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setIsLoading(false);
    }
  }, [options?.type, options?.processed, options?.limit]);

  return {
    emails,
    isLoading,
    error,
    fetchEmails,
  };
}

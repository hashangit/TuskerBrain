import { useState, useEffect, useCallback } from 'react';
import type { Email } from '@foundations/types/email';

/**
 * Hook to fetch emails from the backend
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
      // In a real implementation, this would fetch from the database via IPC
      // For now, we'll simulate with a timeout
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data for development
      const mockEmails: Email[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          senderEmail: 'notifications@chase.com',
          senderName: 'Chase Bank',
          senderDomain: 'chase.com',
          subject: 'Your statement is ready',
          snippet: 'Your January statement is now available for viewing...',
          receivedAt: new Date('2024-01-20'),
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          senderEmail: 'no-reply@amazon.com',
          senderName: 'Amazon',
          senderDomain: 'amazon.com',
          subject: 'Your order has shipped',
          snippet: 'Your package is on its way...',
          receivedAt: new Date('2024-01-19'),
        },
      ];

      setEmails(mockEmails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    emails,
    isLoading,
    error,
    fetchEmails,
  };
}

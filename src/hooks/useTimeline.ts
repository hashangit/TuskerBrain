import { useState, useEffect, useCallback } from 'react';
import { useTimelineStore, selectFilteredUpdates, selectHighPriorityUpdates, selectActionItems } from '../stores/timeline';
import type { TimelineUpdate } from '../components/Timeline';

/**
 * Hook to fetch timeline updates from the backend
 */
export function useTimelineData() {
  const { updates, isLoading, error, setLoading, setError, setUpdates } = useTimelineStore();
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In a real implementation, this would fetch from the database via IPC
      // For now, we'll simulate with a timeout
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data for development
      const mockUpdates: TimelineUpdate[] = [
        {
          id: '1',
          title: 'Bank Statement Ready',
          description: 'Your January statement is now available',
          priority: 'medium',
          createdAt: new Date('2024-01-20'),
          emailId: 'email-1',
        },
        {
          id: '2',
          title: 'Action Required',
          description: 'Please review the attached document',
          priority: 'high',
          createdAt: new Date('2024-01-19'),
          emailId: 'email-2',
        },
      ];

      setUpdates(mockUpdates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline updates');
    } finally {
      setLoading(false);
    }
  }, [setUpdates, setLoading, setError]);

  return {
    updates,
    isLoading,
    error,
    refresh,
    highPriorityUpdates: selectHighPriorityUpdates(useTimelineStore),
    actionItems: selectActionItems(useTimelineStore),
  };
}

/**
 * Hook to fetch topics from the backend
 */
export function useTopicsData() {
  const [topics, setTopics] = useState<Array<{
    id: string;
    name: string;
    fullPath: string;
    emailCount: number;
    summary?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // In a real implementation, this would fetch from the database via IPC
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data for development
      const mockTopics = [
        {
          id: '1',
          name: 'Chase',
          fullPath: 'Banking/Chase',
          emailCount: 15,
          summary: 'Banking notifications and statements from Chase.',
        },
        {
          id: '2',
          name: 'Amazon',
          fullPath: 'Shopping/Amazon',
          emailCount: 42,
          summary: 'Order confirmations and delivery updates from Amazon.',
        },
      ];

      setTopics(mockTopics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    topics,
    isLoading,
    error,
    fetchTopics,
  };
}

/**
 * Hook to fetch deals from the backend
 */
export function useDealsData() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // In a real implementation, this would fetch from the database via IPC
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data for development
      const mockDeals: Deal[] = [
        {
          id: '1',
          brand: 'Amazon',
          title: '20% Off Electronics',
          code: 'SAVE20',
          expiry: new Date('2024-02-28'),
          isActive: true,
        },
        {
          id: '2',
          brand: 'Best Buy',
          title: 'Free Shipping',
          code: null,
          isActive: true,
        },
      ];

      setDeals(mockDeals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    deals,
    isLoading,
    error,
    fetchDeals,
  };
}

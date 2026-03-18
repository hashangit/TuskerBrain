import { useState, useEffect, useCallback } from 'react';
import { useTimelineStore, selectFilteredUpdates, selectHighPriorityUpdates, selectActionItems, type TimelineUpdate } from '../stores/timeline';

/**
 * Deal type for promotional deals extracted from emails
 */
export interface Deal {
  id: string;
  emailId: string;
  brand: string;
  title: string;
  description?: string;
  code?: string | null;
  value?: string | null;
  expiry?: string | null;
  link?: string | null;
  category?: string | null;
  isActive: boolean;
}

/**
 * Topic type for hierarchical topics
 */
export interface Topic {
  id: string;
  parentId: string | null;
  name: string;
  fullPath: string;
  emailCount: number;
  summary?: string | null;
  createdAt: string;
}

/**
 * Hook to fetch timeline updates from the backend via IPC
 */
export function useTimelineData() {
  const { updates, isLoading, error, setLoading, setError, setUpdates } = useTimelineStore();
  const highPriorityUpdates = useTimelineStore(selectHighPriorityUpdates);
  const actionItems = useTimelineStore(selectActionItems);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch from IPC
      const result = await window.electronAPI.listTimelineUpdates();

      if (result.success && result.data) {
        const timelineUpdates: TimelineUpdate[] = result.data.updates.map((u: any) => ({
          id: u.id,
          emailId: u.emailId,
          title: u.title,
          description: u.description || undefined,
          summary: u.summary || undefined,
          priority: u.priority || undefined,
          sentiment: u.sentiment || undefined,
          urgency: u.urgency || false,
          actionItem: u.actionItem || false,
          actionItemTitle: u.actionItemTitle || undefined,
          followUpDate: u.followUpDate || undefined,
          financialImpact: u.financialImpact || undefined,
          keyEntities: u.keyEntities || undefined,
          createdAt: u.createdAt,
        }));
        setUpdates(timelineUpdates);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline updates');
    } finally {
      setLoading(false);
    }
  }, [setUpdates, setLoading, setError]);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    updates,
    isLoading,
    error,
    refresh,
    highPriorityUpdates,
    actionItems,
  };
}

/**
 * Hook to fetch topics from the backend via IPC
 */
export function useTopicsData() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch from IPC
      const result = await window.electronAPI.listTopics();

      if (result.success && result.data) {
        setTopics(result.data.topics);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  return {
    topics,
    isLoading,
    error,
    fetchTopics,
  };
}

/**
 * Hook to fetch deals from the backend via IPC
 */
export function useDealsData() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async (activeOnly: boolean = true) => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch from IPC
      const result = await window.electronAPI.listDeals({ activeOnly });

      if (result.success && result.data) {
        setDeals(result.data.deals.map((d: any) => ({
          id: d.id,
          emailId: d.emailId,
          brand: d.brandName || 'Unknown',
          title: d.dealTitle,
          description: d.dealDescription || undefined,
          code: d.dealCode || null,
          value: d.dealValue || null,
          expiry: d.dealExpiry || null,
          link: d.dealLink || null,
          category: d.dealCategory || null,
          isActive: d.isActive,
        })));
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  return {
    deals,
    isLoading,
    error,
    fetchDeals,
  };
}

/**
 * Hook to fetch sender summaries from the backend via IPC
 */
export function useSendersData() {
  const [senders, setSenders] = useState<Array<{
    id: string;
    senderDomain: string;
    summary: string;
    wordCount: number | null;
    lastUpdated: string;
    updateCount: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSenders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch from IPC
      const result = await window.electronAPI.listSenders();

      if (result.success && result.data) {
        setSenders(result.data.senders);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load senders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  return {
    senders,
    isLoading,
    error,
    fetchSenders,
  };
}

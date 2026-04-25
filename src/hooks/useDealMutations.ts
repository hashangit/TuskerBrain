import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { updateDealById, type DealData } from './dealData';

export type DealMutationApi = Pick<
  NonNullable<Window['electronAPI']>,
  'dismissDeal' | 'markDealAsUsed' | 'undoDismissDeal' | 'undoMarkDealAsUsed'
>;

interface DealMutationLogger {
  error: (...args: unknown[]) => void;
}

export interface UseDealMutationsOptions {
  setDeals: Dispatch<SetStateAction<DealData[]>>;
  api?: DealMutationApi | null;
  logger?: DealMutationLogger;
  now?: () => Date;
}

function getWindowDealApi(): DealMutationApi | null {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return null;
  }
  return window.electronAPI;
}

export function useDealMutations({
  setDeals,
  api = getWindowDealApi(),
  logger = console,
  now = () => new Date(),
}: UseDealMutationsOptions) {
  const applyDealUpdate = useCallback((dealId: string, update: (deal: DealData) => DealData) => {
    setDeals((prev) => updateDealById(prev, dealId, update));
  }, [setDeals]);

  const persistDealMutation = useCallback(
    async (
      dealId: string,
      optimisticUpdate: (deal: DealData) => DealData,
      rollbackUpdate: (deal: DealData) => DealData,
      persist: (dealApi: DealMutationApi) => Promise<unknown> | unknown,
      errorMessage: string
    ) => {
      applyDealUpdate(dealId, optimisticUpdate);

      if (!api) {
        return;
      }

      try {
        await persist(api);
      } catch (error) {
        logger.error(errorMessage, error);
        applyDealUpdate(dealId, rollbackUpdate);
        throw error;
      }
    },
    [api, applyDealUpdate, logger]
  );

  const handleMarkDealUsed = useCallback(
    async (dealId: string) =>
      persistDealMutation(
        dealId,
        (deal) => ({ ...deal, usedAt: now(), status: 'used' as const }),
        (deal) => ({ ...deal, usedAt: undefined, status: 'active' as const }),
        (dealApi) => dealApi.markDealAsUsed(dealId),
        '[App] Failed to mark deal as used:'
      ),
    [now, persistDealMutation]
  );

  const handleUnmarkDealUsed = useCallback(
    async (dealId: string) =>
      persistDealMutation(
        dealId,
        (deal) => ({ ...deal, usedAt: undefined, status: 'active' as const }),
        (deal) => ({ ...deal, usedAt: now(), status: 'used' as const }),
        (dealApi) => dealApi.undoMarkDealAsUsed(dealId),
        '[App] Failed to unmark deal:'
      ),
    [now, persistDealMutation]
  );

  const handleDismissDeal = useCallback(
    async (dealId: string) =>
      persistDealMutation(
        dealId,
        (deal) => ({ ...deal, dismissedAt: now(), status: 'dismissed' as const }),
        (deal) => ({ ...deal, dismissedAt: undefined, status: 'active' as const }),
        (dealApi) => dealApi.dismissDeal(dealId),
        '[App] Failed to dismiss deal:'
      ),
    [now, persistDealMutation]
  );

  const handleRestoreDeal = useCallback(
    async (dealId: string) =>
      persistDealMutation(
        dealId,
        (deal) => ({ ...deal, dismissedAt: undefined, status: 'active' as const }),
        (deal) => ({ ...deal, dismissedAt: now(), status: 'dismissed' as const }),
        (dealApi) => dealApi.undoDismissDeal(dealId),
        '[App] Failed to restore deal:'
      ),
    [now, persistDealMutation]
  );

  return {
    handleMarkDealUsed,
    handleUnmarkDealUsed,
    handleDismissDeal,
    handleRestoreDeal,
  };
}
